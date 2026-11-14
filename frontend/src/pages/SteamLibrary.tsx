import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  Plus,
  Search,
  Sparkles,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  HardDrive,
  Cpu,
  Loader2,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import { SteamShortcut, SteamGridAsset } from '../types';

export const SteamLibrary: React.FC = () => {
  // Existing shortcuts
  const [shortcuts, setShortcuts] = useState<SteamShortcut[]>([]);
  const [loadingShortcuts, setLoadingShortcuts] = useState(true);

  // New shortcut wizard form
  const [appName, setAppName] = useState('');
  const [exePath, setExePath] = useState('');
  const [startDir, setStartDir] = useState('');
  const [launchOptions, setLaunchOptions] = useState('gamemoderun %command%');
  const [compatTool, setCompatTool] = useState('GE-Proton9-20');

  // SteamGridDB search & assets
  const [gridSearchTerm, setGridSearchTerm] = useState('');
  const [gridSearchResults, setGridSearchResults] = useState<any[]>([]);
  const [searchingGrid, setSearchingGrid] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);

  const [availablePosters, setAvailablePosters] = useState<SteamGridAsset[]>([]);
  const [availableHeroes, setAvailableHeroes] = useState<SteamGridAsset[]>([]);
  const [availableLogos, setAvailableLogos] = useState<SteamGridAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [selectedLogo, setSelectedLogo] = useState<string | null>(null);

  // Proton recommendation
  const [protonRecommendation, setProtonRecommendation] = useState<any | null>(null);
  const [loadingProton, setLoadingProton] = useState(false);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadShortcuts();
  }, []);

  const loadShortcuts = async () => {
    try {
      setLoadingShortcuts(true);
      const res = await api.get('/steam/shortcuts');
      setShortcuts(res.data.shortcuts || []);
    } catch (err) {
      console.error('Failed to load shortcuts', err);
    } finally {
      setLoadingShortcuts(false);
    }
  };

  const handleExeChange = (path: string) => {
    setExePath(path);
    if (!startDir && path) {
      // Suggest startDir as folder containing exe
      const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
      if (lastSlash > 0) {
        setStartDir(path.substring(0, lastSlash));
      }
    }
  };

  const searchSteamGrid = async () => {
    const term = gridSearchTerm.trim() || appName.trim();
    if (!term) return;

    try {
      setSearchingGrid(true);
      const res = await api.get('/steam/grid/search', { params: { q: term } });
      setGridSearchResults(res.data.games || []);
    } catch (err: any) {
      alert(`Ошибка поиска SteamGridDB: ${err.response?.data?.error || err.message}`);
    } finally {
      setSearchingGrid(false);
    }
  };

  const selectGridGame = async (gameId: number) => {
    setSelectedGameId(gameId);
    setLoadingAssets(true);
    try {
      const res = await api.get(`/steam/grid/assets/${gameId}`);
      setAvailablePosters(res.data.grids || []);
      setAvailableHeroes(res.data.heroes || []);
      setAvailableLogos(res.data.logos || []);

      if (res.data.grids?.[0]) setSelectedPoster(res.data.grids[0].url);
      if (res.data.heroes?.[0]) setSelectedHero(res.data.heroes[0].url);
      if (res.data.logos?.[0]) setSelectedLogo(res.data.logos[0].url);
    } catch (err) {
      console.error('Failed to load game assets', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const fetchProtonRecommendations = async (appId: string) => {
    try {
      setLoadingProton(true);
      const res = await api.get(`/steam/proton-recommendations/${appId}`);
      setProtonRecommendation(res.data);
      if (res.data.recommendedVersion) {
        setCompatTool(res.data.recommendedVersion);
      }
      if (res.data.launchOptions) {
        setLaunchOptions(res.data.launchOptions);
      }
    } catch (err) {
      console.error('Failed to get Proton recommendations', err);
    } finally {
      setLoadingProton(false);
    }
  };

  const handleSaveToSteam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim() || !exePath.trim()) {
      alert('Пожалуйста, укажите название игры и путь к исполняемому файлу');
      return;
    }

    setSaving(true);
    setSuccessMsg(null);

    try {
      // 1. Add shortcut to shortcuts.vdf
      const res = await api.post('/steam/shortcuts', {
        appName: appName.trim(),
        exe: exePath.trim(),
        startDir: startDir.trim() || undefined,
        launchOptions: launchOptions.trim() || undefined,
        compatTool,
      });

      const newAppId = res.data.appId;

      // 2. Download artworks if selected
      const downloads = [];
      if (selectedPoster) {
        downloads.push(
          api.post('/steam/grid/download', {
            appId: newAppId,
            assetType: 'poster',
            imageUrl: selectedPoster,
          })
        );
      }
      if (selectedHero) {
        downloads.push(
          api.post('/steam/grid/download', {
            appId: newAppId,
            assetType: 'hero',
            imageUrl: selectedHero,
          })
        );
      }
      if (selectedLogo) {
        downloads.push(
          api.post('/steam/grid/download', {
            appId: newAppId,
            assetType: 'logo',
            imageUrl: selectedLogo,
          })
        );
      }

      await Promise.allSettled(downloads);

      setSuccessMsg(
        `Игра «${appName}» успешно добавлена в библиотеку Steam! (AppID: ${newAppId}). Для отображения перезапустите клиент Steam или Steam Deck UI.`
      );

      // Reset form
      setAppName('');
      setExePath('');
      setStartDir('');
      setSelectedPoster(null);
      setSelectedHero(null);
      setSelectedLogo(null);
      setSelectedGameId(null);

      loadShortcuts();
    } catch (err: any) {
      alert(`Ошибка добавления в Steam: ${err.response?.data?.error || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
          <FolderSync className="w-7 h-7 text-steam-accent" />
          Интеграция сторонних игр со Steam
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Бесшовное добавление внешних игр в Steam Deck / SteamOS с автоматическим подбором обложек SteamGridDB и настройкой Proton.
        </p>
      </div>

      {successMsg && (
        <div className="p-4 mb-6 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Готово!</div>
            <div className="text-xs text-emerald-300/90 mt-0.5">{successMsg}</div>
          </div>
        </div>
      )}

      {/* Main Wizard Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveToSteam} className="p-6 rounded-2xl bg-steam-card border border-steam-border/80 shadow-xl space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-steam-blue" />
              Параметры запуска новой игры
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Название игры (в библиотеке Steam) *
              </label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Например: Cyberpunk 2077"
                required
                className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Путь к исполняемому файлу (.exe / .sh) *
              </label>
              <input
                type="text"
                value={exePath}
                onChange={(e) => handleExeChange(e.target.value)}
                placeholder="/host_root/games/Cyberpunk2077/bin/x64/Cyberpunk2077.exe"
                required
                className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Рабочая папка (StartDir)
                </label>
                <input
                  type="text"
                  value={startDir}
                  onChange={(e) => setStartDir(e.target.value)}
                  placeholder="/host_root/games/Cyberpunk2077/bin/x64"
                  className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Параметры запуска (Launch Options)
                </label>
                <input
                  type="text"
                  value={launchOptions}
                  onChange={(e) => setLaunchOptions(e.target.value)}
                  placeholder="gamemoderun %command%"
                  className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                />
              </div>
            </div>

            {/* Proton Version Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Инструмент совместимости Proton
              </label>
              <select
                value={compatTool}
                onChange={(e) => setCompatTool(e.target.value)}
                className="w-full bg-steam-nav text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
              >
                <option value="GE-Proton9-20">GE-Proton9-20 (Рекомендуется для пираток и игр с видеороликами)</option>
                <option value="Proton Experimental">Proton Experimental (Официальный Steam)</option>
                <option value="Proton 9.0">Proton 9.0</option>
                <option value="Proton 8.0">Proton 8.0</option>
                <option value="Proton Hotfix">Proton Hotfix</option>
                <option value="Wine-GE-latest">Wine-GE (Native Wine)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={saving || !appName.trim() || !exePath.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-steam-blue to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Сохранение в shortcuts.vdf и загрузка обложек...</span>
                </>
              ) : (
                <>
                  <FolderSync className="w-4 h-4" />
                  <span>Добавить игру в Steam и установить обложки</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* SteamGridDB Artworks Picker Sidebar */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-steam-card border border-steam-border/80 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-steam-cyan" />
              Обложки SteamGridDB
            </h3>
            <p className="text-xs text-slate-400">
              Найдите игру по названию, чтобы автоматически скачать постер (600x900), баннер (Hero) и логотип.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={gridSearchTerm}
                onChange={(e) => setGridSearchTerm(e.target.value)}
                placeholder={appName || 'Название игры...'}
                className="flex-1 bg-steam-nav text-slate-100 placeholder-slate-500 text-xs rounded-xl px-3 py-2 border border-steam-border focus:outline-none focus:border-steam-blue"
              />
              <button
                type="button"
                onClick={searchSteamGrid}
                disabled={searchingGrid}
                className="px-3 py-2 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-xs font-semibold"
              >
                {searchingGrid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Results list */}
            {gridSearchResults.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {gridSearchResults.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectGridGame(g.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                      selectedGameId === g.id
                        ? 'bg-steam-blue text-white'
                        : 'bg-steam-nav text-slate-300 hover:bg-steam-cardHover'
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Selected Posters Preview */}
            {loadingAssets ? (
              <div className="py-6 text-center text-xs text-slate-400">
                <Loader2 className="w-5 h-5 text-steam-blue animate-spin mx-auto mb-2" />
                Загрузка доступных артов...
              </div>
            ) : selectedPoster ? (
              <div className="space-y-3 pt-2 border-t border-steam-border/60">
                <div className="text-xs font-semibold text-slate-300">Выбранные обложки:</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="aspect-[2/3] bg-slate-900 rounded-lg overflow-hidden border border-steam-border">
                    <img src={selectedPoster} alt="Poster" className="w-full h-full object-cover" />
                  </div>
                  {selectedHero && (
                    <div className="aspect-[16/9] bg-slate-900 rounded-lg overflow-hidden border border-steam-border">
                      <img src={selectedHero} alt="Hero" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Existing Non-Steam Shortcuts Section */}
      <div className="bg-steam-card border border-steam-border/80 rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-slate-400" />
          Текущие ярлыки в shortcuts.vdf ({shortcuts.length})
        </h3>

        {loadingShortcuts ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <Loader2 className="w-6 h-6 text-steam-blue animate-spin mx-auto mb-2" />
            Чтение файла shortcuts.vdf...
          </div>
        ) : shortcuts.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            Сторонние игры пока не найдены в файле shortcuts.vdf. Добавьте первую игру через форму выше!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-steam-nav text-xs uppercase text-slate-400 font-semibold border-b border-steam-border">
                <tr>
                  <th className="px-4 py-3">Название</th>
                  <th className="px-4 py-3">Исполняемый файл</th>
                  <th className="px-4 py-3">Параметры запуска</th>
                  <th className="px-4 py-3">AppID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steam-border/50">
                {shortcuts.map((s, idx) => (
                  <tr key={idx} className="hover:bg-steam-cardHover/40 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-slate-100">{s.AppName}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400 max-w-xs truncate" title={s.Exe}>
                      {s.Exe}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">
                      {s.LaunchOptions || '—'}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-steam-accent">
                      {s.appid || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
