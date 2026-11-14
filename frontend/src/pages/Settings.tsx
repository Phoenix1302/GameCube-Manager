import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  HardDrive,
  DownloadCloud,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  KeyRound,
  ExternalLink,
  Eye,
  EyeOff,
  Database,
  Trash2,
  Sparkles,
  RefreshCw,
  Clock,
  Sliders,
  Magnet,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

interface CacheStats {
  imageCount: number;
  imageSizeBytes: number;
  imageSizeFormatted: string;
  dbSizeBytes: number;
  dbSizeFormatted: string;
  maxSizeMb: number;
  maxAgeDays: number;
  autoClean: boolean;
  browseEntries: number;
  gameEntries: number;
}

export const Settings: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { confirm, alert } = useConfirm();
  const [settings, setSettings] = useState<Record<string, string>>({
    qbittorrent_url: 'http://127.0.0.1:8080',
    qbittorrent_user: 'admin',
    qbittorrent_pass: '',
    steamgriddb_api_key: '',
    steamos_helper_script: '',
    steam_userdata_path: '/home/gamecube/.local/share/Steam/userdata',
    host_root: '/',
    cache_max_size_mb: '500',
    cache_max_age_days: '14',
    cache_auto_clean: 'true',
    rutracker_url: 'https://rutracker.org',
    rutracker_cookie: '',
    rutracker_login: '',
    rutracker_password: '',
    rutracker_download_mode: 'magnet',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showQbPass, setShowQbPass] = useState(false);
  const [showRuPass, setShowRuPass] = useState(false);

  // Cache stats & cleaning states
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cleaningCache, setCleaningCache] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingSteamRestart, setTestingSteamRestart] = useState(false);

  const handleTestSteamRestart = async () => {
    setTestingSteamRestart(true);
    try {
      const res = await api.post('/steam/restart-steam');
      await alert({
        title: 'Тест перезапуска SteamOS',
        message: res.data?.message || 'Команда бесшовного перезапуска выполнена успешно.',
        variant: 'success',
      });
    } catch (err: any) {
      await alert({
        title: 'Ошибка перезапуска',
        message: err.response?.data?.error || err.message,
        variant: 'danger',
      });
    } finally {
      setTestingSteamRestart(false);
    }
  };

  // Test states
  const [testingQb, setTestingQb] = useState(false);
  const [qbResult, setQbResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingGrid, setTestingGrid] = useState(false);
  const [gridResult, setGridResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingRutracker, setTestingRutracker] = useState(false);
  const [rutrackerResult, setRutrackerResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadSettings();
    if (isAdmin) {
      loadCacheStats();
    }
  }, [isAdmin]);

  const loadCacheStats = async () => {
    try {
      const res = await api.get('/settings/cache-stats');
      setCacheStats(res.data);
    } catch (err) {
      console.error('Failed to load cache stats', err);
    }
  };

  const handleCleanCache = async (type: 'images' | 'all') => {
    if (type === 'all') {
      const res = await confirm({
        title: 'Очистка кэша',
        message: 'Очистить весь кэш, включая данные каталога и базу? После этого изображения и списки загрузятся заново при открытии.',
        confirmText: 'Очистить весь кэш',
        cancelText: 'Отмена',
        variant: 'warning',
      });
      if (!res.confirmed) return;
    }
    setCleaningCache(true);
    setCleanResult(null);
    try {
      const res = await api.post('/settings/cache-clean', { type });
      setCleanResult({ success: true, message: res.data.message });
      if (res.data.stats) {
        setCacheStats(res.data.stats);
      }
      setTimeout(() => setCleanResult(null), 5000);
    } catch (err: any) {
      setCleanResult({ success: false, message: err.response?.data?.message || err.message });
    } finally {
      setCleaningCache(false);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings');
      if (res.data.settings) {
        setSettings((prev) => ({ ...prev, ...res.data.settings }));
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post('/settings', settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      await alert({
        title: 'Ошибка сохранения настроек',
        message: err.response?.data?.message || err.message,
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const testQBittorrent = async () => {
    setTestingQb(true);
    setQbResult(null);
    try {
      const res = await api.post('/settings/test-qbittorrent', {
        url: settings.qbittorrent_url,
        username: settings.qbittorrent_user,
        password: settings.qbittorrent_pass,
      });
      setQbResult({ success: true, message: res.data.message || 'Подключение успешно!' });
    } catch (err: any) {
      setQbResult({ success: false, message: err.response?.data?.error || err.message });
    } finally {
      setTestingQb(false);
    }
  };

  const testSteamGridDb = async () => {
    setTestingGrid(true);
    setGridResult(null);
    try {
      const res = await api.post('/settings/test-steamgriddb', {
        apiKey: settings.steamgriddb_api_key,
      });
      setGridResult({ success: true, message: res.data.message || 'API ключ подтвержден!' });
    } catch (err: any) {
      setGridResult({ success: false, message: err.response?.data?.error || err.message });
    } finally {
      setTestingGrid(false);
    }
  };

  const testRutracker = async () => {
    setTestingRutracker(true);
    setRutrackerResult(null);
    try {
      // First save current settings
      await api.post('/settings', settings);
      const res = await api.post('/rutracker/test');
      setRutrackerResult({
        success: res.data.success,
        message: res.data.message || (res.data.success ? 'Авторизация на RuTracker подтверждена!' : 'Ошибка входа'),
      });
    } catch (err: any) {
      setRutrackerResult({
        success: false,
        message: err.response?.data?.error || err.message,
      });
    } finally {
      setTestingRutracker(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center text-slate-400">
        <Loader2 className="w-8 h-8 text-steam-blue animate-spin mx-auto mb-3" />
        <p className="text-sm">Загрузка настроек конфигурации...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <SettingsIcon className="w-7 h-7 text-steam-accent" />
            {isAdmin ? 'Системные настройки' : 'Личные настройки пользователя'}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-steam-cyan/15 text-steam-cyan border border-steam-cyan/30">
              v1.1.1
            </span>
            <span className="text-sm text-slate-400">
              {isAdmin
                ? 'Конфигурация интеграций с qBittorrent, SteamGridDB API и путей к библиотеке Steam.'
                : 'Персональная настройка сессии RuTracker и способов добавления раздач в торрент-клиент.'}
            </span>
          </div>
        </div>

        {saveSuccess && (
          <div className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Настройки успешно сохранены</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* qBittorrent Container Status Section - Admin only */}
        {isAdmin && (
          <div className="p-5 sm:p-6 rounded-2xl bg-steam-card border border-steam-border/80 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <DownloadCloud className="w-5 h-5 text-steam-cyan" />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Встроенный торрент-клиент qBittorrent
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Контейнер
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Работает в изолированном контейнере внутри GameCube Pod на порту 8085 (не конфликтует с нативным клиентом хоста).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/qbittorrent/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-steam-cyan/15 hover:bg-steam-cyan/25 text-xs font-semibold text-steam-cyan border border-steam-cyan/30 transition-colors"
                  title="Открыть полный веб-интерфейс qBittorrent WebUI"
                >
                  <span>Открыть Web UI</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={testQBittorrent}
                  disabled={testingQb}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-xs font-semibold text-slate-200 border border-steam-border transition-colors cursor-pointer"
                >
                  {testingQb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Проверить статус</span>
                </button>
              </div>
            </div>

            {qbResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  qbResult.success
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/15 border-red-500/30 text-red-300'
                }`}
              >
                {qbResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span>{qbResult.message}</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-steam-border/40 text-xs">
              <div className="p-2.5 rounded-xl bg-steam-nav/60 border border-steam-border/40">
                <span className="text-slate-400 block text-[11px]">WebUI порт</span>
                <span className="font-mono font-bold text-white">127.0.0.1:8085</span>
              </div>
              <div className="p-2.5 rounded-xl bg-steam-nav/60 border border-steam-border/40">
                <span className="text-slate-400 block text-[11px]">Peer порт</span>
                <span className="font-mono font-bold text-white">6882 (TCP/UDP)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-steam-nav/60 border border-steam-border/40">
                <span className="text-slate-400 block text-[11px]">Логин</span>
                <span className="font-mono font-bold text-white">admin</span>
              </div>
              <div className="p-2.5 rounded-xl bg-steam-nav/60 border border-steam-border/40">
                <span className="text-slate-400 block text-[11px]">Пароль</span>
                <span className="font-mono font-bold text-white">adminadmin</span>
              </div>
            </div>
          </div>
        )}

        {/* SteamGridDB Section - Admin only */}
        {isAdmin && (
          <div className="p-5 sm:p-6 rounded-2xl bg-steam-card border border-steam-border/80 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ImageIcon className="w-5 h-5 text-steam-accent" />
                <h3 className="text-base font-bold text-white">SteamGridDB API</h3>
              </div>
              <button
                type="button"
                onClick={testSteamGridDb}
                disabled={testingGrid}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-xs font-semibold text-slate-200 border border-steam-border transition-colors cursor-pointer self-start sm:self-auto"
              >
                {testingGrid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Проверить ключ</span>
              </button>
            </div>

            {gridResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  gridResult.success
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/15 border-red-500/30 text-red-300'
                }`}
              >
                {gridResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span>{gridResult.message}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">API Key SteamGridDB</label>
                <a
                  href="https://www.steamgriddb.com/profile/preferences/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-steam-accent hover:underline flex items-center gap-1"
                >
                  <span>Получить бесплатный ключ</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                value={settings.steamgriddb_api_key || ''}
                onChange={(e) => handleChange('steamgriddb_api_key', e.target.value)}
                placeholder="Вставьте ваш токен SteamGridDB (например: 9a7b...)"
                className="w-full bg-steam-nav text-slate-100 font-mono text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
              />
            </div>
          </div>
        )}

        {/* RuTracker Integration - Accessible to both Admin and Users */}
        <div className="p-6 rounded-2xl bg-steam-card border border-steam-border/80 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <DownloadCloud className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Интеграция с RuTracker (Автопоиск раздач)</span>
                  {!isAdmin && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Личные настройки
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAdmin
                    ? 'Позволяет находить и скачивать раздачи прямо из карточки любой игры (системные параметры по умолчанию)'
                    : 'Ваша персональная сессия для поиска и запуска торрентов прямо из карточки игры'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={testRutracker}
              disabled={testingRutracker}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-xs font-semibold text-slate-200 border border-steam-border transition-colors cursor-pointer self-start sm:self-auto"
            >
              {testingRutracker ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Проверить RuTracker</span>
            </button>
          </div>

          {rutrackerResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                rutrackerResult.success
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/15 border-red-500/30 text-red-300'
              }`}
            >
              {rutrackerResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span>{rutrackerResult.message}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Cookie сессии (bb_data / bb_session) — <span className="text-emerald-400 font-bold">Рекомендуемый способ</span>
                </label>
                <a
                  href="https://rutracker.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-steam-accent hover:underline flex items-center gap-1"
                >
                  <span>Открыть rutracker.org</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="text"
                value={settings.rutracker_cookie || ''}
                onChange={(e) => handleChange('rutracker_cookie', e.target.value)}
                placeholder="bb_session=0-4...; cf_clearance=CkZ... (или вся строка Cookie)"
                className="w-full bg-steam-nav text-slate-100 font-mono text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Для обхода Cloudflare: вставьте <code>bb_session=...; cf_clearance=...</code> или скопируйте всю строку <code>Cookie</code> из вкладки <b>Сеть (Network)</b> DevTools браузера.
                {!isAdmin && <span className="text-steam-cyan block mt-0.5">Ваши cookie хранятся строго в вашем личном профиле.</span>}
              </p>
            </div>

            {/* Mode selection: Magnet vs .torrent file */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Magnet className="w-4 h-4 text-emerald-400" />
                <span>Способ загрузки в qBittorrent</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleChange('rutracker_download_mode', 'magnet')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    settings.rutracker_download_mode !== 'torrent'
                      ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30'
                      : 'bg-steam-nav/60 border-steam-border/60 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Magnet className="w-3.5 h-3.5 text-emerald-400" />
                      Magnet-ссылка
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      Рекомендуется
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-snug">
                    Передаёт раздачу напрямую в qBittorrent через Magnet URI. Не требует скачивания .torrent файлов и не расходует слоты трекера.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleChange('rutracker_download_mode', 'torrent')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    settings.rutracker_download_mode === 'torrent'
                      ? 'bg-steam-blue/10 border-steam-blue/40 ring-1 ring-steam-blue/30'
                      : 'bg-steam-nav/60 border-steam-border/60 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <DownloadCloud className="w-3.5 h-3.5 text-steam-blue" />
                      Файл .torrent
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-snug">
                    Скачивает файл .torrent через dl.php и отправляет multipart-запросом в qBittorrent.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Логин на RuTracker (резервный)
                </label>
                <input
                  type="text"
                  value={settings.rutracker_login || ''}
                  onChange={(e) => handleChange('rutracker_login', e.target.value)}
                  placeholder="Ваш логин на форуме"
                  className="w-full bg-steam-nav text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Пароль на RuTracker
                </label>
                <div className="relative">
                  <input
                    type={showRuPass ? 'text' : 'password'}
                    value={settings.rutracker_password || ''}
                    onChange={(e) => handleChange('rutracker_password', e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-steam-nav text-slate-100 text-sm rounded-xl px-4 py-2.5 pr-10 border border-steam-border focus:outline-none focus:border-steam-blue"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRuPass(!showRuPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showRuPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Адрес трекера / зеркала
              </label>
              <input
                type="text"
                value={settings.rutracker_url || 'https://rutracker.org'}
                onChange={(e) => handleChange('rutracker_url', e.target.value)}
                placeholder="https://rutracker.org"
                className="w-full bg-steam-nav text-slate-100 font-mono text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
              />
            </div>
          </div>
        </div>

        {/* System & Steam Paths - Admin only */}
        {isAdmin && (
          <div className="p-6 rounded-2xl bg-steam-card border border-steam-border/80 shadow-xl space-y-5">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-slate-400" />
              <h3 className="text-base font-bold text-white">Пути файловой системы Steam & Хоста</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Путь к директории userdata Steam
                </label>
                <input
                  type="text"
                  value={settings.steam_userdata_path || ''}
                  onChange={(e) => handleChange('steam_userdata_path', e.target.value)}
                  placeholder="/home/gamecube/.local/share/Steam/userdata"
                  className="w-full bg-steam-nav text-slate-100 font-mono text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Используется для чтения и сохранения ярлыков <code>shortcuts.vdf</code> и постеров в <code>grid/</code>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Пользовательский скрипт перезапуска SteamOS / Gamescope (опционально)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={settings.steamos_helper_script || ''}
                    onChange={(e) => handleChange('steamos_helper_script', e.target.value)}
                    placeholder="/usr/local/bin/gamecube-restart-steam"
                    className="flex-1 bg-steam-nav text-slate-100 font-mono text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                  />
                  <button
                    type="button"
                    onClick={handleTestSteamRestart}
                    disabled={testingSteamRestart}
                    className="px-4 py-2.5 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 shadow-md shadow-blue-500/20"
                    title="Проверить выполнение скрипта перезапуска без вылета в SDDM"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingSteamRestart ? 'animate-spin' : ''}`} />
                    <span>{testingSteamRestart ? 'Запуск...' : 'Тест перезапуска'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Вызывается для бесшовного мягкого перезапуска Game Mode без сброса в окно SDDM (greeter). По умолчанию используется встроенный хелпер <code>/usr/local/bin/gamecube-restart-steam</code> с автоматической настройкой <code>Relogin=true</code>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Корневой путь файлового менеджера и терминала (Host Root)
                </label>
                <input
                  type="text"
                  value={settings.host_root || ''}
                  onChange={(e) => handleChange('host_root', e.target.value)}
                  placeholder="/"
                  className="w-full bg-steam-nav text-slate-100 font-mono text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                />
              </div>
            </div>
          </div>
        )}

        {/* Cache & Storage Management - Admin only */}
        {isAdmin && (
          <div className="p-6 rounded-2xl bg-steam-card border border-steam-border/80 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-steam-accent" />
                <div>
                  <h3 className="text-base font-bold text-white">Управление кэшем и дисковым пространством</h3>
                  <p className="text-xs text-slate-400">Автоматическая очистка обложек и записей для экономии места на диске</p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadCacheStats}
                title="Обновить размер кэша"
                className="p-2 rounded-xl bg-steam-nav hover:bg-slate-800 text-slate-300 hover:text-white border border-steam-border transition-all flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Обновить</span>
              </button>
            </div>

            {/* Clean result banner */}
            {cleanResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 animate-in fade-in duration-200 ${
                  cleanResult.success
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-red-500/15 text-red-300 border-red-500/30'
                }`}
              >
                {cleanResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span>{cleanResult.message}</span>
              </div>
            )}

            {/* Metrics summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-steam-nav/70 rounded-xl border border-steam-border/60">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">Кэш картинок</span>
                <span className="text-base font-bold text-white font-mono">{cacheStats?.imageSizeFormatted || '0 B'}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{cacheStats?.imageCount || 0} файлов на SSD</span>
              </div>
              <div className="p-3 bg-steam-nav/70 rounded-xl border border-steam-border/60">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">База данных</span>
                <span className="text-base font-bold text-white font-mono">{cacheStats?.dbSizeFormatted || '0 B'}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">SQLite (WAL + 64MB)</span>
              </div>
              <div className="p-3 bg-steam-nav/70 rounded-xl border border-steam-border/60">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">Лимит на диске</span>
                <span className="text-base font-bold text-steam-accent font-mono">{settings.cache_max_size_mb || '500'} MB</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">LRU-вытеснение</span>
              </div>
              <div className="p-3 bg-steam-nav/70 rounded-xl border border-steam-border/60">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">Автоочистка</span>
                <span className="text-base font-bold text-emerald-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Каждые 30м</span>
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Фоновый процесс</span>
              </div>
            </div>

            {/* Cache Settings Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Максимальный объем кэша изображений
                </label>
                <select
                  value={settings.cache_max_size_mb || '500'}
                  onChange={(e) => handleChange('cache_max_size_mb', e.target.value)}
                  className="w-full bg-steam-nav text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                >
                  <option value="100">100 МБ (Минимальный, для небольших дисков)</option>
                  <option value="250">250 МБ (Компактный)</option>
                  <option value="500">500 МБ (Рекомендуемый, баланс скорости и места)</option>
                  <option value="1000">1000 МБ (1 ГБ, для большой коллекции)</option>
                  <option value="2000">2000 МБ (2 ГБ, максимум кэша)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  При превышении кэш автоматически удаляет самые старые изображения (LRU) до 70% от лимита.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Срок хранения неиспользуемых картинок (TTL)
                </label>
                <select
                  value={settings.cache_max_age_days || '14'}
                  onChange={(e) => handleChange('cache_max_age_days', e.target.value)}
                  className="w-full bg-steam-nav text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                >
                  <option value="3">3 дня (Агрессивная экономия диска)</option>
                  <option value="7">7 дней (1 неделя)</option>
                  <option value="14">14 дней (2 недели, стандарт)</option>
                  <option value="30">30 дней (1 месяц)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Файлы, к которым не обращались дольше этого срока, удаляются автоматически.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="cache_auto_clean"
                checked={settings.cache_auto_clean === 'true'}
                onChange={(e) => handleChange('cache_auto_clean', e.target.checked ? 'true' : 'false')}
                className="w-4 h-4 rounded text-steam-blue bg-steam-nav border-steam-border focus:ring-0 cursor-pointer"
              />
              <label htmlFor="cache_auto_clean" className="text-xs text-slate-300 cursor-pointer select-none">
                Включить регулярную фоновую очистку (каждые 30 минут удаляет устаревшие записи каталога и старые изображения)
              </label>
            </div>

            {/* Manual Clean Action Buttons */}
            <div className="pt-2 border-t border-steam-border/60 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={cleaningCache}
                onClick={() => handleCleanCache('images')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-steam-border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                {cleaningCache ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-amber-400" />}
                <span>Очистить кэш картинок сейчас</span>
              </button>

              <button
                type="button"
                disabled={cleaningCache}
                onClick={() => handleCleanCache('all')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                {cleaningCache ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                <span>Очистить весь кэш (БД + Картинки)</span>
              </button>
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-steam-blue to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Сохранение...' : (isAdmin ? 'Сохранить все настройки' : 'Сохранить личные настройки')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
