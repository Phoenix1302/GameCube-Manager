import React, { useState } from 'react';

// Distinct, vibrant neon colors for CPU cores
export const CORE_COLORS = [
  '#38bdf8', // 0: Sky Blue
  '#818cf8', // 1: Indigo
  '#c084fc', // 2: Purple
  '#f472b6', // 3: Pink
  '#fb7185', // 4: Rose
  '#f97316', // 5: Orange
  '#fbbf24', // 6: Amber
  '#a3e635', // 7: Lime
  '#34d399', // 8: Emerald
  '#2dd4bf', // 9: Teal
  '#22d3ee', // 10: Cyan
  '#60a5fa', // 11: Electric Blue
  '#a78bfa', // 12: Violet
  '#f43f5e', // 13: Crimson
  '#eab308', // 14: Golden Yellow
  '#10b981', // 15: Neon Green
];

// Helper to get color for core index (supports >16 cores by cycling with hue shift)
export function getCoreColor(index: number): string {
  if (index < CORE_COLORS.length) {
    return CORE_COLORS[index];
  }
  const hue = (index * 137.5) % 360; // Golden angle distribution
  return `hsl(${hue}, 90%, 65%)`;
}

// Format bytes per second nicely
export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  const val = (bytesPerSec / Math.pow(k, i)).toFixed(1);
  return `${val} ${sizes[i] || 'B/s'}`;
}

// Format bytes storage nicely
export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Convert series of points to smooth cubic Bézier SVG path
export function getSplinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// Single Resource Area Chart
export const ResourceAreaChart: React.FC<{
  data: number[];
  maxVal?: number;
  unit?: string;
  strokeColor?: string;
  gradientId: string;
  fillColorStart?: string;
  fillColorEnd?: string;
  height?: number;
  label?: string;
}> = ({
  data,
  maxVal = 100,
  unit = '%',
  strokeColor = '#1a9fff',
  gradientId,
  fillColorStart = 'rgba(26, 159, 255, 0.45)',
  fillColorEnd = 'rgba(26, 159, 255, 0.0)',
  height = 140,
  label = 'Нагрузка',
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 500;
  const H = height;
  const padTop = 15;
  const padBottom = 22;
  const padLeft = 32;
  const padRight = 10;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const safeData = data.length === 0 ? [0, 0] : (data.length === 1 ? [data[0], data[0]] : data);
  const n = safeData.length;

  const points = safeData.map((val, idx) => {
    const clamped = Math.max(0, Math.min(maxVal, val));
    const x = padLeft + (idx / (n - 1)) * innerW;
    const y = padTop + innerH - (clamped / maxVal) * innerH;
    return { x, y, val };
  });

  const linePath = getSplinePath(points);
  const lastPt = points[points.length - 1];
  const firstPt = points[0];
  const baselineY = padTop + innerH;
  const areaPath = `${linePath} L ${lastPt.x.toFixed(1)} ${baselineY} L ${firstPt.x.toFixed(1)} ${baselineY} Z`;

  const currentVal = safeData[safeData.length - 1] || 0;
  const minVal = Math.min(...safeData);
  const maxRecorded = Math.max(...safeData);
  const avgVal = Math.round((safeData.reduce((a, b) => a + b, 0) / safeData.length) * 10) / 10;

  return (
    <div className="w-full select-none">
      <div className="relative w-full overflow-hidden rounded-xl bg-slate-950/60 border border-steam-border/50 p-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          style={{ maxHeight: `${height}px` }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColorStart} />
              <stop offset="100%" stopColor={fillColorEnd} />
            </linearGradient>
            <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {[100, 75, 50, 25, 0].map((percent) => {
            const y = padTop + innerH - (percent / 100) * innerH;
            return (
              <g key={percent}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray={percent === 0 || percent === 100 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-500 font-mono font-medium"
                >
                  {percent}
                  {percent === 100 ? unit : ''}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#glow-${gradientId})`}
          />

          {lastPt && (
            <g>
              <circle
                cx={lastPt.x}
                cy={lastPt.y}
                r="6"
                fill={strokeColor}
                opacity="0.35"
                className="animate-ping"
              />
              <circle
                cx={lastPt.x}
                cy={lastPt.y}
                r="3.5"
                fill="#ffffff"
                stroke={strokeColor}
                strokeWidth="2"
              />
            </g>
          )}

          {hoverIndex !== null && points[hoverIndex] && (
            <g>
              <line
                x1={points[hoverIndex].x}
                y1={padTop}
                x2={points[hoverIndex].x}
                y2={baselineY}
                stroke="rgba(255, 255, 255, 0.4)"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <circle
                cx={points[hoverIndex].x}
                cy={points[hoverIndex].y}
                r="4.5"
                fill="#ffffff"
                stroke={strokeColor}
                strokeWidth="2"
              />
            </g>
          )}

          {points.map((pt, idx) => {
            const colW = innerW / (n - 1 || 1);
            return (
              <rect
                key={idx}
                x={pt.x - colW / 2}
                y={padTop}
                width={colW}
                height={innerH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>

        {hoverIndex !== null && points[hoverIndex] && (
          <div
            className="absolute top-2 pointer-events-none px-2 py-1 rounded bg-black/85 text-[10px] font-mono font-bold text-white border border-white/20 backdrop-blur-sm shadow-lg -translate-x-1/2"
            style={{
              left: `${(points[hoverIndex].x / W) * 100}%`,
            }}
          >
            {label}: {points[hoverIndex].val}
            {unit}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 px-1 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span>
            Мин: <strong className="text-slate-200">{minVal}{unit}</strong>
          </span>
          <span>
            Средн: <strong className="text-slate-200">{avgVal}{unit}</strong>
          </span>
          <span>
            Макс: <strong className="text-slate-200">{maxRecorded}{unit}</strong>
          </span>
        </div>
        <div className="text-slate-300">
          Сейчас: <strong style={{ color: strokeColor }}>{currentVal}{unit}</strong>
        </div>
      </div>
    </div>
  );
};

// MULTI-CORE COLORFUL CPU TIMELINE CHART
export const MultiCoreCpuChart: React.FC<{
  coresHistory: number[][]; // Array of history points per core [core0[], core1[]...]
  coresLoad: number[];
  selectedCore: number | 'all';
  onSelectCore: (core: number | 'all') => void;
  height?: number;
}> = ({
  coresHistory,
  coresLoad,
  selectedCore,
  onSelectCore,
  height = 150,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 500;
  const H = height;
  const padTop = 15;
  const padBottom = 22;
  const padLeft = 32;
  const padRight = 10;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const baselineY = padTop + innerH;

  const numCores = coresHistory.length;
  const samplesCount = coresHistory[0]?.length || 2;

  // Build points for each core
  const corePaths = coresHistory.map((history, coreIdx) => {
    const safeData = history.length === 0 ? [0, 0] : (history.length === 1 ? [history[0], history[0]] : history);
    const n = safeData.length;
    const color = getCoreColor(coreIdx);

    const points = safeData.map((val, idx) => {
      const clamped = Math.max(0, Math.min(100, val));
      const x = padLeft + (idx / (n - 1 || 1)) * innerW;
      const y = padTop + innerH - (clamped / 100) * innerH;
      return { x, y, val };
    });

    const path = getSplinePath(points);
    const lastPt = points[points.length - 1];

    return {
      coreIdx,
      color,
      points,
      path,
      lastPt,
      currentLoad: coresLoad[coreIdx] ?? safeData[safeData.length - 1] ?? 0,
    };
  });

  return (
    <div className="w-full select-none space-y-3">
      {/* Chart Canvas */}
      <div className="relative w-full overflow-hidden rounded-xl bg-slate-950/70 border border-steam-border/60 p-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          style={{ maxHeight: `${height}px` }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Y-Axis Gridlines */}
          {[100, 75, 50, 25, 0].map((percent) => {
            const y = padTop + innerH - (percent / 100) * innerH;
            return (
              <g key={percent}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray={percent === 0 || percent === 100 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-500 font-mono font-medium"
                >
                  {percent}%
                </text>
              </g>
            );
          })}

          {/* Render lines for each core */}
          {corePaths.map(({ coreIdx, color, path, lastPt }) => {
            const isTarget = selectedCore === 'all' || selectedCore === coreIdx;
            const isSolo = selectedCore === coreIdx;

            return (
              <g key={coreIdx} opacity={isTarget ? 1 : 0.12} className="transition-opacity duration-200">
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={isSolo ? 3 : 1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Pulsating dot for isolated or active core */}
                {(isSolo || (selectedCore === 'all' && (coreIdx === 0 || coreIdx === 7))) && lastPt && (
                  <circle
                    cx={lastPt.x}
                    cy={lastPt.y}
                    r={isSolo ? 4 : 2.5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                )}
              </g>
            );
          })}

          {/* Hover Crosshair Column */}
          {hoverIndex !== null && (
            <line
              x1={padLeft + (hoverIndex / (samplesCount - 1 || 1)) * innerW}
              y1={padTop}
              x2={padLeft + (hoverIndex / (samplesCount - 1 || 1)) * innerW}
              y2={baselineY}
              stroke="rgba(255, 255, 255, 0.35)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
          )}

          {/* Hit Test Columns */}
          {Array.from({ length: samplesCount }).map((_, idx) => {
            const colW = innerW / (samplesCount - 1 || 1);
            const x = padLeft + (idx / (samplesCount - 1 || 1)) * innerW;
            return (
              <rect
                key={idx}
                x={x - colW / 2}
                y={padTop}
                width={colW}
                height={innerH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoverIndex !== null && (
          <div
            className="absolute top-2 pointer-events-none px-2.5 py-1.5 rounded-lg bg-black/90 text-[10px] font-mono text-white border border-white/20 backdrop-blur-md shadow-2xl -translate-x-1/2 flex flex-col gap-0.5 z-30"
            style={{
              left: `${((padLeft + (hoverIndex / (samplesCount - 1 || 1)) * innerW) / W) * 100}%`,
            }}
          >
            {selectedCore === 'all' ? (
              <>
                <span className="font-bold text-slate-300 border-b border-white/10 pb-0.5 mb-0.5">
                  Срез по всем ядрам (точка #{hoverIndex + 1}):
                </span>
                <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                  {corePaths.map(({ coreIdx, color, points }) => (
                    <span key={coreIdx} style={{ color }}>
                      #{coreIdx}: {points[hoverIndex]?.val ?? 0}%
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <span className="font-bold" style={{ color: getCoreColor(selectedCore) }}>
                Ядро #{selectedCore}: {corePaths[selectedCore]?.points[hoverIndex]?.val ?? 0}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Status Bar / Active Core Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-1 px-1 text-xs font-mono">
        {selectedCore === 'all' ? (
          <div className="text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-steam-blue animate-pulse" />
            <span className="text-[11px] sm:text-xs">Отображаются все {numCores} ядер одновременно</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-bold" style={{ color: getCoreColor(selectedCore) }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCoreColor(selectedCore) }} />
              <span className="text-[11px] sm:text-xs">Изолировано #{selectedCore} ({corePaths[selectedCore]?.currentLoad ?? 0}%)</span>
            </div>
            <button
              type="button"
              onClick={() => onSelectCore('all')}
              className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
            >
              Сбросить
            </button>
          </div>
        )}

        <span className="text-[10px] text-slate-500">
          Клик по ядру в сетке ниже изолирует поток
        </span>
      </div>
    </div>
  );
};

// MINI SPARKLINE FOR CORE CARDS
export const CoreSparkline: React.FC<{
  data: number[];
  color: string;
  height?: number;
}> = ({ data, color, height = 28 }) => {
  const W = 100;
  const H = height;
  const pad = 2;
  const innerH = H - pad * 2;

  const safeData = data.length === 0 ? [0, 0] : (data.length === 1 ? [data[0], data[0]] : data);
  const n = safeData.length;

  const points = safeData.map((val, idx) => {
    const clamped = Math.max(0, Math.min(100, val));
    const x = (idx / (n - 1 || 1)) * W;
    const y = pad + innerH - (clamped / 100) * innerH;
    return { x, y };
  });

  const linePath = getSplinePath(points);
  const lastPt = points[points.length - 1];
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const gradId = `spark-${color.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {lastPt && <circle cx={lastPt.x} cy={lastPt.y} r="2.5" fill={color} />}
    </svg>
  );
};

// CORES EQUALIZER WITH COLORFUL SPARKLINE GRAPHS
export const CoresVisualizer: React.FC<{
  coresLoad: number[];
  coresHistory?: number[][];
  selectedCore?: number | 'all';
  onSelectCore?: (c: number | 'all') => void;
}> = ({ coresLoad, coresHistory, selectedCore, onSelectCore }) => {
  if (!coresLoad || coresLoad.length === 0) return null;

  return (
    <div className="pt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-semibold text-slate-400 gap-1 mb-2.5">
        <span className="text-[11px] sm:text-xs">Нагрузка по каждому ядру ({coresLoad.length} потоков):</span>
        <span className="text-[10px] text-slate-500 font-mono">Клик по ядру изолирует график</span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 sm:gap-2">
        {coresLoad.map((load, idx) => {
          const color = getCoreColor(idx);
          const history = coresHistory?.[idx] || [load, load];
          const isSelected = selectedCore === idx;

          return (
            <div
              key={idx}
              onClick={() => onSelectCore?.(selectedCore === idx ? 'all' : idx)}
              className={`p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 shadow-lg border-2'
                  : 'bg-steam-nav/90 border-steam-border/70 hover:border-steam-blue/60 hover:bg-steam-nav'
              }`}
              style={{
                borderColor: isSelected ? color : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold" style={{ color }}>
                  #{idx}
                </span>
                <span className="text-[11px] font-bold font-mono text-white">
                  {load}%
                </span>
              </div>

              {/* Colorful Mini Sparkline Graph */}
              <div className="my-1.5 w-full bg-slate-950/80 rounded-lg p-1 border border-white/5">
                <CoreSparkline data={history} color={color} height={24} />
              </div>

              {/* Progress mini bar */}
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(4, Math.min(100, load))}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// MEMORY & SWAP MULTI-SERIES BREAKDOWN CHART
export const MemoryBreakdownChart: React.FC<{
  usedHistory: number[]; // % of RAM
  cachedHistory: number[]; // % of RAM
  freeHistory: number[]; // % of RAM
  swapHistory: number[]; // % of Swap
  totalRam: number;
  usedRam: number;
  cachedRam: number;
  availableRam: number;
  totalSwap: number;
  usedSwap: number;
  height?: number;
}> = ({
  usedHistory,
  cachedHistory,
  freeHistory,
  swapHistory,
  totalRam,
  usedRam,
  cachedRam,
  availableRam,
  totalSwap,
  usedSwap,
  height = 150,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 500;
  const H = height;
  const padTop = 15;
  const padBottom = 22;
  const padLeft = 32;
  const padRight = 10;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const baselineY = padTop + innerH;

  const n = Math.max(usedHistory.length, cachedHistory.length, freeHistory.length, swapHistory.length, 2);

  const buildPoints = (data: number[]) => {
    const safeData = data.length === 0 ? [0, 0] : (data.length === 1 ? [data[0], data[0]] : data);
    return safeData.map((val, idx) => {
      const clamped = Math.max(0, Math.min(100, val));
      const x = padLeft + (idx / (n - 1 || 1)) * innerW;
      const y = padTop + innerH - (clamped / 100) * innerH;
      return { x, y, val };
    });
  };

  const usedPoints = buildPoints(usedHistory);
  const cachedPoints = buildPoints(cachedHistory);
  const freePoints = buildPoints(freeHistory);
  const swapPoints = buildPoints(swapHistory);

  const usedLine = getSplinePath(usedPoints);
  const cachedLine = getSplinePath(cachedPoints);
  const freeLine = getSplinePath(freePoints);
  const swapLine = getSplinePath(swapPoints);

  const lastUsed = usedPoints[usedPoints.length - 1];
  const lastCached = cachedPoints[cachedPoints.length - 1];
  const lastFree = freePoints[freePoints.length - 1];
  const lastSwap = swapPoints[swapPoints.length - 1];

  // Used Area Fill
  const usedArea = `${usedLine} L ${lastUsed.x.toFixed(1)} ${baselineY} L ${usedPoints[0].x.toFixed(1)} ${baselineY} Z`;

  return (
    <div className="w-full select-none space-y-3">
      {/* Chart Canvas */}
      <div className="relative w-full overflow-hidden rounded-xl bg-slate-950/70 border border-steam-border/60 p-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          style={{ maxHeight: `${height}px` }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="usedMemGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 212, 255, 0.35)" />
              <stop offset="100%" stopColor="rgba(0, 212, 255, 0.0)" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[100, 75, 50, 25, 0].map((percent) => {
            const y = padTop + innerH - (percent / 100) * innerH;
            return (
              <g key={percent}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray={percent === 0 || percent === 100 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-500 font-mono font-medium"
                >
                  {percent}%
                </text>
              </g>
            );
          })}

          {/* Used RAM Area */}
          <path d={usedArea} fill="url(#usedMemGrad)" />

          {/* Free RAM (Emerald) */}
          <path
            d={freeLine}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.8"
            strokeDasharray="4 2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Cached / Buffers (Purple) */}
          <path
            d={cachedLine}
            fill="none"
            stroke="#c084fc"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Swap (Amber/Orange) */}
          <path
            d={swapLine}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Used RAM Line (Cyan) - on top */}
          <path
            d={usedLine}
            fill="none"
            stroke="#00d4ff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Live Pulse Markers */}
          {lastUsed && <circle cx={lastUsed.x} cy={lastUsed.y} r="3.5" fill="#00d4ff" stroke="#ffffff" strokeWidth="1.5" />}
          {lastCached && <circle cx={lastCached.x} cy={lastCached.y} r="3" fill="#c084fc" />}
          {lastSwap && <circle cx={lastSwap.x} cy={lastSwap.y} r="3" fill="#f59e0b" />}

          {/* Hover Column Crosshair */}
          {hoverIndex !== null && (
            <line
              x1={padLeft + (hoverIndex / (n - 1 || 1)) * innerW}
              y1={padTop}
              x2={padLeft + (hoverIndex / (n - 1 || 1)) * innerW}
              y2={baselineY}
              stroke="rgba(255, 255, 255, 0.4)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
          )}

          {/* Hit Test Columns */}
          {Array.from({ length: n }).map((_, idx) => {
            const colW = innerW / (n - 1 || 1);
            const x = padLeft + (idx / (n - 1 || 1)) * innerW;
            return (
              <rect
                key={idx}
                x={x - colW / 2}
                y={padTop}
                width={colW}
                height={innerH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoverIndex !== null && (
          <div
            className="absolute top-2 pointer-events-none px-3 py-2 rounded-xl bg-black/95 text-[10px] font-mono text-white border border-white/20 backdrop-blur-md shadow-2xl -translate-x-1/2 flex flex-col gap-1 z-30"
            style={{
              left: `${((padLeft + (hoverIndex / (n - 1 || 1)) * innerW) / W) * 100}%`,
            }}
          >
            <div className="font-bold text-slate-300 border-b border-white/10 pb-0.5">
              Срез памяти #{hoverIndex + 1}:
            </div>
            <div className="flex items-center justify-between gap-3 text-cyan-400">
              <span>● Занято:</span>
              <strong>{usedPoints[hoverIndex]?.val ?? 0}%</strong>
            </div>
            <div className="flex items-center justify-between gap-3 text-purple-300">
              <span>● Кэш/Буфер:</span>
              <strong>{cachedPoints[hoverIndex]?.val ?? 0}%</strong>
            </div>
            <div className="flex items-center justify-between gap-3 text-emerald-400">
              <span>● Свободно:</span>
              <strong>{freePoints[hoverIndex]?.val ?? 0}%</strong>
            </div>
            <div className="flex items-center justify-between gap-3 text-amber-400">
              <span>● Swap (Подкачка):</span>
              <strong>{swapPoints[hoverIndex]?.val ?? 0}%</strong>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Current Values */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono px-1">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
            <span className="text-slate-400 text-[11px]">Занято:</span>
            <strong className="text-cyan-300">{formatBytes(usedRam)}</strong>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-sm shadow-purple-400/50" />
            <span className="text-slate-400 text-[11px]">Кэш:</span>
            <strong className="text-purple-300">{formatBytes(cachedRam)}</strong>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            <span className="text-slate-400 text-[11px]">Свободно:</span>
            <strong className="text-emerald-300">{formatBytes(availableRam)}</strong>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
            <span className="text-slate-400 text-[11px]">Swap:</span>
            <strong className="text-amber-300">
              {formatBytes(usedSwap)} / {formatBytes(totalSwap)}
            </strong>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          ОЗУ Всего: <strong className="text-slate-300">{formatBytes(totalRam)}</strong>
        </div>
      </div>
    </div>
  );
};

// DUAL-LINE AREA CHART FOR NETWORK BANDWIDTH
export const NetworkAreaChart: React.FC<{
  rxHistory: number[];
  txHistory: number[];
  height?: number;
  currentRx?: number;
  currentTx?: number;
}> = ({
  rxHistory,
  txHistory,
  height = 145,
  currentRx = 0,
  currentTx = 0,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 500;
  const H = height;
  const padTop = 15;
  const padBottom = 22;
  const padLeft = 46;
  const padRight = 10;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const safeRx = rxHistory.length === 0 ? [0, 0] : (rxHistory.length === 1 ? [rxHistory[0], rxHistory[0]] : rxHistory);
  const safeTx = txHistory.length === 0 ? [0, 0] : (txHistory.length === 1 ? [txHistory[0], txHistory[0]] : txHistory);
  const n = Math.max(safeRx.length, safeTx.length);

  const maxRaw = Math.max(...safeRx, ...safeTx, 50 * 1024);
  const maxVal = maxRaw * 1.15;

  const rxPoints = safeRx.map((val, idx) => {
    const x = padLeft + (idx / (n - 1 || 1)) * innerW;
    const y = padTop + innerH - (Math.min(val, maxVal) / maxVal) * innerH;
    return { x, y, val };
  });

  const txPoints = safeTx.map((val, idx) => {
    const x = padLeft + (idx / (n - 1 || 1)) * innerW;
    const y = padTop + innerH - (Math.min(val, maxVal) / maxVal) * innerH;
    return { x, y, val };
  });

  const baselineY = padTop + innerH;
  const rxLine = getSplinePath(rxPoints);
  const rxArea = `${rxLine} L ${rxPoints[rxPoints.length - 1].x.toFixed(1)} ${baselineY} L ${rxPoints[0].x.toFixed(1)} ${baselineY} Z`;

  const txLine = getSplinePath(txPoints);
  const txArea = `${txLine} L ${txPoints[txPoints.length - 1].x.toFixed(1)} ${baselineY} L ${txPoints[0].x.toFixed(1)} ${baselineY} Z`;

  const lastRx = rxPoints[rxPoints.length - 1];
  const lastTx = txPoints[txPoints.length - 1];

  return (
    <div className="w-full select-none">
      <div className="relative w-full overflow-hidden rounded-xl bg-slate-950/60 border border-steam-border/50 p-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          style={{ maxHeight: `${height}px` }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="netRxGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 212, 255, 0.4)" />
              <stop offset="100%" stopColor="rgba(0, 212, 255, 0.0)" />
            </linearGradient>
            <linearGradient id="netTxGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(129, 140, 248, 0.4)" />
              <stop offset="100%" stopColor="rgba(129, 140, 248, 0.0)" />
            </linearGradient>
          </defs>

          {[1, 0.5, 0].map((ratio) => {
            const y = padTop + innerH - ratio * innerH;
            const speedAtY = maxVal * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray={ratio === 0 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-500 font-mono font-medium"
                >
                  {formatSpeed(speedAtY)}
                </text>
              </g>
            );
          })}

          <path d={rxArea} fill="url(#netRxGrad)" />
          <path d={rxLine} fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          <path d={txArea} fill="url(#netTxGrad)" />
          <path d={txLine} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {lastRx && <circle cx={lastRx.x} cy={lastRx.y} r="3.5" fill="#ffffff" stroke="#00d4ff" strokeWidth="2" />}
          {lastTx && <circle cx={lastTx.x} cy={lastTx.y} r="3.5" fill="#ffffff" stroke="#818cf8" strokeWidth="2" />}

          {hoverIndex !== null && rxPoints[hoverIndex] && (
            <line
              x1={rxPoints[hoverIndex].x}
              y1={padTop}
              x2={rxPoints[hoverIndex].x}
              y2={baselineY}
              stroke="rgba(255, 255, 255, 0.4)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
          )}

          {rxPoints.map((pt, idx) => {
            const colW = innerW / (n - 1 || 1);
            return (
              <rect
                key={idx}
                x={pt.x - colW / 2}
                y={padTop}
                width={colW}
                height={innerH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>

        {hoverIndex !== null && rxPoints[hoverIndex] && txPoints[hoverIndex] && (
          <div
            className="absolute top-2 pointer-events-none px-2.5 py-1.5 rounded-lg bg-black/90 text-[10px] font-mono text-white border border-white/20 backdrop-blur-sm shadow-xl -translate-x-1/2 flex flex-col gap-0.5"
            style={{
              left: `${(rxPoints[hoverIndex].x / W) * 100}%`,
            }}
          >
            <span className="text-steam-cyan font-bold">
              ↓ Загрузка: {formatSpeed(rxPoints[hoverIndex].val)}
            </span>
            <span className="text-indigo-400 font-bold">
              ↑ Отдача: {formatSpeed(txPoints[hoverIndex].val)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 px-1 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-steam-cyan shadow-sm shadow-cyan-400/50" />
            <span className="text-slate-400 text-[11px]">Загрузка (RX):</span>
            <strong className="text-steam-cyan font-bold">{formatSpeed(currentRx)}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50" />
            <span className="text-slate-400 text-[11px]">Отдача (TX):</span>
            <strong className="text-indigo-300 font-bold">{formatSpeed(currentTx)}</strong>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Пик: <strong className="text-slate-300">{formatSpeed(Math.max(...safeRx, ...safeTx))}</strong>
        </div>
      </div>
    </div>
  );
};
