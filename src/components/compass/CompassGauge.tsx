// ============================================
// COMPASS GAUGE
// ============================================
// The one gauge on the screen: a large half-circle needle on the signed
// -100..+100 scale, with the label and the score beneath it.
//
// The needle angle, the colour it points into and the label all come from the
// same score through the same functions in core/scoring, so the label can never
// disagree with the needle.

import React from 'react';
import type { GaugeReading } from '../../core/types';
import { needleAngleFromScore } from '../../core/scoring';
import { labelShort, labelTextColor, scoreColor } from './format';
import { cn } from '@/lib/utils';

interface CompassGaugeProps {
  gauge: GaugeReading;
}

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 232;
const RADIUS = 168;

export const CompassGauge: React.FC<CompassGaugeProps> = ({ gauge }) => {
  const score = Math.max(-100, Math.min(100, gauge.score));
  const angle = needleAngleFromScore(score);
  const color = scoreColor(score);

  const cx = VIEW_WIDTH / 2;
  const cy = VIEW_WIDTH / 2;
  const stroke = 22;
  const needle = RADIUS - 14;

  const describeArc = (radius: number) => `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <div className="flex w-full flex-col items-center">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="mx-auto w-full max-w-[min(56vw,72vh)]"
        role="img"
        aria-label={`Summary: ${labelShort(gauge.label)} (score ${Math.round(score)})`}
      >
        <defs>
          <linearGradient id="summaryGaugeArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef5350" />
            <stop offset="25%" stopColor="#e57373" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="75%" stopColor="#4db6ac" />
            <stop offset="100%" stopColor="#26a69a" />
          </linearGradient>
        </defs>

        <path d={describeArc(RADIUS)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={describeArc(RADIUS)}
          fill="none"
          stroke="url(#summaryGaugeArc)"
          strokeWidth={stroke}
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
          <polygon points={`${cx},${cy - needle} ${cx + 7},${cy} ${cx - 7},${cy}`} fill={color} />
        </g>
        <circle cx={cx} cy={cy} r="9" fill="#07080a" stroke={color} strokeWidth="3" />
      </svg>

      <div className="mt-[clamp(0.25rem,1vh,1rem)] flex flex-wrap items-baseline justify-center gap-x-[clamp(0.75rem,2vw,2.5rem)] gap-y-1">
        <span
          className={cn('font-black leading-none tracking-tight', labelTextColor(gauge.label))}
          style={{ fontSize: 'clamp(2.25rem,5.5vw,5rem)' }}
        >
          {labelShort(gauge.label)}
        </span>
        <span
          className="font-mono font-bold leading-none text-white"
          style={{ fontSize: 'clamp(2rem,4.5vw,4.25rem)' }}
        >
          {score > 0 ? '+' : ''}
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
};
