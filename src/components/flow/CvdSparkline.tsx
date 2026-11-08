// ============================================
// CVD SPARKLINE
// ============================================
// The cumulative-delta curve over the closed window: above the zero line is net
// buying, below is net selling. Flat and restrained — one hairline, a zero rule,
// no fill, no glow.

import React from 'react';
import { PALETTE } from '../common/palette';

interface CvdSparklineProps {
  values: number[];
  height?: number;
}

export const CvdSparkline: React.FC<CvdSparklineProps> = ({ values, height = 44 }) => {
  if (values.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-sm border border-line bg-base-2 text-micro text-ink-subtle"
        style={{ height }}
      >
        no CVD series
      </div>
    );
  }

  const width = 240;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const toY = (value: number) => height - ((value - min) / span) * height;

  const points = values.map((value, i) => `${(i * stepX).toFixed(2)},${toY(value).toFixed(2)}`).join(' ');
  const zeroY = toY(0);
  const color = values[values.length - 1] >= 0 ? PALETTE.pos : PALETTE.neg;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Cumulative delta">
      <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke={PALETTE.line} strokeWidth="1" strokeDasharray="2 3" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};
