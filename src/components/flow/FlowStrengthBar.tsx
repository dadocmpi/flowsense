// ============================================
// BUYERS VS SELLERS STRENGTH BAR
// ============================================
// The one-glance read of who is in control right now. Green grows from the left
// with the buyer share, red from the right with the seller share, and a hairline
// marker sits at the 50% neutral line. The divider position is the only thing
// that moves; the bar transitions over ~300ms so a new reading slides into place
// instead of jumping, and the caller throttles updates to ~2/second so it cannot
// flicker.
//
// The state word and the intensity tier come from the same thresholds the
// gauge uses (src/config/compass.ts -> flow), so the bar and the needle can
// never disagree.

import React from 'react';
import { cn } from '@/lib/utils';
import type { FlowStateResult } from '@/core/orderflow';

export interface FlowStrengthBarProps {
  /** Buyer share, 0..1. 0.5 is balanced. */
  buyShare: number;
  state: FlowStateResult;
  className?: string;
  /** Compact height for a dense panel. */
  compact?: boolean;
}

const STATE_TONE: Record<FlowStateResult['state'], { text: string; glyph: string }> = {
  BUYERS: { text: 'text-buy', glyph: '▲' },
  SELLERS: { text: 'text-sell', glyph: '▼' },
  BALANCED: { text: 'text-ink-secondary', glyph: '●' },
};

const INTENSITY_LABEL: Record<FlowStateResult['intensity'], string> = {
  BALANCED: '',
  WEAK: 'weak',
  MODERATE: 'moderate',
  STRONG: 'strong',
};

export const FlowStrengthBar: React.FC<FlowStrengthBarProps> = ({ buyShare, state, className, compact = false }) => {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(buyShare) ? buyShare : 0.5));
  const buyPct = Math.round(clamped * 100);
  const sellPct = 100 - buyPct;
  const tone = STATE_TONE[state.state];

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-micro uppercase tracking-[0.1em] text-ink-muted">Buyers</span>
          <span data-numeric className="font-mono text-data font-semibold text-buy">
            {buyPct}%
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span data-numeric className="font-mono text-data font-semibold text-sell">
            {sellPct}%
          </span>
          <span className="text-micro uppercase tracking-[0.1em] text-ink-muted">Sellers</span>
        </div>
      </div>

      <div
        role="img"
        aria-label={`Buyers ${buyPct} percent, sellers ${sellPct} percent, ${state.label.toLowerCase()}${
          INTENSITY_LABEL[state.intensity] ? `, ${INTENSITY_LABEL[state.intensity]}` : ''
        }`}
        className={cn(
          'relative w-full overflow-hidden rounded-full border border-hairline bg-inset',
          compact ? 'h-3' : 'h-5'
        )}
      >
        {/* Seller share: the right side, from the divider to the end. */}
        <div className="absolute inset-y-0 right-0 bg-sell/70 transition-[width] duration-300 ease-out" style={{ width: `${sellPct}%` }} />
        {/* Buyer share: the left side, from the start to the divider. */}
        <div className="absolute inset-y-0 left-0 bg-buy/80 transition-[width] duration-300 ease-out" style={{ width: `${buyPct}%` }} />
        {/* The 50% neutral marker. */}
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-faint/70" aria-hidden />
        {/* A bright divider on the current split, so the exact ratio reads. */}
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink/80 transition-[left] duration-300 ease-out"
          style={{ left: `${buyPct}%` }}
          aria-hidden
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className={cn('inline-flex items-center gap-1.5 text-label font-medium', tone.text)}>
          <span aria-hidden>{tone.glyph}</span>
          {state.label}
        </span>
        {INTENSITY_LABEL[state.intensity] && (
          <span className="text-micro uppercase tracking-[0.1em] text-ink-muted">
            {INTENSITY_LABEL[state.intensity]} pressure
          </span>
        )}
      </div>
    </div>
  );
};
