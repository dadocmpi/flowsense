// ============================================
// CVD SPARKLINE
// ============================================
// A small cumulative-volume-delta line, drawn from the estimated flow's own
// window series. It shows the SHAPE of the delta over the window; the numbers
// beside it are the panel's job.
//
// It draws nothing (an empty baseline) when there is no series, rather than a
// flat line that could read as "delta flat".

import React, { useId } from 'react';

interface CvdSparklineProps {
  /** Cumulative delta over the window, oldest first. */
  values: number[];
  /** Line colour; defaults to the buy tone. */
  color?: string;
  height?: number;
}

export const CvdSparkline: React.FC<CvdSparklineProps> = ({ values, color = '#4db6ac', height = 34 }) => {
  const gradientId = `cvd-${useId().replace(/:/g, '')}`;

  if (values.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-micro text-white/25" style={{ height }}>
        no CVD series
      </div>
    );
  }

  const width = 120;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const toY = (value: number) => height - ((value - min) / span) * height;

  const points = values.map((value, i) => `${(i * stepX).toFixed(2)},${toY(value).toFixed(2)}`).join(' ');
  const zeroY = toY(0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label="Cumulative delta over the window"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* The zero line: above is net buying, below net selling. */}
      <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth="0.75" strokeDasharray="2 2" />
      <polyline points={`0,${height} ${points} ${width},${height}`} fill={`url(#${gradientId})`} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};
