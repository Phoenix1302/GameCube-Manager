import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  DownloadCloud,
  Play,
  Pause,
  Trash2,
  Plus,
  RefreshCw,
  Upload,
  Link as LinkIcon,
  HardDrive,
  ArrowDown,
  ArrowUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search,
  ExternalLink,
  Check,
  Settings as SettingsIcon,
  X,
  Magnet,
  Copy,
} from 'lucide-react';
import { api } from '../services/api';
import { useConfirm } from '../context/ConfirmContext';
import { TorrentItem, TorrentTransfer, RutrackerRelease } from '../types';
import { TorrentDisclaimer } from '../components/TorrentDisclaimer';

export const Torrents: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { alert } = useConfirm();
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [transfer, setTransfer] = useState<TorrentTransfer>({ dlSpeed: 0, upSpeed: 0, dlTotal: 0, upTotal: 0 });
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [magnetUrl, setMagnetUrl] = useState('');
  const [savePath, setSavePath] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [togglingHash, setTogglingHash] = useState<string | null>(null);

  // RuTracker Search Modal states
  const [showRutrackerModal, setShowRutrackerModal] = useState(false);
  const [ruSearchQuery, setRuSearchQuery] = useState('');
  const [ruSearching, setRuSearching] = useState(false);
  const [ruReleases, setRuReleases] = useState<RutrackerRelease[]>([]);
  const [ruError, setRuError] = useState<string | null>(null);
  const [ruConfigured, setRuConfigured] = useState<boolean | null>(null);
  const [ruDownloadingId, setRuDownloadingId] = useState<number | null>(null);
  const [ruSuccessMap, setRuSuccessMap] = useState<Record<number, boolean>>({});
  const [ruStatusMsg, setRuStatusMsg] = useState<string | null>(null);
  const [ruCopyingId, setRuCopyingId] = useState<number | null>(null);
  const [ruCopiedId, setRuCopiedId] = useState<number | null>(null);

  const handleCopyRuMagnet = async (release: RutrackerRelease) => {
    setRuCopyingId(release.id);
    try {
      const res = await api.get(`/rutracker/magnet/${release.id}`);
      if (res.data?.magnet) {
        await navigator.clipboard.writeText(res.data.magnet);
        setRuCopiedId(release.id);
        setTimeout(() => setRuCopiedId(null), 3000);
      }
    } catch (err: any) {
      await alert({
        title: 'Ошибка',
        message: `Не удалось скопировать magnet-ссылку: ${err.response?.data?.error || err.message}`,
        variant: 'danger',
      });
    } finally {
      setRuCopyingId(null);
    }
  };

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);

  const performRuSearch = async (searchTerm?: string) => {
    const q = (searchTerm !== undefined ? searchTerm : ruSearchQuery).trim();
    if (!q) return;

    setRuSearching(true);
    setRuError(null);
    setRuStatusMsg(null);
    try {
      const res = await api.get('/rutracker/search', { params: { q } });
      if (res.data.configured === false) {
        setRuConfigured(false);
        setRuError(res.data.error || 'RuTracker не настроен в Настройках');
      } else {
        setRuConfigured(true);
        if (res.data.error) {
          setRuError(res.data.error);
        } else {
          setRuReleases(res.data.releases || []);
        }
      }
    } catch (err: any) {
      setRuError(err.response?.data?.error || err.message || 'Ошибка поиска раздач');
    } finally {
      setRuSearching(false);
    }
  };

  const handleDownloadRuRelease = async (release: RutrackerRelease) => {
    setRuDownloadingId(release.id);
    setRuStatusMsg(null);
    try {
      await api.post('/rutracker/download', {
        topicId: release.id,
      });
      setRuSuccessMap((prev) => ({ ...prev, [release.id]: true }));
      setRuStatusMsg(`Раздача #${release.id} отправлена в qBittorrent!`);
      loadTorrents();
      setTimeout(() => setRuStatusMsg(null), 5000);
    } catch (err: any) {
      await alert({
        title: 'Ошибка',
        message: `Ошибка добавления торрента: ${err.response?.data?.error || err.message}`,
        variant: 'danger',
      });
    } finally {
      setRuDownloadingId(null);
    }
  };

  useEffect(() => {
    const prefillSearch = searchParams.get('search');
    if (prefillSearch) {
      setRuSearchQuery(prefillSearch);
      setShowRutrackerModal(true);
      performRuSearch(prefillSearch);
    }
    loadTorrents();
    const interval = setInterval(loadTorrents, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadTorrents = async () => {
    try {
      const res = await api.get('/torrents/list');
      setConnected(res.data.connected);
      if (res.data.connected) {
        setTorrents(res.data.torrents || []);
        setTransfer(res.data.transfer || { dlSpeed: 0, upSpeed: 0, dlTotal: 0, upTotal: 0 });
        setErrorMsg(null);
      } else {
        setErrorMsg(res.data.error || 'qBittorrent недоступен');
      }
    } catch (err: any) {
      setConnected(false);
      setErrorMsg('Не удалось связаться с бэкендом или qBittorrent');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTorrent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('torrents', selectedFile);
        if (savePath) formData.append('savepath', savePath);
        await api.post('/torrents/upload', formData);
      } else if (magnetUrl.trim()) {
        await api.post('/torrents/add', {
          urls: magnetUrl.trim(),
          savePath: savePath.trim() || undefined,
        });
      }

      setMagnetUrl('');
      setSelectedFile(null);
      setShowAddModal(false);
      loadTorrents();
    } catch (err: any) {
      await alert({
        title: 'Ошибка',
        message: `Ошибка добавления торрента: ${err.response?.data?.error || err.message}`,
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isTorrentPaused = (state: string) => {
    const s = (state || '').toLowerCase();
    return s.includes('stop') || s.includes('pause');
  };

  const getTorrentStateBadge = (state: string) => {
    const s = (state || '').toLowerCase();
    if (s.includes('error') || s.includes('missing')) {
      return { label: 'Ошибка', className: 'text-red-400 bg-red-500/15 border-red-500/30' };
    }
    if (s.includes('paused') || s.includes('stop')) {
      if (s.includes('up')) {
        return { label: 'Завершён (пауза)', className: 'text-slate-300 bg-slate-600/20 border-slate-500/30' };
      }
      return { label: 'Приостановлен', className: 'text-amber-300 bg-amber-500/15 border-amber-500/30' };
    }
    if (s.includes('download') || s.includes('metadl')) {
      return { label: 'Загрузка', className: 'text-steam-cyan bg-cyan-500/15 border-cyan-500/30' };
    }
    if (s.includes('upload') || s.includes('seed')) {
      return { label: 'Раздача', className: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' };
    }
    if (s.includes('stalled')) {
      if (s.includes('dl')) {
        return { label: 'Поиск пиров', className: 'text-sky-300 bg-sky-500/15 border-sky-500/30' };
      }
      return { label: 'Раздача (нет пиров)', className: 'text-slate-400 bg-slate-600/15 border-slate-500/20' };
    }
    if (s.includes('check')) {
      return { label: 'Проверка данных', className: 'text-purple-300 bg-purple-500/15 border-purple-500/30' };
    }
    if (s.includes('queued')) {
      return { label: 'В очереди', className: 'text-slate-400 bg-slate-600/15 border-slate-500/20' };
    }
    if (s.includes('allocat')) {
      return { label: 'Выделение места', className: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30' };
    }
    if (s.includes('mov')) {
      return { label: 'Перемещение', className: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30' };
    }
    return { label: state || 'Неизвестно', className: 'text-slate-400 bg-slate-600/15 border-slate-500/20' };
  };

  const togglePause = async (hash: string, isPaused: boolean) => {
    setTogglingHash(hash);
    try {
      if (isPaused) {
        await api.post('/torrents/resume', { hashes: hash });
      } else {
        await api.post('/torrents/pause', { hashes: hash });
      }
      await loadTorrents();
    } catch (err: any) {
      console.error('Failed to toggle torrent pause state', err);
      await alert({
        title: 'Ошибка',
        message: `Не удалось ${isPaused ? 'возобновить' : 'приостановить'} загрузку торрента: ${err.response?.data?.error || err.message}`,
        variant: 'danger',
      });
    } finally {
      setTogglingHash(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.post('/torrents/delete', {
        hashes: deleteTarget,
        deleteFiles,
      });
      setDeleteTarget(null);
      setDeleteFiles(false);
      loadTorrents();
    } catch (err: any) {
      console.error('Failed to delete torrent', err);
      await alert({
        title: 'Ошибка удаления',
        message: `Не удалось удалить торрент: ${err.response?.data?.error || err.message}`,
        variant: 'danger',
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    return `${formatBytes(bytesPerSec)}/s`;
  };

  const formatEta = (seconds: number) => {
    if (seconds <= 0 || seconds >= 8640000) return '—';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}ч ${mins}м`;
    return `${mins} мин`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      {/* Top Disclaimer Banner */}
      <TorrentDisclaimer />

      {/* Header and Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <DownloadCloud className="w-7 h-7 text-steam-cyan" />
            Загрузки qBittorrent
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Управление активными торрентами, скоростью и скачанными дистрибутивами.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              setShowRutrackerModal(true);
              if (ruSearchQuery && ruReleases.length === 0) {
                performRuSearch();
              }
            }}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <Search className="w-4 h-4" />
            <span>Поиск на RuTracker</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-xs sm:text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Вручную</span>
          </button>

          <button
            onClick={loadTorrents}
            className="p-2 sm:p-2.5 rounded-xl bg-steam-card hover:bg-steam-cardHover text-slate-300 hover:text-white border border-steam-border transition-colors cursor-pointer flex-shrink-0"
            title="Обновить список"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Global Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-steam-card border border-steam-border/80 flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              connected ? 'bg-emerald-400 shadow-md shadow-emerald-400/50' : 'bg-red-500'
            }`}
          />
          <div>
            <div className="text-xs text-slate-400 font-medium">Статус qBittorrent</div>
            <div className="text-sm font-bold text-white">
              {connected ? 'Подключен' : 'Недоступен'}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-steam-card border border-steam-border/80 flex items-center gap-3">
          <ArrowDown className="w-5 h-5 text-steam-cyan flex-shrink-0" />
          <div>
            <div className="text-xs text-slate-400 font-medium">Скорость загрузки</div>
            <div className="text-sm font-bold text-white font-mono">{formatSpeed(transfer.dlSpeed)}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-steam-card border border-steam-border/80 flex items-center gap-3">
          <ArrowUp className="w-5 h-5 text-steam-accent flex-shrink-0" />
          <div>
            <div className="text-xs text-slate-400 font-medium">Скорость отдачи</div>
            <div className="text-sm font-bold text-white font-mono">{formatSpeed(transfer.upSpeed)}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-steam-card border border-steam-border/80 flex items-center gap-3">
          <HardDrive className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div>
            <div className="text-xs text-slate-400 font-medium">Активных раздач</div>
            <div className="text-sm font-bold text-white">{torrents.length}</div>
          </div>
        </div>
      </div>

      {errorMsg && !connected && (
        <div className="p-4 mb-6 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">qBittorrent Web UI недоступен</div>
            <div className="text-xs text-red-300/90 mt-0.5">
              Убедитесь, что служба qBittorrent запущена, и проверьте адрес подключения в Настройках ({errorMsg}).
            </div>
          </div>
        </div>
      )}

      {/* Torrents Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 text-steam-blue animate-spin mb-3" />
          <p className="text-sm">Загрузка списка закачек...</p>
        </div>
      ) : torrents.length === 0 ? (
        <div className="text-center py-20 bg-steam-card/40 rounded-2xl border border-steam-border/70 p-8">
          <div className="w-16 h-16 rounded-2xl bg-steam-cardHover/70 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <DownloadCloud className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Активных закачек пока нет</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Добавьте magnet-ссылку или .torrent файл, чтобы начать загрузку дистрибутива.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить первый торрент</span>
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Cards View (sm:hidden) */}
          <div className="block sm:hidden space-y-3">
            {torrents.map((t) => {
              const isPaused = isTorrentPaused(t.state);
              const stateBadge = getTorrentStateBadge(t.state);
              const isToggling = togglingHash === t.hash;
              return (
                <div
                  key={t.hash}
                  className="p-4 rounded-2xl bg-steam-card border border-steam-border/80 shadow-md space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white text-sm truncate" title={t.name}>
                        {t.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${stateBadge.className}`}>
                          {stateBadge.label}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          • {formatBytes(t.size)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => togglePause(t.hash, isPaused)}
                        disabled={isToggling}
                        className="p-2 rounded-xl bg-steam-nav text-slate-200 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        title={isPaused ? 'Возобновить скачивание' : 'Приостановить скачивание'}
                      >
                        {isToggling ? (
                          <Loader2 className="w-4 h-4 text-steam-cyan animate-spin" />
                        ) : isPaused ? (
                          <Play className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Pause className="w-4 h-4 text-amber-400" />
                        )}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(t.hash)}
                        className="p-2 rounded-xl bg-steam-nav text-slate-300 hover:text-red-400 cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Прогресс</span>
                      <span className="text-white font-bold">{t.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-steam-blue to-steam-cyan h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, t.progress))}%` }}
                      />
                    </div>
                  </div>

                  {/* Speeds & ETA */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Загрузка:</span>
                      <span className="text-steam-cyan font-bold">↓ {formatSpeed(t.downloadSpeed)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Отдача:</span>
                      <span className="text-indigo-300 font-bold">↑ {formatSpeed(t.uploadSpeed)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (hidden sm:block) */}
          <div className="hidden sm:block bg-steam-card border border-steam-border/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-steam-nav text-xs uppercase text-slate-400 font-semibold border-b border-steam-border">
                  <tr>
                    <th className="px-5 py-3.5">Название</th>
                    <th className="px-5 py-3.5">Размер</th>
                    <th className="px-5 py-3.5">Прогресс</th>
                    <th className="px-5 py-3.5">Скорость DL / UL</th>
                    <th className="px-5 py-3.5">Сиды / Пиры</th>
                    <th className="px-5 py-3.5">ETA</th>
                    <th className="px-5 py-3.5 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steam-border/50">
                  {torrents.map((t) => {
                    const isPaused = isTorrentPaused(t.state);
                    const stateBadge = getTorrentStateBadge(t.state);
                    const isToggling = togglingHash === t.hash;
                    return (
                      <tr key={t.hash} className="hover:bg-steam-cardHover/50 transition-colors">
                        <td className="px-5 py-4 max-w-xs sm:max-w-md">
                          <div className="font-semibold text-slate-100 truncate" title={t.name}>
                            {t.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${stateBadge.className}`}>
                              {stateBadge.label}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">({t.state})</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap font-mono text-xs">
                          {formatBytes(t.size)}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-steam-blue to-steam-cyan h-2 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, t.progress))}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold font-mono text-slate-200">
                              {t.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap font-mono text-xs">
                          <div className="text-steam-cyan font-medium">↓ {formatSpeed(t.downloadSpeed)}</div>
                          <div className="text-slate-400 text-[11px]">↑ {formatSpeed(t.uploadSpeed)}</div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap font-mono text-xs">
                          {t.seeds} ({t.totalSeeds}) / {t.peers} ({t.totalPeers})
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs font-mono text-slate-400">
                          {formatEta(t.eta)}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => togglePause(t.hash, isPaused)}
                              disabled={isToggling}
                              className="p-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title={isPaused ? 'Возобновить скачивание' : 'Приостановить скачивание'}
                            >
                              {isToggling ? (
                                <Loader2 className="w-4 h-4 text-steam-cyan animate-spin" />
                              ) : isPaused ? (
                                <Play className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Pause className="w-4 h-4 text-amber-400" />
                              )}
                            </button>
                            <button
                              onClick={() => setDeleteTarget(t.hash)}
                              className="p-1.5 rounded-lg bg-steam-nav hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add Torrent Modal */}
      {showAddModal && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg my-auto bg-steam-nav border border-steam-border/90 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-7 relative text-left"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-steam-cyan" />
              Добавление торрента
            </h3>

            <form onSubmit={handleAddTorrent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Magnet-ссылка или URL .torrent
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={magnetUrl}
                    onChange={(e) => setMagnetUrl(e.target.value)}
                    placeholder="magnet:?xt=urn:btih:..."
                    disabled={!!selectedFile}
                    className="w-full bg-steam-card text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-9 pr-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                  />
                  <LinkIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                </div>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-steam-border/60"></div>
                <span className="flex-shrink mx-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Или загрузите файл</span>
                <div className="flex-grow border-t border-steam-border/60"></div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Файл .torrent с диска
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-steam-border rounded-xl cursor-pointer bg-steam-card/50 hover:bg-steam-cardHover transition-colors">
                    <div className="flex flex-col items-center justify-center pt-2 pb-3">
                      <Upload className="w-6 h-6 text-slate-400 mb-1" />
                      <p className="text-xs text-slate-300">
                        {selectedFile ? selectedFile.name : 'Выберите или перетащите .torrent файл'}
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".torrent"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Папка для сохранения (опционально)
                </label>
                <input
                  type="text"
                  value={savePath}
                  onChange={(e) => setSavePath(e.target.value)}
                  placeholder="/host_root/games/downloads"
                  className="w-full bg-steam-card text-slate-100 placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white bg-steam-card hover:bg-steam-cardHover border border-steam-border text-center cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting || (!magnetUrl.trim() && !selectedFile)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-steam-blue hover:bg-steam-blueHover disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 text-center cursor-pointer"
                >
                  {submitting ? 'Добавление...' : 'Начать загрузку'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setDeleteTarget(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl shadow-2xl p-5 sm:p-6 text-left"
          >
            <h3 className="text-lg font-bold text-white mb-2">Удаление торрента</h3>
            <p className="text-sm text-slate-300 mb-4">
              Вы уверены, что хотите удалить этот торрент из списка qBittorrent?
            </p>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-steam-card border border-steam-border cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="w-4 h-4 rounded text-red-500 focus:ring-red-400 bg-slate-900 border-slate-700 cursor-pointer"
              />
              <span className="text-xs font-semibold text-red-300">
                Также безвозвратно удалить скачанные файлы с диска
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white bg-steam-card hover:bg-steam-cardHover border border-steam-border text-center cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 text-center cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* RuTracker Search & Download Modal */}
      {showRutrackerModal && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowRutrackerModal(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl my-auto max-h-[90vh] overflow-y-auto bg-steam-nav border border-steam-border/90 rounded-2xl shadow-2xl p-5 sm:p-6 text-left"
          >
            {/* Close button */}
            <button
              onClick={() => setShowRutrackerModal(false)}
              className="absolute top-4 right-4 z-50 p-2 bg-black/70 hover:bg-red-600 text-white rounded-full border border-white/20 transition-all cursor-pointer"
              title="Закрыть (Esc)"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <DownloadCloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Автопоиск раздач на RuTracker</h3>
                <p className="text-xs text-slate-400">Поиск лучших раздач с автоматической сортировкой по сидам и загрузкой в 1 клик</p>
              </div>
            </div>

            {/* Notification message */}
            {ruStatusMsg && (
              <div className="mb-4 p-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{ruStatusMsg}</span>
              </div>
            )}

            {/* Search Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                performRuSearch();
              }}
              className="flex items-center gap-2 mb-4"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ruSearchQuery}
                  onChange={(e) => setRuSearchQuery(e.target.value)}
                  placeholder="Введите название игры (например: Cyberpunk 2077, Ведьмак 3, Baldur's Gate 3)..."
                  className="w-full bg-steam-card text-slate-100 text-sm rounded-xl pl-9 pr-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                />
              </div>
              <button
                type="submit"
                disabled={ruSearching || !ruSearchQuery.trim()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {ruSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Найти</span>
              </button>
            </form>

            {/* Error or Not Configured Warning */}
            {ruError && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>{ruError}</span>
                </div>
                {ruConfigured === false && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowRutrackerModal(false);
                      navigate('/settings');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-semibold transition-all cursor-pointer self-start sm:self-auto"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    <span>Настроить в параметрах</span>
                  </button>
                )}
              </div>
            )}

            {/* Loading state */}
            {ruSearching && (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
                <p className="text-sm font-medium">Поиск и анализ раздач на RuTracker...</p>
              </div>
            )}

            {/* Results list */}
            {!ruSearching && ruReleases.length > 0 && (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                <div className="text-xs text-slate-400 px-1 pb-1 flex items-center justify-between">
                  <span>Найдено раздач: <b>{ruReleases.length}</b> (сортировка по сидам)</span>
                </div>
                {ruReleases.map((rel) => {
                  const isDownloaded = ruSuccessMap[rel.id];
                  const isDownloading = ruDownloadingId === rel.id;
                  return (
                    <div
                      key={rel.id}
                      className="p-3.5 rounded-xl bg-steam-card hover:bg-steam-cardHover border border-steam-border/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] truncate max-w-[200px]">
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
                          disabled={ruCopyingId === rel.id}
                          onClick={() => handleCopyRuMagnet(rel)}
                          className={`p-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                            ruCopiedId === rel.id
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
                          }`}
                          title="Скопировать Magnet-ссылку"
                        >
                          {ruCopyingId === rel.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          ) : ruCopiedId === rel.id ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="hidden sm:inline">Скопировано</span>
                            </>
                          ) : (
                            <>
                              <Magnet className="w-4 h-4 text-rose-400" />
                              <span className="hidden sm:inline">Magnet</span>
                            </>
                          )}
                        </button>

                        {/* Send to qBittorrent */}
                        <button
                          type="button"
                          disabled={isDownloading || isDownloaded}
                          onClick={() => handleDownloadRuRelease(rel)}
                          className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isDownloaded
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25 hover:scale-105'
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

            {!ruSearching && !ruError && ruReleases.length === 0 && ruSearchQuery && (
              <div className="py-12 text-center text-xs text-slate-400">
                По данному запросу раздач не найдено. Попробуйте уточнить название или использовать оригинальное английское название.
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
