import React from 'react';
import {
  CompassDirection,
  scoreToDirection,
  needleAngleFromScore,
  sentimentColorFromScore,
  confidenceFromScore,
  clampScore,
} from '../../lib/compassEngine';
import { streamStatusLabel } from '../../lib/labels';
import { OrderFlowState } from '../../types/trading';
import { cn } from '@/lib/utils';

interface CompassDisplayProps {
  /** The single aggregated signal value, 0 (strong sell) to 100 (strong buy). */
  score: number;
  /** Data quality 0-100, used only to scale the confidence ceiling. */
  dataQuality: number;
  timestamp: number;
  /** Health of the stream feeding the compass, so a dropped feed is obvious. */
  streamStatus: OrderFlowState['streamStatus'];
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

/**
 * The hero element of the dashboard. Everything visible here — the needle
 * angle, the colour it points into, the direction label and the confidence
 * badge — is derived from the same `score`. There is no second path that could
 * disagree, so the gauge reads as one continuous scale: far left = strong sell
 * (red), centre = neutral (amber), far right = strong buy (green).
 */
export const CompassDisplay: React.FC<CompassDisplayProps> = ({
  score,
  dataQuality,
  timestamp,
  streamStatus,
  isStale,
}) => {
  const value = clampScore(score);
  const direction = scoreToDirection(value);
  const needleAngle = needleAngleFromScore(value);
  const color = sentimentColorFromScore(value);
  const confidence = confidenceFromScore(value, dataQuality);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isLive = streamStatus === 'LIVE';

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b0c10] px-6 py-10 shadow-[0_25px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:px-10 sm:py-14">
      <div
        className={cn(
          'pointer-events-none absolute -top-40 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl transition-all duration-700',
          GLOW_CLASS[color] ?? 'from-amber-500/15'
        )}
      />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/40">Signal Compass</p>

        {/* Gauge */}
        <div className="relative my-6 w-full max-w-[560px]">
          <div className="relative mx-auto aspect-[2/1] w-full">
            <svg className="h-full w-full overflow-visible" viewBox="0 0 300 150">
              <defs>
                <linearGradient id="compassArc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ef5350" />
                  <stop offset="25%" stopColor="#e57373" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="75%" stopColor="#4db6ac" />
                  <stop offset="100%" stopColor="#26a69a" />
                </linearGradient>
              </defs>

              {/* Full-scale track */}
              <path
                d="M 55 135 A 95 95 0 0 1 245 135"
                fill="none"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="12"
                strokeLinecap="round"
              />

              {/* Continuous colour scale the needle sweeps across */}
              <path
                d="M 55 135 A 95 95 0 0 1 245 135"
                fill="none"
                stroke="url(#compassArc)"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.85"
              />

              {/* Tick marks, coloured by the same scale */}
              {Array.from({ length: 35 }, (_, i) => {
                const angleRad = ((-180 + (i / 34) * 180) * Math.PI) / 180;
                const isMajor = i % 7 === 0 || i === 0 || i === 34;
                const rOuter = isMajor ? 122 : 117;
                const x1 = 150 + 95 * Math.cos(angleRad);
                const y1 = 135 + 95 * Math.sin(angleRad);
                const x2 = 150 + rOuter * Math.cos(angleRad);
                const y2 = 135 + rOuter * Math.sin(angleRad);
                const tickColor = sentimentColorFromScore((i / 34) * 100);

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

              {/* Needle — rotation, colour and label all come from `value` */}
              <g
                style={{
                  transform: `rotate(${needleAngle}deg)`,
                  transformOrigin: '150px 135px',
                  transformBox: 'view-box',
                  transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                <polygon points="150,44 158,135 142,135" fill={color} />
                <circle cx="150" cy="135" r="9" fill={color} />
              </g>
              <circle cx="150" cy="135" r="15" fill="#07080a" stroke={color} strokeWidth="2.5" />
            </svg>
          </div>

          <div className="mt-2 flex justify-between px-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">
            <span>Strong sell</span>
            <span>Neutral</span>
            <span>Strong buy</span>
          </div>
        </div>

        {/* Direction and confidence — both derived from the same score */}
        <div
          className="mt-2 flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] px-10 py-5 text-center backdrop-blur-xl transition-colors duration-700"
          style={{ backgroundColor: `${color}1a` }}
        >
          <span
            className="block text-4xl font-black uppercase tracking-widest drop-shadow-md transition-colors duration-700 sm:text-5xl"
            style={{ color }}
          >
            {DIRECTION_WORD[direction]}
          </span>
          <span className="font-mono text-2xl font-bold text-white/90 sm:text-3xl">{confidence}% confidence</span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-white/40">
          <span>As of {time}</span>
          <span className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', isLive ? 'bg-green-400 animate-pulse' : 'bg-amber-400')} />
            <span className={cn('font-semibold', isLive ? 'text-green-400' : 'text-amber-400')}>
              {isLive ? 'Streaming live' : `Stream ${streamStatusLabel(streamStatus).toLowerCase()}`}
            </span>
          </span>
          <span className={cn('font-semibold', isStale ? 'text-amber-400' : 'text-green-400')}>
            State: {isStale ? 'Stale' : 'Active'}
          </span>
        </div>
      </div>
    </section>
  );
};
