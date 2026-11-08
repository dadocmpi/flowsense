// ============================================
// FLOW PRESSURE BAR
// ============================================
// A flat, two-tone proportion bar: the aggressive buy share against the sell
// share over the closed window. No gradient, no glow — a single hairline marker
// at the equilibrium point and a numeric readout on each side.

import React from 'react';
import { PALETTE } from '../common/palette';

interface FlowPressureBarProps {
  /** Buy share, 0..100. */
  buyPercent: number | null;
  /** Sell share, 0..100. */
  sellPercent: number | null;
  /** Caption on the right, e.g. "closed 20 candles". */
  caption?: string;
}

export const FlowPressureBar: React.FC<FlowPressureBarProps> = ({ buyPercent, sellPercent, caption }) => {
  const hasData = buyPercent !== null && sellPercent !== null;
  const buy = hasData ? Math.max(0, Math.min(100, buyPercent!)) : 50;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between font-mono text-micro uppercase tracking-[0.06em]">
        <span style={{ color: PALETTE.neg }}>{hasData ? `Sell ${sellPercent!.toFixed(0)}%` : 'Sell --'}</span>
        {caption && <span className="text-ink-subtle">{caption}</span>}
        <span style={{ color: PALETTE.pos }}>{hasData ? `Buy ${buyPercent!.toFixed(0)}%` : 'Buy --'}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-sm border border-line bg-base-2" role="img"
        aria-label={hasData ? `Buy ${buyPercent!.toFixed(0)} percent, sell ${sellPercent!.toFixed(0)} percent` : 'No flow'}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${buy}%`, background: PALETTE.pos, opacity: hasData ? 0.85 : 0.2 }} />
        <div className="absolute inset-y-0 right-0" style={{ width: `${100 - buy}%`, background: PALETTE.neg, opacity: hasData ? 0.85 : 0.2 }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink/40" aria-hidden />
      </div>
    </div>
  );
};
