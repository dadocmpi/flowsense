import React from 'react';
import { CompassDirection, formatCompassDirection, directionColor } from '../../lib/compassEngine';
import { cn } from '@/lib/utils';

interface CompassDisplayProps {
  direction: CompassDirection;
  score: number;
  confidence: number;
  timestamp: number;
  dataLabel: 'LIVE' | 'DELAYED' | 'CACHED' | 'SIMULATED' | 'UNAVAILABLE';
  secondsUntilNextUpdate: number;
  minutesSinceLastSignal: number;
  factorSummary: string[];
  isStale: boolean;
  reason: string;
}

export const CompassDisplay: React.FC<CompassDisplayProps> = ({
  direction,
  score,
  confidence,
  timestamp,
  dataLabel,
  secondsUntilNextUpdate,
  minutesSinceLastSignal,
  factorSummary,
  isStale,
  reason,
}) => {
  const color = directionColor(direction);
  const formattedDirection = formatCompassDirection(direction);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dataLabelText = dataLabel.toUpperCase();
  const dataLabelColor = {
    LIVE: 'text-green-400',
    DELAYED: 'text-amber-400',
    CACHED: 'text-blue-400',
    SIMULATED: 'text-purple-400',
    UNAVAILABLE: 'text-red-500',
  }[dataLabel] || 'text-white';

  return (
    <div className="relative bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-8 shadow-[0_25px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
      {/* Glow effect */}
      <div className={cn(
        "absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-radial rounded-full blur-3xl pointer-events-none transition-all duration-700 bg-gradient-to-b",
        color === '#26a69a' && "from-[#26a69a]/30",
        color === '#4db6ac' && "from-[#4db6ac]/20",
        color === '#f59e0b' && "from-amber-500/15",
        color === '#e57373' && "from-[#e57373]/20",
        color === '#ef5350' && "from-[#ef5350]/30"
      )} />

      {/* Compass needle */}
      <div className="relative w-full max-w-[340px] mx-auto flex flex-col items-center justify-center my-4 z-10">
        <div className="relative w-72 h-36 flex items-end justify-center">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 300 150">
            <path
              d="M 55 135 A 95 95 0 0 1 245 135"
              fill="none"
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            {/* Tick marks */}
            {Array.from({ length: 35 }, (_, i) => {
              const angleDeg = -180 + (i / 34) * 180;
              const angleRad = (angleDeg * Math.PI) / 180;
              const isMajor = i % 7 === 0 || i === 0 || i === 34;
              const rOuter = isMajor ? 115 : 108;
              const x1 = 150 + 95 * Math.cos(angleRad);
              const y1 = 135 + 95 * Math.sin(angleRad);
              const x2 = 150 + rOuter * Math.cos(angleRad);
              const y2 = 135 + rOuter * Math.sin(angleRad);
              const ratio = i / 34;
              let color = '#f59e0b';
              if (ratio < 0.22) color = '#ef5350';
              else if (ratio < 0.42) color = '#e57373';
              else if (ratio < 0.58) color = '#f59e0b';
              else if (ratio < 0.78) color = '#4db6ac';
              else color = '#26a69a';

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={isMajor ? 3 : 1.8}
                  strokeLinecap="round"
                  opacity={isMajor ? 1 : 0.75}
                />
              );
            })}
          </svg>

          {/* Needle */}
          <div
            className="absolute bottom-2 left-1/2 -ml-[3px] w-1.5 h-32 origin-bottom flex flex-col justify-start items-center z-30 pointer-events-none"
            style={{ transform: `rotate(${-90 + ((score + 100) / 200) * 180}deg)` }}
          >
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-[6px] border-b-[28px] border-b-amber-400 filter drop-shadow-[0_0_12px_rgba(251,191,36,1)]" />
            <div className="w-[2.5px] h-[90px] bg-gradient-to-t from-amber-500/20 via-amber-400/90 to-amber-300" />
          </div>

          {/* Center dot */}
          <div className="absolute -bottom-2 w-10 h-10 rounded-full bg-[#07080a] border-2 border-amber-400 z-40 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.6)]">
            <div className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Direction label */}
        <div className={cn(
          "mt-6 px-8 py-3.5 rounded-2xl border backdrop-blur-xl transition-all text-center w-full",
          color === '#26a69a' && "bg-[#26a69a]/15",
          color === '#4db6ac' && "bg-[#26a69a]/10",
          color === '#f59e0b' && "bg-amber-500/10",
          color === '#e57373' && "bg-[#ef5350]/10",
          color === '#ef5350' && "bg-[#ef5350]/15"
        )}>
          <span
            className="text-2xl font-black tracking-widest block drop-shadow-md uppercase"
            style={{ color }}
          >
            {formattedDirection}
          </span>
          <div className="flex items-center justify-center gap-2 mt-2 text-[9px] font-bold text-white/50 uppercase tracking-wider">
            <span>Confidence: {confidence}%</span>
            {isStale && (
              <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                STALE
              </span>
            )}
          </div>
        </div>

        {/* Score breakdown */}
        <div className="mt-3 bg-black/40 border border-white/[0.06] rounded-xl px-3 py-2 font-mono text-[9px] z-10">
          <div className="flex items-center justify-between text-white/40 uppercase tracking-wider mb-1">
            <span className="text-amber-400 font-black">SCORE BREAKDOWN</span>
            <span className={cn("font-black", score > 50 ? "text-[#26a69a]" : "text-white/30")}>
              {score > 0 ? '+' : ''}{score}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-white/70">
            <div className="flex justify-between">
              <span className="text-white/30">BUY PRESSURE</span>
              <span className="text-[#26a69a] font-black">{Math.max(0, score - 50) * 2}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30">SELL PRESSURE</span>
              <span className="text-[#ef5350] font-black">{Math.max(0, 50 - score) * 2}%</span>
            </div>
          </div>
        </div>

        {/* Status panel */}
        <div className="mt-4 p-4 bg-white/[0.02] rounded-lg border border-white/[0.04]">
          <div className="grid grid-cols-2 gap-4 text-sm font-mono">
            <div>
              <span className="text-white/50">TIME:</span>
              <span className="text-white">{time}</span>
            </div>
            <div>
              <span className="text-white/50">DATA:</span>
              <span className={dataLabelColor}>{dataLabelText}</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4 text-lg font-bold">
            <div className="flex flex-col">
              <div className="text-white/50">NEXT UPDATE:</div>
              <span className="text-white">{secondsUntilNextUpdate}s</span>
            </div>
            <div className="flex flex-col">
              <div className="text-white/50">SIGNAL AGE:</div>
              <span className="text-white">{minutesSinceLastSignal} min</span>
            </div>
          </div>
          <div className="mt-2 text-white/50 text-center">STATE: {isStale ? 'STALE' : 'ACTIVE'}</div>
        </div>

        {/* Explanation */}
        <div className="mt-4 p-4 bg-white/[0.02] rounded-lg border border-white/[0.04]">
          <div className="text-white/50 font-bold mb-2">WHY THIS DIRECTION</div>
          <div className="space-y-1 text-sm font-mono">
            {factorSummary.map((factor, index) => (
              <div key={index} className="flex items-start">
                <span className="w-4 text-white/50">•</span>
                <span className="text-white">{factor}</span>
              </div>
            ))}
          </div>
          {reason && (
            <div className="mt-2 pt-2 border-t border-white/[0.04] text-xs text-white/40 italic">
              {reason}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};