// ============================================
// TRADE TAPE (real aggressive prints)
// ============================================
// The newest prints, newest first: time, price, size and the aggressor side
// resolved from the venue's `m` flag. It is the tape as it happened, never a
// reconstruction.

import React from 'react';
import type { TradePrint } from '../../core/orderflow/types';
import { formatNumber } from '../compass/format';
import { PALETTE } from '../common/palette';

interface TradeTapeProps {
  prints: TradePrint[];
  precision: number;
  /** How many prints to show. */
  limit?: number;
}

function timeOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export const TradeTape: React.FC<TradeTapeProps> = ({ prints, precision, limit = 30 }) => {
  if (prints.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <span className="text-micro text-ink-subtle">No prints yet.</span>
      </div>
    );
  }

  const newestFirst = [...prints].slice(-limit).reverse();

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 border-b border-line px-1 pb-1 text-micro uppercase tracking-[0.06em] text-ink-subtle">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Side</span>
      </div>
      <div className="max-h-[240px] overflow-y-auto">
        {newestFirst.map((print, i) => {
          const buy = print.side === 'BUY';
          return (
            <div
              key={`${print.id}-${print.time}-${i}`}
              className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 border-b border-line/60 px-1 py-[1px] last:border-0"
            >
              <span className="font-mono text-micro tabular text-ink-subtle">{timeOf(print.time)}</span>
              <span className="text-right font-mono text-micro tabular text-ink">{formatNumber(print.price, precision)}</span>
              <span className="text-right font-mono text-micro tabular text-ink-muted">{formatNumber(print.qty, 3)}</span>
              <span
                className="text-right font-mono text-micro font-medium uppercase"
                style={{ color: buy ? PALETTE.pos : PALETTE.neg }}
              >
                {buy ? 'Buy' : 'Sell'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
