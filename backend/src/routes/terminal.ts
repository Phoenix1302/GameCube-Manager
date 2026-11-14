import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import fs from 'fs';
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

function getDefaultShell(): string {
  if (config.isWindows) {
    return process.env.COMSPEC || 'powershell.exe';
  }
  if (fs.existsSync('/bin/bash')) return '/bin/bash';
  if (fs.existsSync('/usr/bin/bash')) return '/usr/bin/bash';
  return '/bin/sh';
}

export async function terminalRoutes(fastify: FastifyInstance) {
  // Preload node-pty
  await getNodePty();

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const hostRoot = settingsQueries.get('host_root', config.hostRoot);
    const cwd = fs.existsSync(hostRoot) ? hostRoot : process.cwd();
    const shell = getDefaultShell();
    const shellArgs = config.isWindows ? [] : ['-l'];

    let ptyProcess: any = null;
    let fallbackProcess: any = null;

    if (nodePty && typeof nodePty.spawn === 'function') {
      try {
        ptyProcess = nodePty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 100,
          rows: 30,
          cwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
          },
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
      fallbackProcess = spawn(shell, shellArgs, {
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
        },
        shell: true,
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
