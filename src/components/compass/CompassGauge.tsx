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
  gauge: GaugeReading;
  /** Optional heading above the gauge. */
  title?: string;
}

const WIDTH = 560;
const ARC = 360;
const STROKE = 26;
const NEEDLE = 260;

export const CompassGauge: React.FC<CompassGaugeProps> = ({ gauge, title }) => {
  const score = Math.max(-100, Math.min(100, gauge.score));
  const angle = (score / 100) * 90; // -90..+90 degrees
  const color = scoreColor(score);
  const height = WIDTH / 2 + 40;
  const cx = WIDTH / 2;
  const cy = WIDTH / 2;
  const r = ARC / 2;

  const describeArc = (radius: number) => `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <div className="flex flex-col items-center">
      {title && (
        <span className="text-label font-semibold uppercase tracking-[0.3em] text-white/40">{title}</span>
      )}

      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full max-w-[640px]"
        role="img"
        aria-label={`${title ? `${title}: ` : ''}${labelShort(gauge.label)} (score ${Math.round(score)})`}
      >
        <defs>
          <linearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef5350" />
            <stop offset="25%" stopColor="#e57373" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="75%" stopColor="#4db6ac" />
            <stop offset="100%" stopColor="#26a69a" />
          </linearGradient>
        </defs>

        <path d={describeArc(r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} strokeLinecap="round" />
        <path
          d={describeArc(r)}
          fill="none"
          stroke="url(#gaugeArc)"
          strokeWidth={STROKE}
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
          <polygon points={`${cx},${cy - NEEDLE} ${cx + 9},${cy} ${cx - 9},${cy}`} fill={color} />
        </g>
        <circle cx={cx} cy={cy} r="12" fill="#07080a" stroke={color} strokeWidth="4" />
      </svg>

      <span className={cn('-mt-2 text-6xl font-black leading-none', labelTextColor(gauge.label))}>
        {labelShort(gauge.label)}
      </span>
      <span className="mt-2 font-mono text-4xl font-bold text-white/85">{Math.round(score)}</span>
    </div>
  );
};
