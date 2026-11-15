import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
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
  Gamepad2,
  FolderOpen,
  ArrowUpRight,
  RefreshCw,
  RotateCcw,
  Folder,
  Trash2,
  X,
  Check,
  FileCode,
  Settings2,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { SteamShortcut, SteamGridAsset } from '../types';

export const SteamLibrary: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { confirm, alert } = useConfirm();

  // Active view tab: installed games vs non-steam shortcuts
  const [activeTab, setActiveTab] = useState<'installed' | 'shortcuts'>('installed');

  // Installed Steam games state
  const [installedGames, setInstalledGames] = useState<any[]>([]);
  const [libraries, setLibraries] = useState<any[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(true);
  const [installedSearch, setInstalledSearch] = useState('');
  const [selectedLibraryPath, setSelectedLibraryPath] = useState<string | null>(null);

  // Existing shortcuts
  const [shortcuts, setShortcuts] = useState<SteamShortcut[]>([]);
  const [loadingShortcuts, setLoadingShortcuts] = useState(true);

  // Smart Add to Steam Modal state
  const [smartModalOpen, setSmartModalOpen] = useState(false);
  const [modalGame, setModalGame] = useState<any | null>(null);
  const [modalAppName, setModalAppName] = useState('');
  const [modalGamePath, setModalGamePath] = useState('');
  const [modalSelectedExe, setModalSelectedExe] = useState('');
  const [modalStartDir, setModalStartDir] = useState('');
  const [modalCompatTool, setModalCompatTool] = useState('proton_experimental');
  const [modalLaunchOptions, setModalLaunchOptions] = useState('');
  const [modalInstallArtwork, setModalInstallArtwork] = useState(true);
  const [scanningExes, setScanningExes] = useState(false);
  const [detectedExes, setDetectedExes] = useState<
    Array<{ path: string; displayPath: string; name: string; sizeFormatted: string; isRecommended: boolean }>
  >([]);
  const [submittingSmartAdd, setSubmittingSmartAdd] = useState(false);
  const [showManualExeInput, setShowManualExeInput] = useState(false);

  // Smart Add Modal: Artwork candidates state
  const [modalArtworks, setModalArtworks] = useState<{
    resolvedSteamAppId: number | null;
    posters: Array<{ id: string; url: string; thumb: string; source: 'steam' | 'steamgriddb'; author?: string }>;
    banners: Array<{ id: string; url: string; thumb: string; source: 'steam' | 'steamgriddb'; author?: string }>;
    heroes: Array<{ id: string; url: string; thumb: string; source: 'steam' | 'steamgriddb'; author?: string }>;
    logos: Array<{ id: string; url: string; thumb: string; source: 'steam' | 'steamgriddb'; author?: string }>;
  }>({
    resolvedSteamAppId: null,
    posters: [],
    banners: [],
    heroes: [],
    logos: [],
  });
  const [loadingModalArtworks, setLoadingModalArtworks] = useState(false);
  const [artworkSearchQuery, setArtworkSearchQuery] = useState('');
  const [modalArtworkTab, setModalArtworkTab] = useState<'poster' | 'banner' | 'hero' | 'logo'>('poster');
  const [selectedModalPoster, setSelectedModalPoster] = useState<string | null>(null);
  const [selectedModalBanner, setSelectedModalBanner] = useState<string | null>(null);
  const [selectedModalHero, setSelectedModalHero] = useState<string | null>(null);
  const [selectedModalLogo, setSelectedModalLogo] = useState<string | null>(null);

  // New shortcut wizard form
  const [appName, setAppName] = useState('');
  const [exePath, setExePath] = useState('');
  const [startDir, setStartDir] = useState('');
  const [launchOptions, setLaunchOptions] = useState('');
  const [compatTool, setCompatTool] = useState('proton_experimental');

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
    loadInstalledGames();
    loadShortcuts();
  }, []);

  const loadInstalledGames = async () => {
    try {
      setLoadingInstalled(true);
      const res = await api.get('/steam/installed-games');
      setInstalledGames(res.data.games || []);
      setLibraries(res.data.libraries || []);
    } catch (err) {
      console.error('Failed to load installed games', err);
    } finally {
      setLoadingInstalled(false);
    }
  };

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

  const [restartingSteam, setRestartingSteam] = useState(false);
  const handleRestartSteam = async () => {
    try {
      setRestartingSteam(true);
      const res = await api.post('/steam/restart-steam');
      setSuccessMsg(res.data.message || 'Команда отправлена. Steam перезапускается...');
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      await alert({
        title: 'Ошибка перезапуска',
        message: err.response?.data?.error || err.message,
        variant: 'danger',
      });
    } finally {
      setRestartingSteam(false);
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
      await alert({
        title: 'Ошибка поиска SteamGridDB',
        message: err.response?.data?.error || err.message,
        variant: 'danger',
      });
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
      await alert({
        title: 'Внимание',
        message: 'Пожалуйста, укажите название игры и путь к исполняемому файлу',
        variant: 'warning',
      });
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
      await alert({
        title: 'Ошибка добавления в Steam',
        message: err.response?.data?.error || err.message,
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const isGameInSteam = (game: any): boolean => {
    return shortcuts.some((s) => {
      const sName = (s.AppName || '').toLowerCase().trim();
      const gName = (game.name || '').toLowerCase().trim();
      const sExe = (s.Exe || '').toLowerCase();
      const gDir = (game.installDir || '').toLowerCase();
      return sName === gName || (gDir && sExe.includes(gDir));
    });
  };

  const loadArtworkCandidates = async (query: string, appId?: number | null) => {
    if (!query && !appId) return;
    try {
      setLoadingModalArtworks(true);
      const res = await api.get('/steam/artwork-candidates', {
        params: {
          name: query.trim() || undefined,
          appId: appId || undefined,
        },
      });
      const data = res.data;
      setModalArtworks({
        resolvedSteamAppId: data.resolvedSteamAppId || null,
        posters: data.posters || [],
        banners: data.banners || [],
        heroes: data.heroes || [],
        logos: data.logos || [],
      });

      // Auto-select first option if none is currently selected
      if (data.posters?.length > 0 && !selectedModalPoster) {
        setSelectedModalPoster(data.posters[0].url);
      }
      if (data.banners?.length > 0 && !selectedModalBanner) {
        setSelectedModalBanner(data.banners[0].url);
      }
      if (data.heroes?.length > 0 && !selectedModalHero) {
        setSelectedModalHero(data.heroes[0].url);
      }
      if (data.logos?.length > 0 && !selectedModalLogo) {
        setSelectedModalLogo(data.logos[0].url);
      }
    } catch (err: any) {
      console.warn('Failed to load artwork candidates', err);
    } finally {
      setLoadingModalArtworks(false);
    }
  };

  const openSmartModal = async (game?: any) => {
    setModalGame(game || null);
    setShowManualExeInput(false);
    const initialName = game ? game.name : '';
    const initialPath = game ? game.fullPath || game.displayPath : '/mnt/game_data/Games';
    setModalAppName(initialName);
    setArtworkSearchQuery(initialName);
    setModalGamePath(initialPath);
    setModalCompatTool('proton_experimental');
    setModalLaunchOptions('');
    setModalInstallArtwork(true);
    setModalArtworkTab('poster');
    setSelectedModalPoster(null);
    setSelectedModalBanner(null);
    setSelectedModalHero(null);
    setSelectedModalLogo(null);
    setModalArtworks({
      resolvedSteamAppId: null,
      posters: [],
      banners: [],
      heroes: [],
      logos: [],
    });
    setSmartModalOpen(true);

    if (game) {
      scanExecutablesForPath(initialPath);
    } else {
      setDetectedExes([]);
      setModalSelectedExe('');
      setModalStartDir('');
    }

    if (initialName || game?.appId) {
      loadArtworkCandidates(initialName, game?.appId);
    }
  };

  const scanExecutablesForPath = async (dirPath: string) => {
    if (!dirPath || dirPath.trim().length === 0) return;
    try {
      setScanningExes(true);
      const res = await api.get('/steam/scan-executables', { params: { path: dirPath.trim() } });
      const exes = res.data.executables || [];
      setDetectedExes(exes);
      if (res.data.recommendedDisplayExe) {
        setModalSelectedExe(res.data.recommendedDisplayExe);
      } else if (exes.length > 0) {
        setModalSelectedExe(exes[0].displayPath);
      } else {
        setModalSelectedExe('');
        setShowManualExeInput(true);
      }
      setModalStartDir(res.data.startDir || dirPath);
    } catch (err: any) {
      console.warn('Scan executables error', err);
      setShowManualExeInput(true);
    } finally {
      setScanningExes(false);
    }
  };

  const handleSmartAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAppName.trim() || !modalSelectedExe.trim()) {
      await alert({
        title: 'Внимание',
        message: 'Укажите название игры и исполняемый файл',
        variant: 'warning',
      });
      return;
    }

    try {
      setSubmittingSmartAdd(true);
      await api.post('/steam/shortcuts/auto-create', {
        appName: modalAppName.trim(),
        gamePath: modalGamePath.trim(),
        exe: modalSelectedExe.trim(),
        startDir: modalStartDir.trim() || undefined,
        compatTool: modalCompatTool,
        launchOptions: modalLaunchOptions,
        installArtwork: modalInstallArtwork,
        resolvedSteamAppId: modalArtworks.resolvedSteamAppId || undefined,
        customArtwork: modalInstallArtwork
          ? {
              poster: selectedModalPoster || undefined,
              banner: selectedModalBanner || undefined,
              hero: selectedModalHero || undefined,
              logo: selectedModalLogo || undefined,
            }
          : undefined,
      });

      // Automatically restart Steam so SteamOS reloads on the fly
      try {
        await api.post('/steam/restart-steam');
      } catch (restartErr) {
        console.warn('Auto restart steam error:', restartErr);
      }

      setSuccessMsg(`Ярлык «${modalAppName}» и обложки успешно добавлены! Steam перезапускается для обновления библиотеки.`);
      setSmartModalOpen(false);
      loadShortcuts();
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      await alert({
        title: 'Ошибка добавления в Steam',
        message: err.response?.data?.error || err.message,
        variant: 'danger',
      });
    } finally {
      setSubmittingSmartAdd(false);
    }
  };

  const handleDeleteShortcut = async (s: SteamShortcut) => {
    if (!s.appid) return;
    const cleanPath = (s.StartDir || s.Exe || '').replace(/^["]+|["]+$/g, '');
    const cleanLower = cleanPath.toLowerCase();
    const isProtected = cleanLower.includes('steamlibrary') || cleanLower.includes('steamapps') || cleanLower.includes('.local/share/steam');

    const res = await confirm({
      title: 'Удаление ярлыка Steam',
      message: `Удалить ярлык «${s.AppName || s.appid}» из библиотеки Steam?`,
      confirmText: 'Удалить ярлык',
      cancelText: 'Отмена',
      variant: 'danger',
      showCheckbox: !!cleanPath && !isProtected,
      checkboxLabel: `Также удалить папку игры с диска (${cleanPath})`,
    });
    if (!res.confirmed) return;

    try {
      const resp = await api.delete(`/steam/shortcuts/${s.appid}`, {
        params: {
          deleteFiles: res.checked,
          gamePath: cleanPath,
        },
      });
      loadShortcuts();
      loadInstalledGames();
      setSuccessMsg(resp.data?.message || `Ярлык «${s.AppName || s.appid}» удален из shortcuts.vdf`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      await alert({
        title: 'Ошибка удаления ярлыка',
        message: err.response?.data?.error || err.message,
        variant: 'danger',
      });
    }
  };

  const handleDeleteLocalGame = async (game: any) => {
    const pathCheck = (game.fullPath || game.displayPath || '').toLowerCase();
    if (game.isOfficialSteam || pathCheck.includes('steamlibrary') || pathCheck.includes('steamapps') || pathCheck.includes('.local/share/steam')) {
      await alert({
        title: 'Действие запрещено',
        message: 'Удаление официальных игр Steam из библиотеки запрещено.',
        variant: 'warning',
      });
      return;
    }

    const res = await confirm({
      title: 'Удаление сторонней игры',
      message: `Вы действительно хотите полностью удалить стороннюю игру «${game.name}» с накопителя?\n\nКаталог: ${game.displayPath}\nВсе файлы игры будут удалены безвозвратно.`,
      confirmText: 'Удалить игру с диска',
      cancelText: 'Отмена',
      variant: 'danger',
    });
    if (!res.confirmed) return;

    try {
      const resp = await api.post('/steam/delete-local-game', {
        path: game.fullPath || game.displayPath,
        removeShortcuts: true,
      });
      setSuccessMsg(resp.data?.message || `Игра «${game.name}» удалена с диска`);
      loadInstalledGames();
      loadShortcuts();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      await alert({
        title: 'Ошибка удаления игры',
        message: err.response?.data?.error || err.message,
        variant: 'danger',
      });
    }
  };

  const handleImportToShortcut = (game: any) => {
    openSmartModal(game);
  };

  const isTechnicalGame = (game: any): boolean => {
    const name = (game.name || '').toLowerCase().replace(/[\s\-_.]/g, '');
    const dir = (game.installDir || '').toLowerCase().replace(/[\s\-_.]/g, '');
    const technical = [
      'steamlinuxruntime',
      'linuxruntime',
      'steamlinux',
      'sniper',
      'soldier',
      'scout',
      'medic',
      'pressurevessel',
      'pressure-vessel',
      'proton',
      'steamworks',
      'steamcontroller',
      'redistributables',
      'shadercache',
      'steamvr',
    ];
    return technical.some((t) => name.includes(t) || dir.includes(t));
  };

  const filteredInstalled = installedGames.filter((g) => {
    if (isTechnicalGame(g)) return false;

    const matchesSearch =
      g.name.toLowerCase().includes(installedSearch.toLowerCase()) ||
      (g.installDir || '').toLowerCase().includes(installedSearch.toLowerCase());

    const matchesLib =
      !selectedLibraryPath ||
      g.libraryPath === selectedLibraryPath ||
      g.libraryDisplayPath === selectedLibraryPath;

    return matchesSearch && matchesLib;
  });

  const validGamesCount = installedGames.filter((g) => !isTechnicalGame(g)).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 mb-6">
        {/* Row 1: Title and Primary Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <Gamepad2 className="w-7 h-7 text-steam-accent" />
              Библиотека Steam & Игры
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Управление установленными играми Steam на накопителях и быстрая интеграция сторонних игр с Proton и SteamGridDB.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full md:w-auto">
            <button
              type="button"
              onClick={handleRestartSteam}
              disabled={restartingSteam}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-steam-card hover:bg-steam-cardHover border border-steam-border text-slate-200 hover:text-white text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-md disabled:opacity-50 whitespace-nowrap"
              title="Перезапустить клиент Steam или обновить Game Mode, чтобы применить новые ярлыки и обложки"
            >
              <RotateCcw className={`w-4 h-4 text-steam-accent ${restartingSteam ? 'animate-spin' : ''}`} />
              <span>{restartingSteam ? 'Применение...' : 'Применить в SteamOS'}</span>
            </button>

            <button
              type="button"
              onClick={() => openSmartModal()}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-steam-blue to-steam-cyan hover:from-blue-500 hover:to-cyan-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить стороннюю игру</span>
            </button>
          </div>
        </div>

        {/* Row 2: Clean Storage Filters Bar */}
        {libraries.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-steam-border/40 overflow-x-auto pb-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium shrink-0 mr-1">
              <HardDrive className="w-3.5 h-3.5 text-steam-accent" />
              <span>Накопители:</span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedLibraryPath(null)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedLibraryPath === null
                  ? 'bg-steam-blue text-white border-steam-blue shadow-sm'
                  : 'bg-steam-card text-slate-300 border-steam-border hover:text-white hover:border-slate-500'
              }`}
              title="Показать игры со всех подключенных накопителей"
            >
              <span>Все ({validGamesCount})</span>
            </button>

            {libraries.map((lib, idx) => {
              const isSelected = selectedLibraryPath === lib.path || selectedLibraryPath === lib.displayPath;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedLibraryPath(isSelected ? null : lib.path)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
                    isSelected
                      ? 'bg-steam-blue text-white border-steam-blue shadow-sm'
                      : 'bg-steam-card text-slate-300 border-steam-border hover:text-white hover:border-steam-accent'
                  }`}
                  title={`Показать только игры из ${lib.displayPath}`}
                >
                  <span className="font-mono text-[11px] truncate max-w-[260px]">{lib.displayPath}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-steam-accent/20 text-steam-accent'
                    }`}
                  >
                    {lib.gamesCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-3 border-b border-steam-border mb-8">
        <button
          type="button"
          onClick={() => setActiveTab('installed')}
          className={`pb-3 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'installed'
              ? 'border-steam-accent text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Gamepad2 className="w-4 h-4 text-steam-accent" />
          <span>Установленные игры в Steam</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-steam-accent/15 text-steam-accent font-mono font-bold">
            {validGamesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shortcuts')}
          className={`pb-3 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'shortcuts'
              ? 'border-steam-cyan text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Plus className="w-4 h-4 text-steam-cyan" />
          <span>Сторонние ярлыки (Non-Steam)</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-steam-cyan/15 text-steam-cyan font-mono font-bold">
            {shortcuts.length}
          </span>
        </button>
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

      {/* TAB 1: INSTALLED STEAM GAMES */}
      {activeTab === 'installed' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-steam-card border border-steam-border/80">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <input
                  type="text"
                  value={installedSearch}
                  onChange={(e) => setInstalledSearch(e.target.value)}
                  placeholder="Поиск по установленным играм..."
                  className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-9 pr-4 py-2 border border-steam-border focus:outline-none focus:border-steam-accent"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                type="button"
                onClick={loadInstalledGames}
                disabled={loadingInstalled}
                className="px-3 py-2 rounded-xl bg-steam-nav hover:bg-slate-800 text-slate-300 hover:text-white border border-steam-border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Пересканировать директории Steam"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInstalled ? 'animate-spin' : ''}`} />
                <span>Обновить список</span>
              </button>
            </div>
          </div>

          {loadingInstalled ? (
            <div className="py-24 text-center text-slate-400 text-sm">
              <Loader2 className="w-8 h-8 text-steam-accent animate-spin mx-auto mb-3" />
              <p>Сканирование установленных игр в SteamLibrary...</p>
            </div>
          ) : filteredInstalled.length === 0 ? (
            <div className="py-20 text-center bg-steam-card/40 rounded-2xl border border-steam-border p-8">
              <Gamepad2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-300 font-semibold">Игры не найдены</p>
              <p className="text-xs text-slate-500 mt-1">
                Проверьте путь к библиотеке Steam в Настройках или сбросьте строку поиска.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredInstalled.map((game, idx) => (
                <div
                  key={idx}
                  className="group rounded-2xl bg-steam-card border border-steam-border/80 hover:border-steam-accent/60 overflow-hidden shadow-xl hover:shadow-steam-accent/10 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header Image */}
                    <div className="aspect-[460/215] bg-slate-900 relative overflow-hidden">
                      {game.headerImage ? (
                        <>
                          <img
                            src={game.headerImage}
                            alt={game.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                              const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                              if (placeholder) placeholder.style.display = 'flex';
                            }}
                          />
                          <div
                            style={{ display: 'none' }}
                            className="w-full h-full flex-col items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 text-slate-400 p-4 text-center"
                          >
                            <Gamepad2 className="w-10 h-10 mb-2 text-steam-accent" />
                            <span className="text-xs font-bold text-white line-clamp-2 px-2">
                              {game.name}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 text-slate-400 p-4 text-center">
                          <Gamepad2 className="w-10 h-10 mb-2 text-steam-accent" />
                          <span className="text-xs font-bold text-white line-clamp-2 px-2">
                            {game.name}
                          </span>
                        </div>
                      )}

                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        {game.sizeFormatted && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/75 text-emerald-300 backdrop-blur-md border border-emerald-500/30">
                            {game.sizeFormatted}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Game Metadata Info */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-sm text-white line-clamp-2 break-words group-hover:text-steam-accent transition-colors" title={game.name}>
                          {game.name}
                        </h3>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 truncate" title={game.displayPath}>
                        📁 {game.displayPath}
                      </div>

                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        {game.isOfficialSteam ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-steam-blue/20 text-steam-blue border border-steam-blue/30">
                            Steam AppID: {game.appId}
                          </span>
                        ) : game.appId ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Локальная игра (Steam ID: {game.appId})
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Локальная игра
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="p-3 bg-steam-nav/60 border-t border-steam-border/60 flex items-center justify-between gap-2">
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/files?path=${encodeURIComponent(game.displayPath)}`)}
                        className="py-1.5 px-2.5 rounded-lg bg-steam-card hover:bg-steam-cardHover text-slate-300 border border-steam-border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Открыть каталог игры в файловом менеджере (Администратор)"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-steam-cyan" />
                        <span>Папка</span>
                      </button>
                    )}

                    {game.isOfficialSteam ? (
                      <div
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-steam-nav/70 text-slate-400 border border-steam-border/60 select-none"
                        title="Официальная игра Steam"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-steam-blue" />
                        <span>Игра Steam</span>
                      </div>
                    ) : (() => {
                      const alreadyInSteam = isGameInSteam(game);
                      return (
                        <button
                          type="button"
                          onClick={() => openSmartModal(game)}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                            alreadyInSteam
                              ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                              : 'bg-steam-blue hover:bg-steam-blueHover text-white shadow-blue-500/20'
                          }`}
                          title={
                            alreadyInSteam
                              ? 'Игра уже добавлена в shortcuts.vdf (нажмите для редактирования или обновления обложек)'
                              : 'Создать ярлык и установить обложки в Steam в 1 клик'
                          }
                        >
                          {alreadyInSteam ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>В Steam</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-steam-cyan" />
                              <span>+ В Steam</span>
                            </>
                          )}
                        </button>
                      );
                    })()}

                    {(() => {
                      const isSteamLib =
                        game.isOfficialSteam ||
                        (game.libraryPath && (game.libraryPath.toLowerCase().includes('steamlibrary') || game.libraryPath.toLowerCase().includes('steamapps'))) ||
                        (game.displayPath && (game.displayPath.toLowerCase().includes('steamlibrary') || game.displayPath.toLowerCase().includes('steamapps')));
                      if (isSteamLib) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => handleDeleteLocalGame(game)}
                          className="py-1.5 px-2.5 rounded-lg bg-steam-card hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-steam-border hover:border-red-500/40 transition-colors cursor-pointer"
                          title="Удалить стороннюю игру с накопителя"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NON-STEAM SHORTCUTS WIZARD & TABLE */}
      {activeTab === 'shortcuts' && (
        <div className="space-y-8">
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
                      placeholder="/mnt/game_data/Games/GodOfWar/GoW.exe"
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
                        placeholder="/mnt/game_data/Games/GodOfWar"
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
                        placeholder="Опционально (по умолчанию пусто)"
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
                      <option value="proton_experimental">Proton Experimental (По умолчанию)</option>
                      <option value="GE-Proton9-20">GE-Proton9-20 (Custom GE)</option>
                      <option value="proton_9">Proton 9.0</option>
                      <option value="proton_8">Proton 8.0</option>
                      <option value="proton_hotfix">Proton Hotfix</option>
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
                Сторонние игры пока не найдены в файле shortcuts.vdf.{isAdmin ? ' Добавьте первую игру через форму выше!' : ''}
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
                      <th className="px-4 py-3 text-right">Действия</th>
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
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteShortcut(s)}
                            className="p-1.5 rounded-lg bg-steam-nav hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-steam-border transition-colors cursor-pointer"
                            title="Удалить ярлык из Steam"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Add to Steam Modal */}
      {smartModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setSmartModalOpen(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[92vh] flex flex-col my-auto bg-steam-card border border-steam-border/90 rounded-2xl shadow-2xl relative text-left overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 sm:p-6 pb-3 border-b border-steam-border/60 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 pr-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-steam-blue to-steam-cyan flex items-center justify-center text-white shadow-md shadow-blue-500/25 flex-shrink-0">
                  <Gamepad2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Добавление игры в Steam (Game Mode)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Создание ярлыка в shortcuts.vdf, автопоиск .exe, настройка Proton и выбор обложек.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSmartModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSmartAddSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {/* Game Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Название игры (в интерфейсе Steam) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={modalAppName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      if (!artworkSearchQuery || artworkSearchQuery === modalAppName) {
                        setArtworkSearchQuery(newName);
                      }
                      setModalAppName(newName);
                    }}
                    placeholder="Например: Dead Space (2023)"
                    required
                    className="flex-1 bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                  />
                  {modalAppName.trim() && (
                    <button
                      type="button"
                      onClick={() => loadArtworkCandidates(artworkSearchQuery || modalAppName, modalGame?.appId)}
                      disabled={loadingModalArtworks}
                      className="px-3 py-2.5 rounded-xl bg-steam-nav hover:bg-slate-700 text-xs font-medium text-steam-cyan border border-steam-border flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
                      title="Найти обложки для этого названия"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingModalArtworks ? 'animate-spin' : ''}`} />
                      <span>Обложки</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Game Directory & Scanner */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Каталог с файлами игры *
                  </label>
                  <button
                    type="button"
                    onClick={() => scanExecutablesForPath(modalGamePath)}
                    disabled={scanningExes || !modalGamePath.trim()}
                    className="text-[11px] font-semibold text-steam-cyan hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${scanningExes ? 'animate-spin' : ''}`} />
                    <span>Сканировать .exe</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={modalGamePath}
                  onChange={(e) => setModalGamePath(e.target.value)}
                  onBlur={() => {
                    if (modalGamePath.trim()) scanExecutablesForPath(modalGamePath.trim());
                  }}
                  placeholder="/mnt/game_data/Games/GodOfWar"
                  required
                  className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                />
              </div>

              {/* Detected Executables */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Исполняемый файл запуска (.exe / .sh) *
                </label>
                {scanningExes ? (
                  <div className="p-3 rounded-xl bg-steam-nav border border-steam-border text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-steam-cyan animate-spin" />
                    <span>Поиск исполняемых файлов (.exe / .sh) в каталоге игры...</span>
                  </div>
                ) : detectedExes.length > 0 && !showManualExeInput ? (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-emerald-300 truncate font-mono">
                          {modalSelectedExe.split('/').pop() || modalSelectedExe}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex-shrink-0">
                        Автоопределен
                      </span>
                    </div>

                    {detectedExes.length > 1 && (
                      <div>
                        <select
                          value={modalSelectedExe}
                          onChange={(e) => setModalSelectedExe(e.target.value)}
                          className="w-full bg-steam-nav text-slate-200 text-xs rounded-xl px-3 py-2 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                        >
                          {detectedExes.map((exe, idx) => (
                            <option key={idx} value={exe.displayPath}>
                              {exe.name} ({exe.sizeFormatted}) {exe.isRecommended ? '— Рекомендуется' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowManualExeInput(true)}
                        className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Указать путь вручную
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={modalSelectedExe}
                      onChange={(e) => setModalSelectedExe(e.target.value)}
                      placeholder="/mnt/game_data/Games/GodOfWar/GoW.exe"
                      required
                      className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                    />
                    {detectedExes.length > 0 && (
                      <div className="flex justify-end mt-1">
                        <button
                          type="button"
                          onClick={() => setShowManualExeInput(false)}
                          className="text-[11px] text-steam-cyan hover:underline cursor-pointer"
                        >
                          Вернуться к найденным файлам ({detectedExes.length})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Compatibility Tool (Proton) & Launch Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Совместимость Proton
                  </label>
                  <select
                    value={modalCompatTool}
                    onChange={(e) => setModalCompatTool(e.target.value)}
                    className="w-full bg-steam-nav text-slate-100 text-xs rounded-xl px-3 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                  >
                    <option value="proton_experimental">Proton Experimental (По умолчанию)</option>
                    <option value="GE-Proton9-20">GE-Proton9-20 (Custom GE)</option>
                    <option value="proton_9">Proton 9.0</option>
                    <option value="proton_8">Proton 8.0</option>
                    <option value="proton_hotfix">Proton Hotfix</option>
                    <option value="Wine-GE-latest">Wine-GE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Параметры запуска
                  </label>
                  <input
                    type="text"
                    value={modalLaunchOptions}
                    onChange={(e) => setModalLaunchOptions(e.target.value)}
                    placeholder="Опционально (по умолчанию пусто)"
                    className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-xs rounded-xl px-3 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                  />
                </div>
              </div>

              {/* Artwork auto-download toggle & Interactive Visual Selector */}
              <div className="p-3.5 rounded-xl bg-steam-nav border border-steam-border space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={modalInstallArtwork}
                      onChange={(e) => setModalInstallArtwork(e.target.checked)}
                      className="mt-0.5 rounded border-steam-border text-steam-blue focus:ring-0 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-steam-cyan" />
                        Установить и настроить обложки для Steam
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Постер (600×900), баннер (460×215), фоновый арт Hero (1920×620) и логотип в папку grid Steam.
                      </p>
                    </div>
                  </label>

                  {modalInstallArtwork && (
                    <button
                      type="button"
                      onClick={() => loadArtworkCandidates(artworkSearchQuery || modalAppName, modalGame?.appId)}
                      disabled={loadingModalArtworks || (!artworkSearchQuery.trim() && !modalAppName.trim())}
                      className="text-xs px-2.5 py-1 rounded-lg bg-steam-blue/20 text-steam-cyan border border-steam-blue/30 hover:bg-steam-blue/30 flex items-center gap-1.5 flex-shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingModalArtworks ? 'animate-spin' : ''}`} />
                      <span>{loadingModalArtworks ? 'Поиск...' : 'Обновить'}</span>
                    </button>
                  )}
                </div>

                {modalInstallArtwork && (
                  <div className="pt-2 border-t border-slate-700/50 space-y-3">
                    {/* Search query override */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={artworkSearchQuery}
                          onChange={(e) => setArtworkSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              loadArtworkCandidates(artworkSearchQuery, modalGame?.appId);
                            }
                          }}
                          placeholder="Поисковый запрос для обложек (например: LEGO Batman)..."
                          className="w-full bg-slate-900/80 text-slate-200 placeholder-slate-500 text-xs rounded-lg pl-8 pr-3 py-1.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => loadArtworkCandidates(artworkSearchQuery, modalGame?.appId)}
                        disabled={loadingModalArtworks || !artworkSearchQuery.trim()}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-steam-blue hover:bg-blue-600 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50 flex-shrink-0"
                      >
                        {loadingModalArtworks ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        <span>Найти</span>
                      </button>
                    </div>

                    {/* Category tabs */}
                    <div className="flex items-center gap-1 p-1 bg-slate-900/80 rounded-xl border border-steam-border text-xs">
                      <button
                        type="button"
                        onClick={() => setModalArtworkTab('poster')}
                        className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                          modalArtworkTab === 'poster'
                            ? 'bg-steam-blue text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <span>Постер</span>
                        {modalArtworks.posters.length > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${modalArtworkTab === 'poster' ? 'bg-white/20' : 'bg-slate-800 text-slate-300'}`}>
                            {modalArtworks.posters.length}
                          </span>
                        )}
                        {selectedModalPoster && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalArtworkTab('banner')}
                        className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                          modalArtworkTab === 'banner'
                            ? 'bg-steam-blue text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <span>Баннер</span>
                        {modalArtworks.banners.length > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${modalArtworkTab === 'banner' ? 'bg-white/20' : 'bg-slate-800 text-slate-300'}`}>
                            {modalArtworks.banners.length}
                          </span>
                        )}
                        {selectedModalBanner && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalArtworkTab('hero')}
                        className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                          modalArtworkTab === 'hero'
                            ? 'bg-steam-blue text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <span>Hero</span>
                        {modalArtworks.heroes.length > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${modalArtworkTab === 'hero' ? 'bg-white/20' : 'bg-slate-800 text-slate-300'}`}>
                            {modalArtworks.heroes.length}
                          </span>
                        )}
                        {selectedModalHero && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalArtworkTab('logo')}
                        className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                          modalArtworkTab === 'logo'
                            ? 'bg-steam-blue text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <span>Лого</span>
                        {modalArtworks.logos.length > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${modalArtworkTab === 'logo' ? 'bg-white/20' : 'bg-slate-800 text-slate-300'}`}>
                            {modalArtworks.logos.length}
                          </span>
                        )}
                        {selectedModalLogo && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    </div>

                    {/* Gallery View */}
                    <div className="min-h-[140px] max-h-56 overflow-y-auto p-1.5 rounded-xl bg-slate-900/60 border border-steam-border/60">
                      {loadingModalArtworks ? (
                        <div className="h-32 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                          <Loader2 className="w-5 h-5 text-steam-cyan animate-spin" />
                          <span>Поиск и загрузка обложек из Steam CDN / SteamGridDB...</span>
                        </div>
                      ) : (
                        <>
                          {modalArtworkTab === 'poster' && (
                            modalArtworks.posters.length === 0 ? (
                              <div className="h-28 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-3">
                                <span>Постеры не найдены. Попробуйте изменить поисковый запрос выше.</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 p-1">
                                {modalArtworks.posters.map((item) => {
                                  const isSelected = selectedModalPoster === item.url;
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={() => setSelectedModalPoster(isSelected ? null : item.url)}
                                      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer aspect-[2/3] bg-slate-950 ${
                                        isSelected
                                          ? 'border-steam-cyan ring-2 ring-steam-cyan/50 shadow-md shadow-cyan-500/30'
                                          : 'border-transparent hover:border-slate-500 opacity-80 hover:opacity-100'
                                      }`}
                                    >
                                      <img
                                        src={item.thumb}
                                        alt="Poster"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                      <span
                                        className={`absolute top-1 left-1 text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                                          item.source === 'steam'
                                            ? 'bg-steam-blue text-white'
                                            : 'bg-amber-600/90 text-white'
                                        }`}
                                      >
                                        {item.source === 'steam' ? 'Steam' : 'SGDB'}
                                      </span>
                                      {isSelected && (
                                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-steam-cyan text-slate-950 flex items-center justify-center shadow">
                                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}

                          {modalArtworkTab === 'banner' && (
                            modalArtworks.banners.length === 0 ? (
                              <div className="h-28 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-3">
                                <span>Баннеры не найдены. Попробуйте изменить поисковый запрос выше.</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-1">
                                {modalArtworks.banners.map((item) => {
                                  const isSelected = selectedModalBanner === item.url;
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={() => setSelectedModalBanner(isSelected ? null : item.url)}
                                      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer aspect-[460/215] bg-slate-950 ${
                                        isSelected
                                          ? 'border-steam-cyan ring-2 ring-steam-cyan/50 shadow-md shadow-cyan-500/30'
                                          : 'border-transparent hover:border-slate-500 opacity-80 hover:opacity-100'
                                      }`}
                                    >
                                      <img
                                        src={item.thumb}
                                        alt="Banner"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                      <span
                                        className={`absolute top-1 left-1 text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                                          item.source === 'steam'
                                            ? 'bg-steam-blue text-white'
                                            : 'bg-amber-600/90 text-white'
                                        }`}
                                      >
                                        {item.source === 'steam' ? 'Steam' : 'SGDB'}
                                      </span>
                                      {isSelected && (
                                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-steam-cyan text-slate-950 flex items-center justify-center shadow">
                                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}

                          {modalArtworkTab === 'hero' && (
                            modalArtworks.heroes.length === 0 ? (
                              <div className="h-28 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-3">
                                <span>Фоны Hero не найдены. Попробуйте изменить поисковый запрос выше.</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2.5 p-1">
                                {modalArtworks.heroes.map((item) => {
                                  const isSelected = selectedModalHero === item.url;
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={() => setSelectedModalHero(isSelected ? null : item.url)}
                                      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer aspect-[16/9] bg-slate-950 ${
                                        isSelected
                                          ? 'border-steam-cyan ring-2 ring-steam-cyan/50 shadow-md shadow-cyan-500/30'
                                          : 'border-transparent hover:border-slate-500 opacity-80 hover:opacity-100'
                                      }`}
                                    >
                                      <img
                                        src={item.thumb}
                                        alt="Hero"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                      <span
                                        className={`absolute top-1 left-1 text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                                          item.source === 'steam'
                                            ? 'bg-steam-blue text-white'
                                            : 'bg-amber-600/90 text-white'
                                        }`}
                                      >
                                        {item.source === 'steam' ? 'Steam' : 'SGDB'}
                                      </span>
                                      {isSelected && (
                                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-steam-cyan text-slate-950 flex items-center justify-center shadow">
                                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}

                          {modalArtworkTab === 'logo' && (
                            modalArtworks.logos.length === 0 ? (
                              <div className="h-28 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-3">
                                <span>Логотипы не найдены. Попробуйте изменить поисковый запрос выше.</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-1">
                                {modalArtworks.logos.map((item) => {
                                  const isSelected = selectedModalLogo === item.url;
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={() => setSelectedModalLogo(isSelected ? null : item.url)}
                                      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer aspect-[16/9] bg-slate-950/80 p-2 flex items-center justify-center ${
                                        isSelected
                                          ? 'border-steam-cyan ring-2 ring-steam-cyan/50 shadow-md shadow-cyan-500/30'
                                          : 'border-transparent hover:border-slate-500 opacity-80 hover:opacity-100'
                                      }`}
                                    >
                                      <img
                                        src={item.thumb}
                                        alt="Logo"
                                        className="max-w-full max-h-full object-contain"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                      <span
                                        className={`absolute top-1 left-1 text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                                          item.source === 'steam'
                                            ? 'bg-steam-blue text-white'
                                            : 'bg-amber-600/90 text-white'
                                        }`}
                                      >
                                        {item.source === 'steam' ? 'Steam' : 'SGDB'}
                                      </span>
                                      {isSelected && (
                                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-steam-cyan text-slate-950 flex items-center justify-center shadow">
                                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}
                        </>
                      )}
                    </div>

                    {/* Active Selected Artworks Summary Strip */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/40 px-2.5 py-1.5 rounded-lg border border-steam-border/50">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="font-semibold text-slate-300">Выбрано:</span>
                        <span className={selectedModalPoster ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                          Постер {selectedModalPoster ? '✓' : '—'}
                        </span>
                        <span className={selectedModalBanner ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                          Баннер {selectedModalBanner ? '✓' : '—'}
                        </span>
                        <span className={selectedModalHero ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                          Hero {selectedModalHero ? '✓' : '—'}
                        </span>
                        <span className={selectedModalLogo ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                          Лого {selectedModalLogo ? '✓' : '—'}
                        </span>
                      </div>
                      {(selectedModalPoster || selectedModalBanner || selectedModalHero || selectedModalLogo) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModalPoster(null);
                            setSelectedModalBanner(null);
                            setSelectedModalHero(null);
                            setSelectedModalLogo(null);
                          }}
                          className="text-[10px] text-rose-400 hover:text-rose-300 cursor-pointer"
                        >
                          Сбросить все
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Hint */}
              <div className="p-2.5 rounded-xl bg-steam-blue/10 border border-steam-blue/20 text-[11px] text-slate-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-steam-cyan flex-shrink-0 mt-0.5" />
                <span>
                  После добавления перезапустите клиент Steam или переключитесь в Game Mode, чтобы новая игра появилась в вашей библиотеке.
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSmartModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-steam-nav hover:bg-steam-cardHover text-center cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submittingSmartAdd || !modalAppName.trim() || !modalSelectedExe.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-steam-blue to-steam-cyan hover:from-blue-500 hover:to-cyan-400 shadow-lg shadow-cyan-500/20 disabled:opacity-50 text-center flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submittingSmartAdd ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Создание ярлыка и загрузка обложек...</span>
                    </>
                  ) : (
                    <>
                      <Gamepad2 className="w-4 h-4" />
                      <span>Добавить в Steam и применить обложки</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
  </div>
  );
};
