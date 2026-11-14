import React from 'react';
import { Gamepad2, ExternalLink } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-steam-border/60 bg-steam-nav/70 backdrop-blur-md text-slate-400 text-xs py-3.5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Brand & Version */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-steam-blue to-steam-cyan flex items-center justify-center text-white">
            <Gamepad2 className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-slate-200">GameCube Manager</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-steam-cyan/15 text-steam-cyan border border-steam-cyan/30">
            v1.0.0
          </span>
        </div>

        {/* Ecosystem Links */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <a
            href="https://www.protondb.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors inline-flex items-center gap-1"
          >
            <span>ProtonDB</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
          <span className="text-slate-600">•</span>
          <a
            href="https://store.steampowered.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors inline-flex items-center gap-1"
          >
            <span>Steam Store</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
          <span className="text-slate-600">•</span>
          <a
            href="https://rutracker.org"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors inline-flex items-center gap-1"
          >
            <span>RuTracker</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
        </div>

        {/* Copyright */}
        <div className="text-[11px] text-slate-500">
          © {new Date().getFullYear()} DIY Steam Machine
        </div>
      </div>
    </footer>
  );
};
