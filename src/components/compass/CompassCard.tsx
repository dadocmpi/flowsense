// ============================================
// COMPASS CARD
// ============================================
// One card holding a compass: the gauge centered at the top and that compass's
// own key numbers in a compact two-column grid below it that fills the card
// width. The three top cards share this rhythm, so they read as one row and end
// at the same pixel.
//
// A card with no reading draws no needle and says why. It never renders a
// placeholder number or a gauge at neutral, because a neutral needle looks like a
// real "neutral market" read and would be a lie.

import React from 'react';
import type { GaugeReading } from '../../core/types';
import { CompassGauge } from './CompassGauge';
import { Panel } from '../common/Panel';
import { cn } from '@/lib/utils';

export interface CompassFigure {
  label: string;
  value: string;
  /** Optional tone class for the value. */
  tone?: string;
}

interface CompassCardProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Right-aligned header content, e.g. a status pill. */
  headerActions?: React.ReactNode;
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
  headerActions,
  gauge,
  figures,
  unavailableText,
  unavailableHint,
}) => {
  return (
    <Panel title={title} subtitle={subtitle} actions={headerActions}>
      <div className="flex h-full flex-col">
        {/* The gauge: centered, at the top of the card. */}
        <div className="flex flex-1 flex-col items-center justify-center">
          {gauge ? (
            <CompassGauge title="" gauge={gauge} size="lg" />
          ) : (
            <div className="flex min-h-[150px] flex-col items-center justify-center gap-1 text-center">
              <span className="text-label font-semibold text-ink-secondary">{unavailableText}</span>
              {unavailableHint && <span className="max-w-[34ch] text-micro text-ink-muted">{unavailableHint}</span>}
            </div>
          )}
        </div>

        {/* The stats: a compact two-column grid that fills the card width. */}
        <dl className="grid w-full grid-cols-2 gap-x-5 gap-y-1.5 border-t border-hairline pt-3">
          {figures.map(figure => (
            <div key={figure.label} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-micro uppercase tracking-[0.08em] text-ink-muted">{figure.label}</dt>
              <dd className={cn('font-mono text-label font-medium text-ink', figure.tone)}>{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
};
