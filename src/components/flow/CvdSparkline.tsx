// ============================================
// CVD SPARKLINE
// ============================================
// A thin line of the session's cumulative volume delta, drawn from the real
// bucketed series the venue returned. The zero baseline is drawn as a hairline
// so a positive (net buying) session reads at a glance. With too few points it
// draws nothing rather than a flat invented line.

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { palette } from '@/theme/tokens';

export interface CvdSparklineProps {
  series: Array<{ timestamp: number; cvd: number }>;
  className?: string;
  height?: number;
  /** Accessible description, e.g. the session CVD value. */
  ariaLabel?: string;
}

const WIDTH = 240;

export const CvdSparkline: React.FC<CvdSparklineProps> = ({ series, className, height = 28, ariaLabel }) => {
  const path = useMemo(() => {
    if (series.length < 2) return null;
    const values = series.map(point => point.cvd);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = max - min || 1;
    const stepX = WIDTH / (series.length - 1);
    const points = series.map((point, index) => {
      const x = index * stepX;
      const y = height - ((point.cvd - min) / span) * height;
      return [x, y] as const;
    });
    const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const zeroY = height - ((0 - min) / span) * height;
    const positive = values[values.length - 1] >= 0;
    return { line, zeroY, positive };
  }, [series, height]);

  if (!path) {
    return (
      <div className={cn('flex items-center text-micro text-ink-faint', className)} style={{ height }}>
        No session tape yet
      </div>
    );
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? 'Cumulative volume delta for the session'}
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
    >
      <line x1={0} x2={WIDTH} y1={path.zeroY} y2={path.zeroY} stroke={palette.borderHairline} strokeWidth={1} />
      <path
        d={path.line}
        fill="none"
        stroke={path.positive ? palette.buy : palette.sell}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
