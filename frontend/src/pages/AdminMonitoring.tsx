import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Cpu,
  Layers,
  HardDrive,
  Network,
  Server,
  Clock,
  Thermometer,
  Zap,
  ArrowDown,
  ArrowUp,
  Gauge,
  Radio,
} from 'lucide-react';
import { api } from '../services/api';
import { SystemStats } from '../types';
import {
  ResourceAreaChart,
  MultiCoreCpuChart,
  MemoryBreakdownChart,
  NetworkAreaChart,
  CoresVisualizer,
  formatBytes,
  formatSpeed,
} from '../components/MetricCharts';

export const AdminMonitoring: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Selected network interface for graph ('all' or specific e.g. 'eth0', 'lo')
  const [selectedIface, setSelectedIface] = useState<string>('all');
  const selectedIfaceRef = useRef<string>('all');

  // Selected CPU core for multi-core chart ('all' or core index number 0..15)
  const [selectedCore, setSelectedCore] = useState<number | 'all'>('all');

  // Real-time rolling metrics history (last 30 points = ~45 seconds)
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [coresHistory, setCoresHistory] = useState<number[][]>([]);

  // RAM breakdown history (in % of total)
  const [usedMemHistory, setUsedMemHistory] = useState<number[]>([]);
  const [cachedMemHistory, setCachedMemHistory] = useState<number[]>([]);
  const [freeMemHistory, setFreeMemHistory] = useState<number[]>([]);
  const [swapHistory, setSwapHistory] = useState<number[]>([]);

  const [netRxHistory, setNetRxHistory] = useState<number[]>([]);
  const [netTxHistory, setNetTxHistory] = useState<number[]>([]);

  useEffect(() => {
    selectedIfaceRef.current = selectedIface;
  }, [selectedIface]);

  const handleIncomingStats = (data: SystemStats) => {
    setStats(data);

    const cpuLoad = data.cpu?.loadPercentage ?? 0;
    const coreLoads = data.cpu?.coresLoad || [];

    // Per-core rolling history
    setCoresHistory((prev) => {
      const count = Math.max(coreLoads.length, prev.length);
      return Array.from({ length: count }, (_, coreIdx) => {
        const val = coreLoads[coreIdx] ?? 0;
        const prevHistory = prev[coreIdx] || [];
        const next = prevHistory.length === 0 ? Array(25).fill(val) : [...prevHistory, val];
        return next.slice(-30);
      });
    });

    // Memory breakdown in % of total RAM
    const totalMem = data.memory?.total || 1;
    const usedPct = Math.round(((data.memory?.used || 0) / totalMem) * 100);
    const cachedPct = Math.round(((data.memory?.cached || 0) / totalMem) * 100);
    const freePct = Math.round(((data.memory?.available || data.memory?.free || 0) / totalMem) * 100);
    const swapPct = data.memory?.swapPercent || 0;

    setUsedMemHistory((prev) => {
      const next = prev.length === 0 ? Array(25).fill(usedPct) : [...prev, usedPct];
      return next.slice(-30);
    });

    setCachedMemHistory((prev) => {
      const next = prev.length === 0 ? Array(25).fill(cachedPct) : [...prev, cachedPct];
      return next.slice(-30);
    });

    setFreeMemHistory((prev) => {
      const next = prev.length === 0 ? Array(25).fill(freePct) : [...prev, freePct];
      return next.slice(-30);
    });

    setSwapHistory((prev) => {
      const next = prev.length === 0 ? Array(25).fill(swapPct) : [...prev, swapPct];
      return next.slice(-30);
    });

    // Calculate network bandwidth based on selected interface or active interfaces
    const ifaceList = data.network || [];
    let curRx = 0;
    let curTx = 0;

    const currentIface = selectedIfaceRef.current;
    if (currentIface === 'all') {
      const externalOnly = ifaceList.filter((n) => n.iface !== 'lo');
      const externalHasTraffic = externalOnly.some((n) => (n.rx_sec || 0) > 0 || (n.tx_sec || 0) > 0);
      const targetInterfaces = externalHasTraffic ? externalOnly : ifaceList;

      curRx = targetInterfaces.reduce((sum, n) => sum + (n.rx_sec || 0), 0);
      curTx = targetInterfaces.reduce((sum, n) => sum + (n.tx_sec || 0), 0);
    } else {
      const target = ifaceList.find((n) => n.iface === currentIface);
      curRx = target?.rx_sec || 0;
      curTx = target?.tx_sec || 0;
    }

    setCpuHistory((prev) => {
      const next = prev.length === 0 ? Array(25).fill(cpuLoad) : [...prev, cpuLoad];
      return next.slice(-30);
    });

    setNetRxHistory((prev) => {
      const next = prev.length === 0 ? Array(25).fill(curRx) : [...prev, curRx];
      return next.slice(-30);
    });

    setNetTxHistory((prev) => {
      const next = prev.length === 0 ? Array(25).fill(curTx) : [...prev, curTx];
      return next.slice(-30);
    });
  };

  useEffect(() => {
    // Initial fetch via HTTP snapshot
    api.get('/system/stats').then((res) => {
      handleIncomingStats(res.data);
    }).catch(() => {});

    // Setup WebSocket stream
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/system/stream`;

    function connectWs() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleIncomingStats(data);
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        // Auto-reconnect in 3s
        setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}д ${hrs}ч ${mins}м`;
    return `${hrs}ч ${mins}м`;
  };

  if (!stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center text-slate-400">
        <Activity className="w-12 h-12 text-steam-blue animate-pulse mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white mb-1">Инициализация системной телеметрии...</h3>
        <p className="text-xs text-slate-400">Подключение к сенсорам процессора, памяти и сети Steam Machine</p>
      </div>
    );
  }

  const currentNetwork = stats.network || [];
  let currentActiveRx = 0;
  let currentActiveTx = 0;

  if (selectedIface === 'all') {
    const ext = currentNetwork.filter((n) => n.iface !== 'lo');
    const hasExt = ext.some((n) => (n.rx_sec || 0) > 0 || (n.tx_sec || 0) > 0);
    const targetList = hasExt ? ext : currentNetwork;
    currentActiveRx = targetList.reduce((sum, n) => sum + (n.rx_sec || 0), 0);
    currentActiveTx = targetList.reduce((sum, n) => sum + (n.tx_sec || 0), 0);
  } else {
    const target = currentNetwork.find((n) => n.iface === selectedIface);
    currentActiveRx = target?.rx_sec || 0;
    currentActiveTx = target?.tx_sec || 0;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300 space-y-8">
      {/* Page Title & Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Activity className="w-7 h-7 text-steam-cyan" />
            Мониторинг ресурсов в реальном времени
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Телеметрия процессора, оперативной памяти, файловых систем и сетевой активности кастомной Steam Machine.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-steam-card border border-steam-border text-xs font-semibold shadow-sm">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                connected ? 'bg-emerald-400 animate-pulse shadow-md shadow-emerald-400/50' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300 font-mono">
              {connected ? 'Live WebSocket (1.5s)' : 'Опрос HTTP'}
            </span>
          </div>
        </div>
      </div>

      {/* Host Summary KPI Pills */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-2xl bg-steam-card/90 border border-steam-border/80 flex items-center gap-2.5 sm:gap-3 shadow-md min-w-0">
          <div className="p-2 sm:p-2.5 rounded-xl bg-steam-blue/20 text-steam-blue flex-shrink-0">
            <Server className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="overflow-hidden min-w-0">
            <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">Дистрибутив / ОС</div>
            <div className="text-xs sm:text-sm font-bold text-white truncate" title={stats.os.distro}>
              {stats.os.distro || stats.os.platform}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-steam-card/90 border border-steam-border/80 flex items-center gap-2.5 sm:gap-3 shadow-md min-w-0">
          <div className="p-2 sm:p-2.5 rounded-xl bg-steam-cyan/20 text-steam-cyan flex-shrink-0">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="overflow-hidden min-w-0">
            <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">Хостнейм</div>
            <div className="text-xs sm:text-sm font-bold text-white truncate" title={stats.os.hostname || 'SteamMachine'}>
              {stats.os.hostname || 'SteamMachine'}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-steam-card/90 border border-steam-border/80 flex items-center gap-2.5 sm:gap-3 shadow-md min-w-0">
          <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 flex-shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="overflow-hidden min-w-0">
            <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">Время работы (Uptime)</div>
            <div className="text-xs sm:text-sm font-bold text-white font-mono truncate">{formatUptime(stats.uptime)}</div>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-steam-card/90 border border-steam-border/80 flex items-center gap-2.5 sm:gap-3 shadow-md min-w-0">
          <div className="p-2 sm:p-2.5 rounded-xl bg-rose-500/20 text-rose-400 flex-shrink-0">
            <Thermometer className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="overflow-hidden min-w-0">
            <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">Температура CPU</div>
            <div className="text-xs sm:text-sm font-bold text-white font-mono truncate">
              {stats.cpu.temperature ? `${stats.cpu.temperature}°C` : 'В норме'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Dual Charts: Multi-Core CPU & Memory/Swap Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Card with Live Multi-Core Colorful Chart */}
        <div className="p-4 sm:p-6 rounded-2xl bg-steam-card/90 border border-steam-border/80 shadow-xl space-y-5">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="p-2 sm:p-2.5 rounded-xl bg-steam-blue/20 text-steam-blue flex-shrink-0">
                <Cpu className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="truncate">Процессор (CPU)</span>
                  <span className="text-xs font-normal text-slate-400 font-mono whitespace-nowrap">
                    {stats.cpu.cores} ядер
                  </span>
                </h3>
                <p className="text-xs text-slate-400 truncate max-w-full" title={stats.cpu.brand}>
                  {stats.cpu.brand}
                </p>
              </div>
            </div>

            <div className="flex items-baseline gap-1 flex-shrink-0 pl-1">
              <span className="text-2xl sm:text-3xl font-black text-steam-accent font-mono tracking-tight">
                {stats.cpu.loadPercentage}
              </span>
              <span className="text-xs sm:text-sm font-bold text-steam-accent/70 font-mono">%</span>
            </div>
          </div>

          {/* Real-time Multi-Core Colorful Chart */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-steam-blue animate-pulse" />
                Разноцветный график нагрузки по ядрам ({stats.cpu.cores} потоков)
              </span>
              <span className="text-[10px] font-mono text-slate-500">Шкала 0 - 100%</span>
            </div>
            <MultiCoreCpuChart
              coresHistory={coresHistory}
              coresLoad={stats.cpu.coresLoad}
              selectedCore={selectedCore}
              onSelectCore={setSelectedCore}
              height={150}
            />
          </div>

          {/* Equalizer Visualizer with Per-Core Sparklines */}
          {stats.cpu.coresLoad && stats.cpu.coresLoad.length > 0 && (
            <div className="border-t border-steam-border/60 pt-4">
              <CoresVisualizer
                coresLoad={stats.cpu.coresLoad}
                coresHistory={coresHistory}
                selectedCore={selectedCore}
                onSelectCore={setSelectedCore}
              />
            </div>
          )}
        </div>

        {/* RAM Card with Live Memory & Swap Breakdown Chart */}
        <div className="p-4 sm:p-6 rounded-2xl bg-steam-card/90 border border-steam-border/80 shadow-xl space-y-5">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="p-2 sm:p-2.5 rounded-xl bg-steam-cyan/20 text-steam-cyan flex-shrink-0">
                <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">Оперативная память и Swap</h3>
                <p className="text-xs text-slate-400 font-mono truncate">
                  Занято {formatBytes(stats.memory.used)} из {formatBytes(stats.memory.total)}
                </p>
              </div>
            </div>

            <div className="flex items-baseline gap-1 flex-shrink-0 pl-1">
              <span className="text-2xl sm:text-3xl font-black text-steam-cyan font-mono tracking-tight">
                {stats.memory.percent}
              </span>
              <span className="text-xs sm:text-sm font-bold text-steam-cyan/70 font-mono">%</span>
            </div>
          </div>

          {/* Real-time Memory Breakdown Chart (Used, Cached, Free, Swap) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-steam-cyan animate-pulse" />
                График ОЗУ и подкачки: Занято / Кэш / Свободно / Swap
              </span>
              <span className="text-[10px] font-mono text-slate-500">Шкала 0 - 100%</span>
            </div>
            <MemoryBreakdownChart
              usedHistory={usedMemHistory}
              cachedHistory={cachedMemHistory}
              freeHistory={freeMemHistory}
              swapHistory={swapHistory}
              totalRam={stats.memory.total}
              usedRam={stats.memory.used}
              cachedRam={stats.memory.cached || 0}
              availableRam={stats.memory.available}
              totalSwap={stats.memory.swapTotal || 0}
              usedSwap={stats.memory.swapUsed || 0}
              height={150}
            />
          </div>

          {/* Segmented Visual Storage Bars for RAM and SWAP */}
          <div className="border-t border-steam-border/60 pt-4 space-y-3">
            {/* Physical RAM Stacked Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">Физическая память (ОЗУ)</span>
                <span className="text-slate-400">
                  {formatBytes(stats.memory.used + (stats.memory.cached || 0))} / {formatBytes(stats.memory.total)}
                </span>
              </div>
              <div className="bg-slate-950 rounded-full h-3 overflow-hidden p-0.5 border border-steam-border/60 flex gap-0.5">
                <div
                  className="bg-cyan-400 h-2 rounded-l-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round((stats.memory.used / stats.memory.total) * 100))}%` }}
                  title={`Занято: ${formatBytes(stats.memory.used)}`}
                />
                <div
                  className="bg-purple-400 h-2 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round(((stats.memory.cached || 0) / stats.memory.total) * 100))}%` }}
                  title={`Кэш/Буфер: ${formatBytes(stats.memory.cached || 0)}`}
                />
                <div
                  className="bg-emerald-500/40 h-2 rounded-r-full transition-all duration-300 flex-1"
                  title={`Свободно: ${formatBytes(stats.memory.available)}`}
                />
              </div>
            </div>

            {/* Swap Stacked Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-amber-300 font-bold">Файл подкачки (SWAP)</span>
                <span className="text-slate-400">
                  {formatBytes(stats.memory.swapUsed || 0)} / {formatBytes(stats.memory.swapTotal || 0)} ({stats.memory.swapPercent || 0}%)
                </span>
              </div>
              <div className="bg-slate-950 rounded-full h-2.5 overflow-hidden p-0.5 border border-steam-border/60">
                <div
                  className="bg-amber-400 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, stats.memory.swapPercent || 0))}%` }}
                />
              </div>
            </div>

            {/* Detailed RAM & Swap 4-card grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-steam-nav/90 border border-steam-border/60">
                <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Занято</div>
                <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
                  {formatBytes(stats.memory.used)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-steam-nav/90 border border-steam-border/60">
                <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Кэш / Буфер</div>
                <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
                  {formatBytes(stats.memory.cached || 0)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-steam-nav/90 border border-steam-border/60">
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Свободно</div>
                <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                  {formatBytes(stats.memory.available)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-steam-nav/90 border border-steam-border/60">
                <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Swap подкачка</div>
                <div className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                  {formatBytes(stats.memory.swapUsed || 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Network and Disks Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Network Card with Real-time Bandwidth Dual Chart */}
        <div className="p-4 sm:p-6 rounded-2xl bg-steam-card/90 border border-steam-border/80 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 flex-shrink-0">
                <Network className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">Сетевая активность</h3>
                <p className="text-xs text-slate-400 truncate">
                  Трафик в реальном времени (Загрузка ↓ / Отдача ↑)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 font-mono text-xs self-start sm:self-auto">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Прием ({selectedIface === 'all' ? 'Все' : selectedIface}):</span>
                <span className="text-steam-cyan font-bold flex items-center justify-end gap-1 text-sm">
                  <ArrowDown className="w-3.5 h-3.5" />
                  {formatSpeed(currentActiveRx)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Отдача ({selectedIface === 'all' ? 'Все' : selectedIface}):</span>
                <span className="text-indigo-300 font-bold flex items-center justify-end gap-1 text-sm">
                  <ArrowUp className="w-3.5 h-3.5" />
                  {formatSpeed(currentActiveTx)}
                </span>
              </div>
            </div>
          </div>

          {/* Interface Selector Pills */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-steam-border/40">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedIface('all')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                  selectedIface === 'all'
                    ? 'bg-gradient-to-r from-steam-blue to-blue-600 text-white shadow-md shadow-blue-500/25 border border-blue-400/40'
                    : 'bg-steam-nav text-slate-400 hover:text-white hover:bg-slate-800 border border-steam-border/60'
                }`}
              >
                Все интерфейсы
              </button>
              {stats.network.map((net) => {
                const isActive = (net.rx_sec > 0 || net.tx_sec > 0);
                const isSelected = selectedIface === net.iface;
                return (
                  <button
                    key={net.iface}
                    type="button"
                    onClick={() => setSelectedIface(net.iface)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 border border-indigo-400/40'
                        : 'bg-steam-nav text-slate-300 hover:text-white hover:bg-slate-800 border border-steam-border/60'
                    }`}
                  >
                    <span>{net.iface}</span>
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              График: <strong className="text-white">{selectedIface === 'all' ? 'Все интерфейсы' : selectedIface}</strong>
            </span>
          </div>

          {/* Real-time Bandwidth Dual Area Chart */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                График скорости сети в реальном времени (45 сек)
              </span>
              <span className="text-[10px] font-mono text-slate-500">Авто-масштаб шкалы</span>
            </div>
            <NetworkAreaChart
              rxHistory={netRxHistory}
              txHistory={netTxHistory}
              currentRx={currentActiveRx}
              currentTx={currentActiveTx}
              height={145}
            />
          </div>

          {/* Interfaces Table */}
          <div className="border-t border-steam-border/60 pt-4 space-y-2">
            <div className="text-xs font-semibold text-slate-400 mb-2">Активные сетевые интерфейсы:</div>
            {stats.network.map((net, idx) => {
              const isSelected = selectedIface === net.iface;
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedIface(net.iface)}
                  className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md shadow-indigo-500/10'
                      : 'bg-steam-nav/90 border-steam-border/60 hover:border-steam-blue/60 hover:bg-steam-nav'
                  }`}
                  title="Нажмите, чтобы показать график этого интерфейса"
                >
                  <div className="min-w-0 flex items-center justify-between sm:block">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm text-slate-100 font-mono">{net.iface}</span>
                      {net.iface === 'lo' && (
                        <span className="text-[10px] text-slate-400 font-normal">(Локальный / Web)</span>
                      )}
                      {net.iface === 'eth0' && (
                        <span className="text-[10px] text-slate-400 font-normal">(Сетевой адаптер)</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 sm:mt-0.5">
                      Статус: <span className="text-emerald-400 font-medium">{net.operstate || 'UP'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 font-mono text-xs pt-1.5 sm:pt-0 border-t sm:border-t-0 border-steam-border/40">
                    <div className="text-left sm:text-right">
                      <div className="text-steam-cyan flex items-center sm:justify-end gap-1 font-bold text-xs sm:text-sm">
                        <ArrowDown className="w-3 h-3 flex-shrink-0" />
                        {formatSpeed(net.rx_sec)}
                      </div>
                      <div className="text-slate-500 text-[9px] sm:text-[10px]">Всего: {formatBytes(net.rx_bytes)}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-indigo-300 flex items-center justify-end gap-1 font-bold text-xs sm:text-sm">
                        <ArrowUp className="w-3 h-3 flex-shrink-0" />
                        {formatSpeed(net.tx_sec)}
                      </div>
                      <div className="text-slate-500 text-[9px] sm:text-[10px]">Всего: {formatBytes(net.tx_bytes)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Disks Card with Visual Storage Capacity */}
        <div className="p-4 sm:p-6 rounded-2xl bg-steam-card/90 border border-steam-border/80 shadow-xl space-y-5">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="p-2 sm:p-2.5 rounded-xl bg-slate-800 text-slate-300 flex-shrink-0">
                <HardDrive className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                  <span className="truncate">Дисковые накопители</span>
                  <span className="text-xs font-normal text-slate-400 font-mono whitespace-nowrap">
                    ({stats.disks.length} разд.)
                  </span>
                </h3>
                <p className="text-xs text-slate-400 truncate">
                  Занятое и свободное дисковое пространство
                </p>
              </div>
            </div>

            <div className="text-xs font-mono text-slate-400 bg-steam-nav px-2.5 py-1 rounded-lg border border-steam-border/60 flex-shrink-0">
              Хранилище
            </div>
          </div>

          {/* Visual Disk Meters */}
          <div className="space-y-4">
            {stats.disks.map((disk, idx) => {
              const freeBytes = Math.max(0, disk.size - disk.used);
              const isHigh = disk.use > 90;
              const isWarning = disk.use > 75;
              const getMountDescription = (mount: string) => {
                if (mount === '/') return 'Системный раздел (Root)';
                if (mount === '/mnt/game_data' || mount.startsWith('/mnt/game_data')) return 'Игровой накопитель';
                if (mount === '/boot/efi') return 'EFI раздел загрузчика';
                if (mount.includes('SteamLibrary')) return 'Библиотека Steam';
                return null;
              };
              const desc = getMountDescription(disk.mount);

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-steam-nav/90 border border-steam-border/60 space-y-3 hover:border-steam-blue/60 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm text-slate-200 font-mono">
                        {disk.mount}
                      </span>
                      {desc && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          • {desc}
                        </span>
                      )}
                      {disk.type && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                          {disk.type}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-sm font-extrabold font-mono ${
                          isHigh ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-steam-accent'
                        }`}
                      >
                        {disk.use}%
                      </span>
                      <span className="text-[10px] text-slate-500">занято</span>
                    </div>
                  </div>

                  {/* Gradient Progress Bar */}
                  <div className="bg-slate-950 rounded-full h-3 overflow-hidden p-0.5 border border-steam-border/60">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        isHigh
                          ? 'bg-gradient-to-r from-orange-500 to-red-500'
                          : isWarning
                          ? 'bg-gradient-to-r from-amber-400 to-orange-400'
                          : 'bg-gradient-to-r from-steam-blue via-steam-cyan to-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, disk.use))}%` }}
                    />
                  </div>

                  {/* Storage Numbers */}
                  <div className="grid grid-cols-3 gap-1 text-[10px] sm:text-[11px] font-mono text-slate-400">
                    <div className="truncate">
                      <span className="text-slate-500">Занято: </span>
                      <strong className="text-slate-200">{formatBytes(disk.used)}</strong>
                    </div>
                    <div className="text-center truncate">
                      <span className="text-slate-500">Свободно: </span>
                      <strong className="text-emerald-400">{formatBytes(freeBytes)}</strong>
                    </div>
                    <div className="text-right truncate">
                      <span className="text-slate-500">Всего: </span>
                      <strong className="text-slate-300">{formatBytes(disk.size)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
