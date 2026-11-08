import { describe, expect, it } from 'vitest';
import { PriceHistogram } from '../histogram';
import { FlowAggregator } from '../aggregate';
import type { TradePrint } from '../types';

function print(price: number, qty: number, side: 'BUY' | 'SELL', time = 1_000): TradePrint {
  return { id: time, time, price, qty, buyerIsMaker: side === 'SELL', side };
}

describe('PriceHistogram', () => {
  it('folds prints into tick-sized bins and splits by side', () => {
    const hist = new PriceHistogram(0.01);
    hist.ingest(print(4066.6, 2, 'BUY'));
    hist.ingest(print(4066.6, 1, 'SELL'));
    hist.ingest(print(4066.61, 5, 'BUY'));
    const entries = hist.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0].buy).toBe(2);
    expect(entries[0].sell).toBe(1);
    expect(entries[1].buy).toBe(5);
  });

  it('keeps memory bounded by price levels, not trade count', () => {
    const hist = new PriceHistogram(1);
    for (let i = 0; i < 10_000; i += 1) hist.ingest(print(100 + (i % 5), 1, 'BUY'));
    expect(hist.binCount).toBe(5);
  });

  it('rejects a non-positive tick', () => {
    expect(() => new PriceHistogram(0)).toThrow();
  });
});

describe('FlowAggregator session histograms', () => {
  it('moves the current histogram to previous when the UTC day rolls', () => {
    const agg = new FlowAggregator(2 * 24 * 60, 0.01);
    const day1 = Date.UTC(2026, 10, 8, 23, 0, 0);
    const day2 = Date.UTC(2026, 10, 9, 0, 30, 0);
    agg.ingest(print(4000, 3, 'BUY', day1));
    expect(agg.sessionHistogram().entries()).toHaveLength(1);
    expect(agg.previousHistogram().entries()).toHaveLength(0);

    agg.ingest(print(4010, 4, 'SELL', day2));
    expect(agg.currentSession).toBe(Date.UTC(2026, 10, 9));
    expect(agg.previousSession).toBe(Date.UTC(2026, 10, 8));
    // The old session's histogram is now the previous one, untouched.
    expect(agg.previousHistogram().entries()[0].buy).toBe(3);
    // The new session's histogram only holds the new print.
    expect(agg.sessionHistogram().entries()).toHaveLength(1);
    expect(agg.sessionHistogram().entries()[0].sell).toBe(4);
  });
});
