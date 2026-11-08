// ============================================
// COMPASS GAUGE
// ============================================
// A half-circle needle gauge on the signed -100..+100 scale, refined for the
// institutional theme: a thinner arc, a muted gradient (no neon), a clear
// needle and a LARGE verdict word beneath it with the Buy / Neutral / Sell
// counts under that. Gauge on top, numbers below, no empty gaps.
//
// The needle angle, the colour it points into and the verdict all come from the
// same score through the same functions in core/scoring and ./format, so the
// word can never disagree with the needle. The compass LOGIC is unchanged.

import React, { useId } from 'react';
import type { GaugeReading } from '../../core/types';
import { labelShort, labelTextColor, scoreColor } from './format';
import { gaugeArcStops } from '../../theme/tokens';
import { cn } from '@/lib/utils';

interface CompassGaugeProps {
  /** Heading above the gauge. Omitted when the surrounding card already titles it. */
  title?: string;
  gauge: GaugeReading;
  /** Rendered smaller for the compact matrix. */
  size?: 'sm' | 'md' | 'lg';
  /** Show the Buy / Neutral / Sell vote counts under the gauge. */
  showTally?: boolean;
}

const SIZES = {
  sm: { width: 128, arc: 92, stroke: 6, needle: 64, render: 132, verdict: 'text-title', tally: 'text-micro' },
  md: { width: 176, arc: 124, stroke: 7, needle: 88, render: 176, verdict: 'text-headline', tally: 'text-label' },
  lg: { width: 224, arc: 160, stroke: 8, needle: 114, render: 224, verdict: 'text-headline', tally: 'text-label' },
};

export const CompassGauge: React.FC<CompassGaugeProps> = ({ title, gauge, size = 'md', showTally = true }) => {
  const heading = title ?? '';
  // Unique per instance: the three compasses share one page, and a duplicated
  // gradient id would make them all reference whichever painted last.
  const gradientId = `gaugeArc-${useId().replace(/:/g, '')}`;
  const dims = SIZES[size];
  const score = Math.max(-100, Math.min(100, gauge.score));
  const angle = (score / 100) * 90; // -90..+90 degrees
  const color = scoreColor(score);
  const width = dims.width;
  const height = width / 2 + 14;
  const cx = width / 2;
  const cy = width / 2;
  const r = dims.arc / 2;

  // Arc from 180deg to 0deg (left to right).
  const describeArc = (radius: number) => `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <div className="flex flex-col items-center">
      {heading && (
        <span className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-muted">{heading}</span>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: dims.render }}
        className="w-full"
        role="img"
        aria-label={`${heading || 'Compass'}: ${labelShort(gauge.label)} (score ${Math.round(score)})`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            {gaugeArcStops.map(stop => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>

        {/* The track, then the muted gradient arc over it. */}
        <path
          d={describeArc(r)}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth={dims.stroke}
          strokeLinecap="round"
        />
        <path
          d={describeArc(r)}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={dims.stroke}
          strokeLinecap="round"
          opacity="0.75"
        />

        {/* Needle: a thin line with a small counterweight, so it reads as an
            instrument, not a blob. */}
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transformBox: 'view-box',
            transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - dims.needle} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={cx} y2={cy + 8} stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </g>
        <circle cx={cx} cy={cy} r="4" fill="var(--bg-surface)" stroke={color} strokeWidth="1.5" />
      </svg>

      <span className={cn('mt-1.5 font-semibold leading-none', dims.verdict, labelTextColor(gauge.label))}>
        {labelShort(gauge.label)}
      </span>

      {showTally && (
        <div className={cn('mt-2 flex items-center gap-2 font-mono', dims.tally)}>
          <span className="text-buy">B {gauge.tally.buy}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-secondary">N {gauge.tally.neutral}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-sell">S {gauge.tally.sell}</span>
        </div>
      )}
    </div>
  );
};
