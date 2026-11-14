import React, { useState } from 'react';
import { ShieldAlert, ExternalLink, Heart, X } from 'lucide-react';

export const TorrentDisclaimer: React.FC<{ dismissible?: boolean }> = ({ dismissible = false }) => {
  const [closed, setClosed] = useState(false);

  if (closed) return null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-steam-card via-steam-nav to-slate-900 border border-steam-border/80 shadow-lg p-4 sm:p-5 mb-6">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-steam-blue via-steam-cyan to-steam-accent" />
      
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 max-w-3xl">
          <div className="p-2.5 rounded-lg bg-steam-blue/15 text-steam-accent border border-steam-blue/30 flex-shrink-0 mt-0.5">
            <Heart className="w-5 h-5 text-steam-accent" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>RuTracker.org & Поддержка разработчиков</span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-steam-blue/20 text-steam-blue border border-steam-blue/30">
                Совет
              </span>
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Встроенный клиент qBittorrent предназначен для удобной загрузки дистрибутивов и тестирования игр (например, релизов с RuTracker.org).
              Если проект вам понравился и вы проводите в нем время — <strong className="text-white">поддержите разработчиков покупкой игры в Steam!</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0 w-full md:w-auto">
          <a
            href="https://rutracker.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-steam-cardHover hover:bg-slate-700/80 text-slate-200 border border-steam-border transition-colors shadow-sm"
          >
            <span>RuTracker</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <a
            href="https://store.steampowered.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-steam-blue to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white shadow-md shadow-blue-500/20 transition-all"
          >
            <span>Steam Store</span>
            <ExternalLink className="w-3.5 h-3.5 text-white/80" />
          </a>

          {dismissible && (
            <button
              onClick={() => setClosed(true)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
              title="Закрыть уведомление"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
