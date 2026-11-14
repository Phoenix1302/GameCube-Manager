import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { settingsQueries } from '../db/index.js';

let nodePty: any = null;
let nodePtyChecked = false;

async function getNodePty() {
  if (nodePtyChecked) return nodePty;
  nodePtyChecked = true;
  try {
    nodePty = await import('node-pty');
  } catch (e) {
    console.warn('[Terminal] node-pty not available, fallback child_process shell will be used.');
  }
  return nodePty;
}

function detectHostUser(): { username: string; userHome: string } {
  // Check common gaming / host usernames on Linux
  const candidates = ['gamecube', 'bazzite', 'deck', 'steam', 'fedora'];
  for (const c of candidates) {
    if (fs.existsSync(`/host_root/home/${c}`)) {
      return { username: c, userHome: `/home/${c}` };
    }
  }

  // Check /host_root/home for any user directory
  if (fs.existsSync('/host_root/home')) {
    try {
      const entries = fs.readdirSync('/host_root/home');
      for (const entry of entries) {
        if (!entry.startsWith('.') && fs.statSync(`/host_root/home/${entry}`).isDirectory()) {
          return { username: entry, userHome: `/home/${entry}` };
        }
      }
    } catch {}
  }

  return { username: 'root', userHome: '/root' };
}

function getShellExecution(): { file: string; args: string[]; cwd: string; env: Record<string, string> } {
  if (config.isWindows) {
    return {
      file: process.env.COMSPEC || 'powershell.exe',
      args: [],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    };
  }

  // If running inside container with host root mounted at /host_root:
  // Use chroot to escape into host system as the real host user (e.g. gamecube)
  if (
    fs.existsSync('/host_root') &&
    (fs.existsSync('/host_root/bin/bash') || fs.existsSync('/host_root/usr/bin/bash'))
  ) {
    const { username, userHome } = detectHostUser();
    const hostUserHome = path.join('/host_root', userHome);
    const bashrcPath = path.join(hostUserHome, '.bashrc');

    // Launch interactive non-login shell with user's .bashrc.
    // Avoid -l / --login because Fedora's /etc/profile runs ttyname (which fails inside chroot)
    // and attempts to access /root/.bash_profile (which is inaccessible to rootless host user 1000).
    const args = ['/host_root', '/bin/bash', '--noprofile'];
    if (fs.existsSync(bashrcPath)) {
      args.push('--rcfile', `${userHome}/.bashrc`);
    } else if (fs.existsSync('/host_root/etc/bashrc')) {
      args.push('--rcfile', '/etc/bashrc');
    }
    args.push('-i');

    return {
      file: 'chroot',
      args,
      cwd: fs.existsSync(hostUserHome) ? hostUserHome : '/host_root',
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        PATH: '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin',
        HOME: userHome,
        USER: username,
        LOGNAME: username,
        SHELL: '/bin/bash',
        PWD: userHome,
        MESG: 'n',
      },
    };
  }

  const fallbackShell = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
  return {
    file: fallbackShell,
    args: ['--noprofile', '-i'],
    cwd: fs.existsSync('/host_root') ? '/host_root' : '/',
    env: {
      ...(process.env as Record<string, string>),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      MESG: 'n',
    },
  };
}

export async function terminalRoutes(fastify: FastifyInstance) {
  // Preload node-pty
  await getNodePty();

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const execConfig = getShellExecution();

    let ptyProcess: any = null;
    let fallbackProcess: any = null;

    if (nodePty && typeof nodePty.spawn === 'function') {
      try {
        ptyProcess = nodePty.spawn(execConfig.file, execConfig.args, {
          name: 'xterm-256color',
          cols: 100,
          rows: 30,
          cwd: execConfig.cwd,
          env: execConfig.env,
        });

        ptyProcess.onData((data: string) => {
          if (socket.readyState === socket.OPEN) {
            socket.send(data);
          }
        });

        ptyProcess.onExit(() => {
          if (socket.readyState === socket.OPEN) {
            socket.close();
          }
        });
      } catch (err) {
        console.error('[Terminal] Failed to spawn node-pty, using fallback:', err);
      }
    }

    if (!ptyProcess) {
      // Fallback using child_process
      fallbackProcess = spawn(execConfig.file, execConfig.args, {
        cwd: execConfig.cwd,
        env: execConfig.env,
        shell: false,
      });

      fallbackProcess.stdout?.on('data', (data: Buffer) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data.toString());
        }
      });

      fallbackProcess.stderr?.on('data', (data: Buffer) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data.toString());
        }
      });

      fallbackProcess.on('close', () => {
        if (socket.readyState === socket.OPEN) {
          socket.close();
        }
      });
    }

    // Handle incoming messages from xterm.js
    socket.on('message', (message: any) => {
      try {
        const raw = message.toString();

        // Check if message is JSON control command (e.g. resize)
        if (raw.startsWith('{') && raw.endsWith('}')) {
          const parsed = JSON.parse(raw);
          if (parsed.type === 'resize' && ptyProcess) {
            const cols = Number(parsed.cols) || 80;
            const rows = Number(parsed.rows) || 24;
            ptyProcess.resize(cols, rows);
            return;
          }
        }

        // Standard terminal input
        if (ptyProcess) {
          ptyProcess.write(raw);
        } else if (fallbackProcess && fallbackProcess.stdin) {
          fallbackProcess.stdin.write(raw);
        }
      } catch (err) {
        // Fallback write raw
        if (ptyProcess) {
          ptyProcess.write(message.toString());
        } else if (fallbackProcess && fallbackProcess.stdin) {
          fallbackProcess.stdin.write(message.toString());
        }
      }
    });

    socket.on('close', () => {
      if (ptyProcess) {
        try {
          ptyProcess.kill();
        } catch {}
      }
      if (fallbackProcess) {
        try {
          fallbackProcess.kill();
        } catch {}
      }
    });

    socket.on('error', () => {
      if (ptyProcess) {
        try {
          ptyProcess.kill();
        } catch {}
      }
      if (fallbackProcess) {
        try {
          fallbackProcess.kill();
        } catch {}
      }
    });
  });
}
