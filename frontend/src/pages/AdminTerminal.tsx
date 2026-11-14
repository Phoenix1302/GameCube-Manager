import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  Terminal as TerminalIcon,
  RefreshCw,
  Maximize2,
  Minimize2,
  CornerDownLeft,
  Trash2,
} from 'lucide-react';

export const AdminTerminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create xterm.js instance with Steam gaming dark palette
    const term = new XTerm({
      theme: {
        background: '#090d13',
        foreground: '#e2e8f0',
        cursor: '#1a9fff',
        cursorAccent: '#090d13',
        selectionBackground: 'rgba(26, 159, 255, 0.4)',
        black: '#17202d',
        red: '#d94b4b',
        green: '#5ba32b',
        yellow: '#e5a93c',
        blue: '#1a9fff',
        magenta: '#b277db',
        cyan: '#00d8d8',
        white: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    connectTerminalWs(term, fitAddon);

    const handleResize = () => {
      if (fitAddonRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        fitAddonRef.current.fit();
        const { cols, rows } = fitAddonRef.current.proposeDimensions() || { cols: 80, rows: 24 };
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, []);

  const connectTerminalWs = (term: XTerm, fitAddon: FitAddon) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      term.writeln('\x1b[1;36m🎮 Подключение к хост-системе GameCube-Manager установлено.\x1b[0m');
      term.writeln('\x1b[90mИнтерактивный доступ к хост-системе (~/home/gamecube)\x1b[0m\r\n');

      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onclose = () => {
      setConnected(false);
      term.writeln('\r\n\x1b[1;31m[Соединение с терминалом закрыто]\x1b[0m');
    };

    ws.onerror = () => {
      setConnected(false);
      term.writeln('\r\n\x1b[1;31m[Ошибка WebSocket соединения с терминалом]\x1b[0m');
    };

    // User typing input to terminal
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  };

  const sendCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd + '\r');
    }
  };

  const handleReconnect = () => {
    if (xtermInstance.current && fitAddonRef.current) {
      xtermInstance.current.clear();
      connectTerminalWs(xtermInstance.current, fitAddonRef.current);
    }
  };

  return (
    <div
      className={`transition-all duration-200 ${
        fullscreen
          ? 'fixed inset-0 z-50 bg-[#090d13] p-4 flex flex-col'
          : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300'
      }`}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <TerminalIcon className="w-6 h-6 text-steam-cyan" />
            Root Web Terminal
          </h1>
          {!fullscreen && (
            <p className="text-xs text-slate-400 mt-0.5">
              Полноценная интерактивная оболочка (PTY bash) с прямым доступом к хост-системе (chroot).
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-steam-card border border-steam-border text-xs font-semibold">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 animate-pulse shadow-md shadow-emerald-400/50' : 'bg-red-500'
              }`}
            />
            <span className="text-slate-300">{connected ? 'Подключен' : 'Отключен'}</span>
          </div>

          <button
            onClick={handleReconnect}
            className="p-1.5 rounded-lg bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white border border-steam-border transition-colors"
            title="Переподключить сессию"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setFullscreen(!fullscreen);
              setTimeout(() => fitAddonRef.current?.fit(), 150);
            }}
            className="p-1.5 rounded-lg bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white border border-steam-border transition-colors"
            title={fullscreen ? 'Свернуть' : 'Развернуть во весь экран'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Quick Commands Snippets Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none text-xs">
        <span className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider flex-shrink-0">
          Быстрые команды:
        </span>
        {[
          { label: 'htop', cmd: 'htop' },
          { label: 'ls -la ~', cmd: 'ls -la ~' },
          { label: 'ls -la /mnt/game_data', cmd: 'ls -la /mnt/game_data' },
          { label: 'systemctl --user status', cmd: 'systemctl --user status' },
          { label: 'uname -a', cmd: 'uname -a' },
          { label: 'df -h', cmd: 'df -h' },
          { label: 'clear', cmd: 'clear' },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => sendCommand(item.cmd)}
            className="px-2.5 py-1 rounded-md bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-steam-accent border border-steam-border/60 font-mono text-xs transition-colors whitespace-nowrap"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Terminal Viewport Container */}
      <div
        className={`rounded-2xl border border-steam-border/80 overflow-hidden shadow-2xl bg-[#090d13] ${
          fullscreen ? 'flex-1 h-full' : 'h-[420px] sm:h-[620px]'
        }`}
      >
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  );
};
