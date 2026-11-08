// ============================================
// COMPASS CARD
// ============================================
// One card holding a compass: the gauge and that compass's own key numbers. A
// card with no reading draws no marker and says why — never a placeholder or a
// gauge resting at neutral, which would read as a real "neutral market".

import React from 'react';
import type { GaugeReading } from '../../core/types';
import { CompassGauge } from './CompassGauge';
import { Panel } from '../common/Panel';
import { cn } from '@/lib/utils';

export interface CompassFigure {
  label: string;
  value: string;
  /** Optional inline colour for the value. */
  color?: string;
}

interface CompassCardProps {
  title: string;
  /** Right-aligned header content (timeframe, source). */
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  gauge: GaugeReading | null;
  figures: CompassFigure[];
  /** Shown instead of the gauge when there is no reading. */
  unavailableText: string;
  unavailableHint?: string;
  /** Rendered under the card body (e.g. the Compass inputs drawer link). */
  footer?: React.ReactNode;
}

export const CompassCard: React.FC<CompassCardProps> = ({
  title,
  meta,
  badge,
  gauge,
  figures,
  unavailableText,
  unavailableHint,
  footer,
}) => (
  <Panel title={title} meta={meta} badge={badge} className="h-full" bodyClassName="p-3">
    <div className="flex items-center gap-3">
      <div className="flex w-[150px] shrink-0 flex-col items-center justify-center">
        {gauge ? (
          <CompassGauge gauge={gauge} />
        ) : (
          <div className="flex min-h-[104px] flex-col items-center justify-center gap-1 px-2 text-center">
            <span className="text-label text-ink-muted">{unavailableText}</span>
            {unavailableHint && <span className="text-micro text-ink-subtle">{unavailableHint}</span>}
          </div>
        )}
      </div>

      <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5">
        {figures.map(figure => (
          <div key={figure.label} className="flex items-baseline justify-between gap-2 border-b border-line/50 pb-0.5">
            <dt className="truncate text-micro uppercase tracking-[0.06em] text-ink-subtle">{figure.label}</dt>
            <dd className={cn('font-mono text-label tabular text-ink')} style={figure.color ? { color: figure.color } : undefined}>
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
    {footer && <div className="mt-2 border-t border-line pt-2">{footer}</div>}
  </Panel>
);
