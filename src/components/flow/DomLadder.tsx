// ============================================
// DOM LADDER (real resting book)
// ============================================
// The top N bid/ask levels with size, cumulative size and depth bars — a real
// Level-2 ladder from the venue, not a reconstruction. Asks sit above the
// spread, bids below, best-first, each side's depth bar scaled against the
// deepest cumulative size on either side.
//
// With no book it renders a designed empty state, never a zeroed ladder.

import React from 'react';
import type { BookSnapshot } from '../../core/orderflow/types';
import { cumulativeSizes, depthScale } from '../../core/orderflow/aggregate';
import { formatNumber } from '../compass/format';
import { PALETTE } from '../common/palette';
import { cn } from '@/lib/utils';

interface DomLadderProps {
  book: BookSnapshot | null;
  precision: number;
  /** Levels of each side to show. */
  levels?: number;
}

export const DomLadder: React.FC<DomLadderProps> = ({ book, precision, levels = 20 }) => {
  if (!book || book.bids.length === 0 || book.asks.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1 text-center">
        <span className="text-label text-ink-muted">Book unavailable</span>
        <span className="text-micro text-ink-subtle">No resting bid/ask book from the venue.</span>
      </div>
    );
  }

  const bids = book.bids.slice(0, levels);
  const asks = book.asks.slice(0, levels);
  const scale = depthScale(bids, asks);
  const bidCum = cumulativeSizes(bids);
  const askCum = cumulativeSizes(asks);
  const spread = asks[0].price - bids[0].price;

  const Rows = ({
    side,
    rows,
    cumulative,
  }: {
    side: 'bid' | 'ask';
    rows: { price: number; size: number }[];
    cumulative: number[];
  }) => (
    <div className="flex flex-col">
      {rows.map((level, i) => {
        const width = (cumulative[i] / scale) * 100;
        const color = side === 'bid' ? PALETTE.pos : PALETTE.neg;
        return (
          <div key={`${side}-${level.price}-${i}`} className="relative grid grid-cols-[1fr_1fr_1fr] gap-2 px-2 py-[1px]">
            <div
              className="absolute inset-y-0 right-0 opacity-[0.12]"
              style={{ width: `${width}%`, background: color }}
              aria-hidden
            />
            <span className="relative z-10 font-mono text-micro tabular" style={{ color }}>
              {formatNumber(level.price, precision)}
            </span>
            <span className="relative z-10 text-right font-mono text-micro tabular text-ink">
              {formatNumber(level.size, 3)}
            </span>
            <span className="relative z-10 text-right font-mono text-micro tabular text-ink-subtle">
              {formatNumber(cumulative[i], 2)}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-b border-line px-2 pb-1 text-micro uppercase tracking-[0.06em] text-ink-subtle">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Cum</span>
      </div>

      {/* Asks, best at the bottom of their block. */}
      <div className="flex flex-col-reverse border-b border-line pb-0.5">
        <Rows side="ask" rows={asks} cumulative={askCum} />
      </div>

      <div className="flex items-center justify-between px-2 py-1 text-micro">
        <span className="text-ink-subtle">Spread</span>
        <span className="font-mono tabular text-ink-muted">{formatNumber(spread, precision)}</span>
      </div>

      <div className="border-b border-line pb-0.5">
        <Rows side="bid" rows={bids} cumulative={bidCum} />
      </div>

      <div className={cn('mt-1 flex items-center justify-between px-2 text-micro text-ink-subtle')}>
        <span>
          <span style={{ color: PALETTE.pos }}>■</span> Bids {bids.length}
        </span>
        <span>
          Asks {asks.length} <span style={{ color: PALETTE.neg }}>■</span>
        </span>
      </div>
    </div>
  );
};
