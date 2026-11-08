// ============================================
// TICK-SIZED PRICE HISTOGRAM
// ============================================
// Incremental volume-at-price, one bin per instrument tick. Prints arrive at
// rates far too high to keep them all, so each print is folded into its bin as
// it arrives and the print itself is discarded. Memory is therefore bounded by
// the number of price levels traded, not by the number of trades.
//
// Two instances are kept by the aggregator (current and previous UTC session),
// which is exactly what the volume profile needs.

import type { TradePrint } from './types';

export interface HistogramEntry {
  /** Bin index; the bin covers [index * tickSize, (index + 1) * tickSize). */
  index: number;
  buy: number;
  sell: number;
}

export class PriceHistogram {
  private readonly tickSize: number;
  private readonly bins = new Map<number, { buy: number; sell: number }>();

  constructor(tickSize: number) {
    if (!Number.isFinite(tickSize) || tickSize <= 0) {
      throw new Error('PriceHistogram tickSize must be a positive number');
    }
    this.tickSize = tickSize;
  }

  get binCount(): number {
    return this.bins.size;
  }

  ingest(print: TradePrint): void {
    if (!Number.isFinite(print.price) || !Number.isFinite(print.qty) || print.qty <= 0) return;
    const index = Math.floor(print.price / this.tickSize);
    const bin = this.bins.get(index);
    if (bin) {
      if (print.side === 'BUY') bin.buy += print.qty;
      else bin.sell += print.qty;
    } else {
      this.bins.set(index, {
        buy: print.side === 'BUY' ? print.qty : 0,
        sell: print.side === 'SELL' ? print.qty : 0,
      });
    }
  }

  /** Populated bins, lowest price first. */
  entries(): HistogramEntry[] {
    return [...this.bins.entries()]
      .map(([index, bin]) => ({ index, buy: bin.buy, sell: bin.sell }))
      .sort((a, b) => a.index - b.index);
  }

  clear(): void {
    this.bins.clear();
  }
}
