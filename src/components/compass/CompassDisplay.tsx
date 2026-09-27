import React from 'react';
import { CompassDirection, directionColor } from '../../lib/compassEngine';
import { buildTradePlan } from '../../lib/tradePlan';
import { dataLabelText, plainReason } from '../../lib/labels';
import { cn } from '@/lib/utils';

interface CompassDisplayProps {
  direction: CompassDirection;
  score: number;
  confidence: number;
  price: number;
  precision: number;
  timestamp: number;
  dataLabel: 'LIVE' | 'DELAYED' | 'CACHED' | 'SIMULATED' | 'UNAVAILABLE';
  secondsUntilNextUpdate: number;
  minutesSinceLastSignal: number;
  reason: string;
  isStale: boolean;
}

const DIRECTION_WORD: Record<CompassDirection, string> = {
  STRONG_BUY: 'Strong buy',
  BUY: 'Buy',
  NEUTRAL: 'Neutral',
  SELL: 'Sell',
  STRONG_SELL: 'Strong sell',
};

const GLOW_CLASS: Record<string, string> = {
  '#26a69a': 'from-[#26a69a]/30',
  '#4db6ac': 'from-[#4db6ac]/20',
  '#f59e0b': 'from-amber-500/15',
  '#e57373': 'from-[#e57373]/20',
  '#ef5350': 'from-[#ef5350]/30',
};

const PANEL_CLASS: Record<string, string> = {
  '#26a69a': 'bg-[#26a69a]/15',
  '#4db6ac': 'bg-[#26a69a]/10',
  '#f59e0b': 'bg-amber-500/10',
  '#e57373': 'bg-[#ef5350]/10',
  '#ef5350': 'bg-[#ef5350]/15',
};

function strengthLabel(confidence: number): string {
  if (confidence >= 75) return 'Strong';
  if (confidence >= 55) return 'Moderate';
  if (confidence >= 35) return 'Weak';
  return 'Very weak';
}

function formatPrice(value: number, precision: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

/**
 * The hero element of the dashboard: the signal compass. It carries the
 * direction, a strength read, one plain-English reason and the entry / stop /
 * target plan as compact inline stats.
 */
export const CompassDisplay: React.FC<CompassDisplayProps> = ({
  direction,
  score,
  confidence,
  price,
  precision,
  timestamp,
  dataLabel,
  secondsUntilNextUpdate,
  minutesSinceLastSignal,
  reason,
  isStale,
}) => {
  const color = directionColor(direction);
  const plan = buildTradePlan(direction, price);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Needle position: score is 0-100 mapped onto the -90..+90 degree sweep.
  const needleAngle = -90 + (score / 100) * 180;

  const stats = [
    { label: 'Entry', value: plan ? formatPrice(plan.entryHigh, precision) : '--', tone: 'text-white' },
    { label: 'Stop', value: plan ? formatPrice(plan.stopLoss, precision) : '--', tone: 'text-red-400' },
    { label: 'Target', value: plan ? formatPrice(plan.target, precision) : '--', tone: 'text-green-400' },
    {
      label: 'Reward / risk',
      value: plan && plan.ratio > 0 ? `1 : ${plan.ratio.toFixed(2)}` : '--',
      tone: plan && plan.ratio >= 1.5 ? 'text-green-400' : plan && plan.ratio >= 1 ? 'text-amber-400' : 'text-red-400',
    },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b0c10] px-6 py-10 shadow-[0_25px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:px-10">
      <div
        className={cn(
          'pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl transition-all duration-700',
          GLOW_CLASS[color] ?? 'from-amber-500/15'
        )}
      />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/40">Signal Compass</p>

        {/* Gauge */}
        <div className="relative my-4 w-full max-w-[420px]">
          <div className="relative mx-auto h-44 w-80 sm:w-96">
            <svg className="h-full w-full overflow-visible" viewBox="0 0 300 150">
              <path
                d="M 55 135 A 95 95 0 0 1 245 135"
                fill="none"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              {Array.from({ length: 35 }, (_, i) => {
                const angleRad = ((-180 + (i / 34) * 180) * Math.PI) / 180;
                const isMajor = i % 7 === 0 || i === 0 || i === 34;
                const rOuter = isMajor ? 115 : 108;
                const x1 = 150 + 95 * Math.cos(angleRad);
                const y1 = 135 + 95 * Math.sin(angleRad);
                const x2 = 150 + rOuter * Math.cos(angleRad);
                const y2 = 135 + rOuter * Math.sin(angleRad);
                const ratio = i / 34;
                let tickColor = '#f59e0b';
                if (ratio < 0.22) tickColor = '#ef5350';
                else if (ratio < 0.42) tickColor = '#e57373';
                else if (ratio < 0.58) tickColor = '#f59e0b';
                else if (ratio < 0.78) tickColor = '#4db6ac';
                else tickColor = '#26a69a';

                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={tickColor}
                    strokeWidth={isMajor ? 3 : 1.8}
                    strokeLinecap="round"
                    opacity={isMajor ? 1 : 0.75}
                  />
                );
              })}
            </svg>

            <div
              className="pointer-events-none absolute bottom-2 left-1/2 z-30 -ml-[3px] flex h-32 w-1.5 origin-bottom flex-col items-center justify-start"
              style={{ transform: `rotate(${needleAngle}deg)` }}
            >
              <div className="h-0 w-0 border-b-[28px] border-l-[6px] border-r-[6px] border-b-amber-400 border-l-transparent border-r-transparent drop-shadow-[0_0_12px_rgba(251,191,36,1)]" />
              <div className="h-[90px] w-[2.5px] bg-gradient-to-t from-amber-500/20 via-amber-400/90 to-amber-300" />
            </div>

            <div className="absolute -bottom-2 left-1/2 z-40 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-2 border-amber-400 bg-[#07080a] shadow-[0_0_20px_rgba(245,158,11,0.6)]">
              <div className="h-3.5 w-3.5 animate-pulse rounded-full bg-amber-400" />
            </div>
          </div>

          <div className="mt-2 flex justify-between px-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
            <span>Strong sell</span>
            <span>Neutral</span>
            <span>Strong buy</span>
          </div>
        </div>

        {/* Direction */}
        <div className={cn('w-full rounded-2xl border border-white/[0.06] px-6 py-4 text-center backdrop-blur-xl', PANEL_CLASS[color] ?? 'bg-amber-500/10')}>
          <span className="block text-3xl font-black uppercase tracking-widest drop-shadow-md sm:text-4xl" style={{ color }}>
            {DIRECTION_WORD[direction]}
          </span>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/50">
            <span>{strengthLabel(confidence)} conviction</span>
            <span className="text-white/20">|</span>
            <span>{confidence}% confidence</span>
            <span className="text-white/20">|</span>
            <span>Score {score}</span>
            {isStale && (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-400">
                Stale
              </span>
            )}
          </div>
        </div>

        {/* One plain-English reason line */}
        <p className="mt-4 max-w-2xl text-center text-sm leading-relaxed text-white/70">
          {reason ? plainReason(reason) : 'Waiting for enough live factors to publish a signal.'}
        </p>

        {/* Compact inline plan */}
        <div className="mt-8 grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] sm:grid-cols-4">
          {stats.map(stat => (
            <div key={stat.label} className="bg-[#0b0c10] px-4 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{stat.label}</div>
              <div className={cn('mt-1 font-mono text-sm font-bold sm:text-base', stat.tone)}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-white/40">
          <span>As of {time}</span>
          <span>Feed {dataLabelText(dataLabel)}</span>
          <span>Next update in {secondsUntilNextUpdate}s</span>
          <span>Signal age {minutesSinceLastSignal} min</span>
        </div>
      </div>
    </section>
  );
};
