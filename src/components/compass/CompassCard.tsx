// ============================================
// COMPASS CARD
// ============================================
// One card holding a compass: the gauge centered and larger at the top, and that
// compass's own key numbers in a compact two-column grid below it that fills the
// card width. The three top cards share this rhythm, so they read as one row.
//
// A card with no reading draws no needle and says why. It never renders a
// placeholder number or a gauge at neutral, because a neutral needle looks like a
// real "neutral market" read and would be a lie.

import React from 'react';
import type { GaugeReading } from '../../core/types';
import { CompassGauge } from './CompassGauge';
import { cn } from '@/lib/utils';

export interface CompassFigure {
  label: string;
  value: string;
  /** Optional tone class for the value. */
  tone?: string;
}

interface CompassCardProps {
  title: string;
  subtitle?: string;
  gauge: GaugeReading | null;
  figures: CompassFigure[];
  /** Shown instead of the gauge when there is no reading. */
  unavailableText: string;
  /** Extra detail under the unavailable text. */
  unavailableHint?: string;
}

export const CompassCard: React.FC<CompassCardProps> = ({
  title,
  subtitle,
  gauge,
  figures,
  unavailableText,
  unavailableHint,
}) => {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-title font-bold text-white">{title}</h3>
        {subtitle && <span className="text-micro uppercase tracking-wider text-white/40">{subtitle}</span>}
      </div>

      {/* The gauge: centered and larger, at the top of the card. */}
      <div className="mt-2 flex flex-1 flex-col items-center justify-center">
        {gauge ? (
          <CompassGauge title="" gauge={gauge} size="lg" />
        ) : (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-1 text-center">
            <span className="text-label font-semibold text-white/45">{unavailableText}</span>
            {unavailableHint && <span className="text-micro text-white/30">{unavailableHint}</span>}
          </div>
        )}
      </div>

      {/* The stats: a compact two-column grid that fills the card width. */}
      <dl className="mt-3 grid w-full grid-cols-2 gap-x-5 gap-y-1.5 border-t border-white/[0.06] pt-3">
        {figures.map(figure => (
          <div key={figure.label} className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-micro uppercase tracking-wider text-white/35">{figure.label}</dt>
            <dd className={cn('font-mono text-label font-semibold text-white/90', figure.tone)}>{figure.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
