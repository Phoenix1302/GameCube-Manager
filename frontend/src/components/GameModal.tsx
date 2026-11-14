import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Loader2,
  Heart,
  ExternalLink,
  Check,
  Monitor,
  DownloadCloud,
  Search,
  AlertCircle,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronUp,
  Magnet,
  Copy,
  FolderOpen,
} from 'lucide-react';
import { api } from '../services/api';
import { GameDetails, RutrackerRelease } from '../types';

interface GameModalProps {
  appId: number | null;
  onClose: () => void;
  onAddedToWishlist?: () => void;
  showWishlistButton?: boolean;
}

export const GameModal: React.FC<GameModalProps> = ({
  appId,
  onClose,
  onAddedToWishlist,
  showWishlistButton = true,
}) => {
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [wishlistSuccess, setWishlistSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  // RuTracker live search & one-click download states
  const [showRutracker, setShowRutracker] = useState(false);
  const [searchingRutracker, setSearchingRutracker] = useState(false);
  const [rutrackerReleases, setRutrackerReleases] = useState<RutrackerRelease[]>([]);
  const [rutrackerError, setRutrackerError] = useState<string | null>(null);
  const [rutrackerConfigured, setRutrackerConfigured] = useState<boolean | null>(null);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [downloadSavePath, setDownloadSavePath] = useState<string>('/downloads');
  const [downloadingTopicId, setDownloadingTopicId] = useState<number | null>(null);
  const [downloadSuccessMap, setDownloadSuccessMap] = useState<Record<number, boolean>>({});
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [copyingTopicId, setCopyingTopicId] = useState<number | null>(null);
  const [copiedTopicId, setCopiedTopicId] = useState<number | null>(null);

  const handleCopyMagnet = async (release: RutrackerRelease) => {
    setCopyingTopicId(release.id);
    try {
      const res = await api.get(`/rutracker/magnet/${release.id}`);
      if (res.data?.magnet) {
        await navigator.clipboard.writeText(res.data.magnet);
        setCopiedTopicId(release.id);
        setTimeout(() => setCopiedTopicId(null), 3000);
      }
    } catch (err: any) {
      alert(`Не удалось скопировать magnet-ссылку: ${err.response?.data?.error || err.message}`);
    } finally {
      setCopyingTopicId(null);
    }
  };

  const fetchRutracker = async (searchTerm?: string) => {
    const q = (searchTerm !== undefined ? searchTerm : (customSearchQuery || details?.name || '')).trim();
    if (!q) return;

    setSearchingRutracker(true);
    setRutrackerError(null);
    setDownloadMessage(null);
    try {
      const res = await api.get('/rutracker/search', { params: { q } });
      if (res.data.configured === false) {
        setRutrackerConfigured(false);
        setRutrackerError(res.data.error || 'RuTracker не настроен в Настройках');
      } else {
        setRutrackerConfigured(true);
        if (res.data.error) {
          setRutrackerError(res.data.error);
        } else {
          setRutrackerReleases(res.data.releases || []);
        }
      }
    } catch (err: any) {
      setRutrackerError(err.response?.data?.error || err.message || 'Ошибка поиска раздач');
    } finally {
      setSearchingRutracker(false);
    }
  };

  const toggleRutracker = () => {
    const nextState = !showRutracker;
    setShowRutracker(nextState);
    if (nextState && rutrackerReleases.length === 0 && !searchingRutracker) {
      fetchRutracker(details?.name);
    }
  };

  const handleDownloadRelease = async (release: RutrackerRelease) => {
    setDownloadingTopicId(release.id);
    setDownloadMessage(null);
    try {
      await api.post('/rutracker/download', {
        topicId: release.id,
        savePath: downloadSavePath || undefined,
      });
      setDownloadSuccessMap((prev) => ({ ...prev, [release.id]: true }));
      setDownloadMessage(`Раздача «${release.title.substring(0, 50)}...» отправлена в qBittorrent!`);
      setTimeout(() => setDownloadMessage(null), 5000);
    } catch (err: any) {
      alert(`Ошибка добавления торрента: ${err.response?.data?.error || err.message}`);
    } finally {
      setDownloadingTopicId(null);
    }
  };

  useEffect(() => {
    if (!appId) {
      setDetails(null);
      setShowRutracker(false);
      setRutrackerReleases([]);
      setRutrackerError(null);
      setDownloadSuccessMap({});
      return;
    }

    const fetchDetails = async () => {
      setLoading(true);
      setDetails(null);
      setWishlistSuccess(null);
      setShowRutracker(false);
      setRutrackerReleases([]);
      setRutrackerError(null);
      setDownloadSuccessMap({});
      try {
        const res = await api.get(`/games/details/${appId}`);
        setDetails(res.data);
        setCustomSearchQuery(res.data.name || '');
      } catch (err) {
        console.error('Failed to load game details', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [appId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && appId) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appId, onClose]);

  if (!appId) return null;

  const handleAddToWishlist = async () => {
    if (!details) return;
    try {
      await api.post('/wishlist', {
        appId: details.appId,
        title: details.name,
        imgUrl: details.headerImage,
      });
      setWishlistSuccess('Игра добавлена в список желаемого!');
      if (onAddedToWishlist) onAddedToWishlist();
      setTimeout(() => setWishlistSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to add to wishlist', err);
    }
  };

  const getProtonBadge = (tier?: string) => {
    const t = (tier || 'unknown').toLowerCase();
    switch (t) {
      case 'platinum':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">Platinum (Идеально)</span>;
      case 'gold':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Gold (Отлично)</span>;
      case 'silver':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-400/20 text-slate-300 border border-slate-400/40">Silver (Хорошо)</span>;
      case 'bronze':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-700/20 text-orange-400 border border-orange-700/40">Bronze (Возможны сбои)</span>;
      case 'borked':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600/20 text-red-400 border border-red-600/40">Borked (Неиграбельно)</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-slate-300 border border-slate-600">Не тестировалось</span>;
    }
  };

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl my-auto max-h-[90vh] overflow-y-auto bg-steam-nav border border-steam-border/90 rounded-2xl shadow-2xl p-4 sm:p-6"
      >
        {/* Prominent High-Visibility Close [X] Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2.5 bg-black/80 hover:bg-red-600 text-white rounded-full backdrop-blur-md border border-white/30 transition-all shadow-xl hover:scale-110 flex items-center justify-center cursor-pointer"
          title="Закрыть окно (Esc)"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {loading || !details ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-10 h-10 text-steam-blue animate-spin mb-3" />
            <p className="text-sm font-medium">Получение информации о ценах и ProtonDB...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="relative rounded-xl overflow-hidden aspect-[16/7] w-full bg-slate-900 border border-steam-border/60">
              <img
                src={details.headerImage}
                alt={details.name}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${details.appId}/capsule_616x353.jpg`;
                }}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-steam-nav via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white drop-shadow-md">{details.name}</h2>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded bg-steam-card/90 text-[11px] font-mono text-slate-400 border border-steam-border/80">
                      AppID: {details.appId}
                    </span>
                    {details.genres.map((g) => (
                      <span key={g} className="px-2 py-0.5 rounded bg-steam-card/90 text-[11px] font-medium text-slate-200 border border-steam-border/80">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {wishlistSuccess && (
              <div className="p-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{wishlistSuccess}</span>
              </div>
            )}

            {/* Description */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Об игре</h4>
              <p className="text-sm text-slate-300 leading-relaxed">{details.shortDescription}</p>
            </div>

            {/* Dual Region Price Comparison Table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Kazakhstan Price */}
              <div className="p-4 rounded-xl bg-steam-card border border-steam-border/80 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                    <span className="text-base">🇰🇿</span> Казахстан (KZT)
                  </span>
                  {details.prices.kz.discountPercent ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-steam-green text-white">
                      -{details.prices.kz.discountPercent}%
                    </span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <div className={`text-xl font-extrabold ${details.prices.kz.available ? 'text-steam-accent' : 'text-slate-500'}`}>
                    {details.prices.kz.formatted}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {details.prices.kz.statusText || (details.prices.kz.available ? (details.prices.kz.isFree ? 'Бесплатная игра (Free to Play)' : 'Официальный магазин Steam (KZ)') : 'Недоступно для региона')}
                  </div>
                </div>
              </div>

              {/* Russia Price */}
              <div className="p-4 rounded-xl bg-steam-card border border-steam-border/80 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                    <span className="text-base">🇷🇺</span> Россия (RUB)
                  </span>
                  {details.prices.ru.discountPercent ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-steam-green text-white">
                      -{details.prices.ru.discountPercent}%
                    </span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <div className={`text-xl font-extrabold ${details.prices.ru.available ? 'text-slate-100' : 'text-slate-500'}`}>
                    {details.prices.ru.formatted}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {details.prices.ru.statusText || (details.prices.ru.available ? (details.prices.ru.isFree ? 'Бесплатная игра (Free to Play)' : 'Официальный магазин Steam (RU)') : 'Ограничено издателем в РФ')}
                  </div>
                </div>
              </div>
            </div>

            {/* ProtonDB Tier Summary with direct link */}
            <div className="p-4 rounded-xl bg-steam-card/80 border border-steam-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-steam-blue" />
                  Совместимость ProtonDB (SteamOS / Linux)
                </h4>
                <p className="text-xs text-slate-300">
                  Рейтинг сообщества на основе {details.protonDb.total || 0} отчетов игроков.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {getProtonBadge(details.protonDb.tier)}
                <a
                  href={`https://www.protondb.com/app/${details.appId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 hover:text-cyan-200 border border-cyan-500/40 hover:border-cyan-400 text-xs font-semibold transition-all shadow-sm"
                  title="Открыть страницу игры и отчеты о запуске на ProtonDB"
                >
                  <span>ProtonDB</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* RuTracker Releases Section */}
            <div className="p-4 rounded-xl bg-steam-card/90 border border-steam-border/90 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <DownloadCloud className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Раздачи на RuTracker</span>
                  {rutrackerReleases.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {rutrackerReleases.length} найдено
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleRutracker}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all cursor-pointer"
                  >
                    {showRutracker ? (
                      <>
                        <span>Свернуть раздачи</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Найти раздачи</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Download success notification */}
              {downloadMessage && (
                <div className="p-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{downloadMessage}</span>
                </div>
              )}

              {showRutracker && (
                <div className="space-y-3 pt-2 border-t border-steam-border/60 animate-in fade-in duration-200">
                  {/* Search query input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      fetchRutracker(customSearchQuery);
                    }}
                    className="flex items-center gap-2"
                  >
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={customSearchQuery}
                        onChange={(e) => setCustomSearchQuery(e.target.value)}
                        placeholder="Поисковый запрос (например: Cyberpunk 2077 FitGirl)..."
                        className="w-full bg-steam-nav text-slate-100 text-xs rounded-lg pl-8 pr-3 py-2 border border-steam-border focus:outline-none focus:border-steam-blue"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={searchingRutracker}
                      className="px-4 py-2 bg-steam-nav hover:bg-slate-800 text-slate-200 border border-steam-border rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {searchingRutracker ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Искать</span>
                    </button>
                  </form>

                  {/* Target save directory picker */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <FolderOpen className="w-3.5 h-3.5 text-steam-cyan" />
                      <span>Папка назначения:</span>
                    </div>
                    <select
                      value={downloadSavePath}
                      onChange={(e) => setDownloadSavePath(e.target.value)}
                      className="bg-steam-nav text-slate-200 border border-steam-border text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-steam-blue font-mono"
                    >
                      <option value="/downloads">Папка загрузок (/mnt/game_data/Downloads)</option>
                      <option value="/mnt/game_data/SteamLibrary/steamapps/common">Библиотека Steam (/mnt/game_data/SteamLibrary/steamapps/common)</option>
                    </select>
                  </div>

                  {/* Warning / Error State */}
                  {rutrackerError && (
                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span>{rutrackerError}</span>
                      </div>
                      {rutrackerConfigured === false && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            navigate('/settings');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-semibold transition-all self-start sm:self-auto cursor-pointer"
                        >
                          <SettingsIcon className="w-3.5 h-3.5" />
                          <span>Настроить RuTracker</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Loading spinner */}
                  {searchingRutracker && (
                    <div className="py-8 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mb-2" />
                      <span className="text-xs">Поиск лучших раздач на RuTracker...</span>
                    </div>
                  )}

                  {/* Releases list */}
                  {!searchingRutracker && rutrackerReleases.length > 0 && (
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {rutrackerReleases.map((rel) => {
                        const isDownloaded = downloadSuccessMap[rel.id];
                        const isDownloading = downloadingTopicId === rel.id;
                        return (
                          <div
                            key={rel.id}
                            className="p-3 rounded-xl bg-steam-nav/80 hover:bg-steam-nav border border-steam-border/60 hover:border-steam-border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold font-mono border border-emerald-500/30 flex items-center gap-1">
                                  <ArrowUp className="w-3 h-3" />
                                  <span>{rel.seeds} сидов</span>
                                </span>
                                {rel.leechers > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                                    ▼ {rel.leechers}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-300 font-bold font-mono border border-cyan-500/30">
                                  {rel.sizeFormatted}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 text-[10px] truncate max-w-[200px]">
                                  {rel.category}
                                </span>
                              </div>
                              <a
                                href={rel.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-slate-200 hover:text-steam-accent line-clamp-2 transition-colors flex items-center gap-1"
                                title="Открыть тему на RuTracker"
                              >
                                <span>{rel.title}</span>
                                <ExternalLink className="w-3 h-3 opacity-60 flex-shrink-0" />
                              </a>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Copy Magnet Link */}
                              <button
                                type="button"
                                disabled={copyingTopicId === rel.id}
                                onClick={() => handleCopyMagnet(rel)}
                                className={`p-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                                  copiedTopicId === rel.id
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
                                }`}
                                title="Скопировать Magnet-ссылку"
                              >
                                {copyingTopicId === rel.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                ) : copiedTopicId === rel.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="hidden sm:inline">Скопировано</span>
                                  </>
                                ) : (
                                  <>
                                    <Magnet className="w-3.5 h-3.5 text-rose-400" />
                                    <span className="hidden sm:inline">Magnet</span>
                                  </>
                                )}
                              </button>

                              {/* Send to qBittorrent */}
                              <button
                                type="button"
                                disabled={isDownloading || isDownloaded}
                                onClick={() => handleDownloadRelease(rel)}
                                className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  isDownloaded
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 hover:scale-105'
                                }`}
                                title="Загрузить напрямую в qBittorrent"
                              >
                                {isDownloading ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Загрузка...</span>
                                  </>
                                ) : isDownloaded ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>В qBittorrent</span>
                                  </>
                                ) : (
                                  <>
                                    <DownloadCloud className="w-3.5 h-3.5" />
                                    <span>Скачать</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!searchingRutracker && !rutrackerError && rutrackerReleases.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-400">
                      По данному запросу раздач не найдено. Попробуйте изменить формулировку в поле поиска выше.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-steam-border/80">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white border border-steam-border font-medium text-sm transition-colors cursor-pointer"
              >
                Закрыть
              </button>

              {/* RuTracker Releases toggle */}
              <button
                type="button"
                onClick={toggleRutracker}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-steam-card hover:bg-emerald-500/15 text-slate-200 hover:text-emerald-300 border border-steam-border hover:border-emerald-500/40 font-medium text-sm transition-colors cursor-pointer"
                title="Найти подходящие раздачи на RuTracker"
              >
                <DownloadCloud className="w-4 h-4 text-emerald-400" />
                <span>{showRutracker ? 'Скрыть раздачи' : 'Раздачи RuTracker'}</span>
              </button>

              {showWishlistButton && (
                <button
                  type="button"
                  onClick={handleAddToWishlist}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-steam-card hover:bg-pink-500/10 text-slate-200 hover:text-pink-300 border border-steam-border hover:border-pink-500/40 font-medium text-sm transition-colors cursor-pointer"
                >
                  <Heart className="w-4 h-4 text-pink-400" />
                  <span>В желаемое</span>
                </button>
              )}

              <a
                href={details.steamStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-steam-blue to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
              >
                <span>Купить в Steam</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
