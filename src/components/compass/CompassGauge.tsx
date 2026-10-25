// ============================================
// COMPASS GAUGE
// ============================================
// A half-circle needle gauge on the signed -100..+100 scale.
//
// The needle angle, the colour it points into and the label all come from the
// same score through the same functions in core/scoring, so the label can
// never disagree with the needle.

import React from 'react';
import type { GaugeReading } from '../../core/types';
import { labelShort, labelTextColor, scoreColor } from './format';
import { cn } from '@/lib/utils';

interface CompassGaugeProps {
  title: string;
  gauge: GaugeReading;
  /** Rendered smaller for the compact matrix. */
  size?: 'sm' | 'md' | 'lg';
  /** Show the Buy / Neutral / Sell vote counts under the gauge. */
  showTally?: boolean;
}

const SIZES = {
  sm: { width: 128, arc: 84, stroke: 9, needle: 62, font: 'text-label', tally: 'text-micro' },
  md: { width: 176, arc: 112, stroke: 11, needle: 82, font: 'text-title', tally: 'text-label' },
  lg: { width: 224, arc: 142, stroke: 13, needle: 104, font: 'text-title', tally: 'text-label' },
};

export const CompassGauge: React.FC<CompassGaugeProps> = ({ title, gauge, size = 'md', showTally = true }) => {
  const dims = SIZES[size];
  const score = Math.max(-100, Math.min(100, gauge.score));
  const angle = (score / 100) * 90; // -90..+90 degrees
  const color = scoreColor(score);
  const width = dims.width;
  const height = width / 2 + 18;
  const cx = width / 2;
  const cy = width / 2;
  const r = dims.arc / 2;

  // Arc from 180deg to 0deg (left to right).
  const describeArc = (radius: number) => `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <div className="flex flex-col items-center">
      <span className="text-micro font-semibold uppercase tracking-wider text-white/40">{title}</span>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-[240px]"
        role="img"
        aria-label={`${title}: ${labelShort(gauge.label)} (score ${Math.round(score)})`}
      >
        <defs>
          <linearGradient id={`gaugeArc-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef5350" />
            <stop offset="25%" stopColor="#e57373" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="75%" stopColor="#4db6ac" />
            <stop offset="100%" stopColor="#26a69a" />
          </linearGradient>
        </defs>

        <path d={describeArc(r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={dims.stroke} strokeLinecap="round" />
        <path
          d={describeArc(r)}
          fill="none"
          stroke={`url(#gaugeArc-${title.replace(/\s+/g, '')})`}
          strokeWidth={dims.stroke}
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* Needle */}
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transformBox: 'view-box',
            transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <polygon
            points={`${cx},${cy - dims.needle} ${cx + 4},${cy} ${cx - 4},${cy}`}
            fill={color}
          />
        </g>
        <circle cx={cx} cy={cy} r="5" fill="#07080a" stroke={color} strokeWidth="2" />
      </svg>

      <span className={cn('mt-1 font-bold', dims.font, labelTextColor(gauge.label))}>{labelShort(gauge.label)}</span>

      {showTally && (
        <div className={cn('mt-1 flex items-center gap-2 font-mono', dims.tally)}>
          <span className="text-[#4db6ac]">B {gauge.tally.buy}</span>
          <span className="text-white/35">·</span>
          <span className="text-amber-400">N {gauge.tally.neutral}</span>
          <span className="text-white/35">·</span>
          <span className="text-[#e57373]">S {gauge.tally.sell}</span>
        </div>
      )}
    </div>
  );
};
