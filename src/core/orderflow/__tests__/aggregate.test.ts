import { describe, expect, it } from 'vitest';
import {
  FlowAggregator,
  bookImbalance,
  bucketStart,
  candleDeltas,
  cumulativeSizes,
  cvdSeries,
  utcResetBoundary,
  volumeTotals,
  type MinuteBucket,
} from '../aggregate';
import type { BookLevel, TradePrint } from '../types';

const MIN = 60_000;

function print(time: number, qty: number, side: 'BUY' | 'SELL'): TradePrint {
  return { id: time, time, price: 4000, qty, buyerIsMaker: side === 'SELL', side };
}

describe('UTC reset boundary', () => {
  it('is the UTC midnight that starts the session containing the instant', () => {
    // 2026-11-08T20:31:00Z
    const ms = Date.UTC(2026, 10, 8, 20, 31, 0);
    expect(utcResetBoundary(ms)).toBe(Date.UTC(2026, 10, 8, 0, 0, 0));
  });

  it('rolls at 00:00 UTC, not local midnight', () => {
    const justBefore = Date.UTC(2026, 10, 8, 23, 59, 59);
    const justAfter = Date.UTC(2026, 10, 9, 0, 0, 1);
    expect(utcResetBoundary(justBefore)).toBe(Date.UTC(2026, 10, 8));
    expect(utcResetBoundary(justAfter)).toBe(Date.UTC(2026, 10, 9));
  });
});

describe('delta aggregation across candle boundaries', () => {
  it('folds minutes into the right 5m buckets and sums aggressor volume', () => {
    const base = Date.UTC(2026, 10, 8, 10, 0, 0);
    const buckets: MinuteBucket[] = [
      { bucketStart: base + 0 * MIN, buy: 10, sell: 0, trades: 1 },
      { bucketStart: base + 1 * MIN, buy: 0, sell: 4, trades: 1 },
      { bucketStart: base + 5 * MIN, buy: 7, sell: 3, trades: 2 },
      { bucketStart: base + 10 * MIN, buy: 1, sell: 1, trades: 2 },
    ];
    const deltas = candleDeltas(buckets, 5, utcResetBoundary(base), 100);
    // The 10m bucket is the forming one, so it is dropped.
    expect(deltas).toHaveLength(2);
    expect(deltas[0].bucketStart).toBe(base);
    expect(deltas[0].buyVolume).toBe(10);
    expect(deltas[0].sellVolume).toBe(4);
    expect(deltas[0].delta).toBe(6);
    expect(deltas[0].trades).toBe(2);
    expect(deltas[1].bucketStart).toBe(base + 5 * MIN);
    expect(deltas[1].delta).toBe(4);
  });

  it('drops buckets before the reset and keeps only the newest `count`', () => {
    const base = Date.UTC(2026, 10, 8, 0, 0, 0);
    const buckets: MinuteBucket[] = [];
    for (let i = 0; i < 40; i += 1) buckets.push({ bucketStart: base + i * MIN, buy: 1, sell: 0, trades: 1 });
    // A bucket from the previous session must be excluded.
    buckets.unshift({ bucketStart: base - 60 * MIN, buy: 999, sell: 999, trades: 9 });

    const deltas = candleDeltas(buckets, 1, base, 10);
    expect(deltas).toHaveLength(10);
    expect(deltas[0].bucketStart).toBe(base + 29 * MIN); // newest 10, forming one dropped
    expect(deltas[deltas.length - 1].bucketStart).toBe(base + 38 * MIN);
    expect(deltas.every(d => d.buyVolume === 1)).toBe(true);
  });

  it('builds a cumulative-delta series from per-candle deltas', () => {
    const base = Date.UTC(2026, 10, 8, 1, 0, 0);
    const deltas = candleDeltas(
      [
        { bucketStart: base, buy: 5, sell: 1, trades: 1 },
        { bucketStart: base + MIN, buy: 2, sell: 6, trades: 1 },
        { bucketStart: base + 2 * MIN, buy: 3, sell: 0, trades: 1 },
      ],
      1,
      utcResetBoundary(base),
      100
    );
    const cvd = cvdSeries(deltas);
    expect(cvd.map(p => p.delta)).toEqual([4, -4]);
    expect(cvd.map(p => p.cvd)).toEqual([4, 0]);
  });
});

describe('FlowAggregator', () => {
  it('maps aggressor side to buy/sell volume and tracks the session reset', () => {
    const agg = new FlowAggregator();
    const base = Date.UTC(2026, 10, 8, 12, 0, 0);
    agg.ingest(print(base, 3, 'BUY'));
    agg.ingest(print(base + 1_000, 1, 'SELL'));
    const totals = agg.sessionTotals();
    expect(totals.buy).toBe(3);
    expect(totals.sell).toBe(1);
    expect(totals.volume).toBe(4);
    expect(agg.resetAt).toBe(Date.UTC(2026, 10, 8));
    expect(agg.prints).toBe(2);
  });

  it('rolls the session totals when the UTC day changes', () => {
    const agg = new FlowAggregator();
    const day1 = Date.UTC(2026, 10, 8, 23, 0, 0);
    const day2 = Date.UTC(2026, 10, 9, 0, 30, 0);
    agg.ingest(print(day1, 10, 'BUY'));
    expect(agg.sessionTotals().buy).toBe(10);
    agg.ingest(print(day2, 2, 'BUY'));
    // The reset moved to day 2, so only day 2's volume is in the session total.
    expect(agg.resetAt).toBe(Date.UTC(2026, 10, 9));
    expect(agg.sessionTotals().buy).toBe(2);
    // But the previous session's buckets are still available for the profile.
    expect(agg.minuteBucketsForSession(Date.UTC(2026, 10, 8)).map(b => b.buy)).toEqual([10]);
  });

  it('bounds memory by dropping minutes older than the retention window', () => {
    const agg = new FlowAggregator(5);
    const base = Date.UTC(2026, 10, 8, 0, 0, 0);
    for (let i = 0; i < 500; i += 1) agg.ingest(print(base + i * MIN, 1, 'BUY'));
    expect(agg.minuteBuckets().length).toBeLessThanOrEqual(5 + 120 + 1);
  });

  it('keeps the forming minute out of the closed series', () => {
    const agg = new FlowAggregator();
    const base = Date.UTC(2026, 10, 8, 9, 0, 0);
    agg.ingest(print(base, 1, 'BUY'));
    agg.ingest(print(base + 5 * MIN, 2, 'SELL'));
    const deltas = candleDeltas(agg.minuteBuckets(), 5, utcResetBoundary(base), 100);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].buyVolume).toBe(1);
  });
});

describe('book imbalance', () => {
  const bids: BookLevel[] = [
    { price: 100, size: 3 },
    { price: 99, size: 5 },
    { price: 98, size: 100 },
  ];
  const asks: BookLevel[] = [
    { price: 101, size: 1 },
    { price: 102, size: 1 },
    { price: 103, size: 100 },
  ];

  it('is (bid - ask) / (bid + ask) over the top N levels', () => {
    // top 2: bids 3+5=8, asks 1+1=2 -> (8-2)/(8+2) = 0.6
    expect(bookImbalance(bids, asks, 2)).toBeCloseTo(0.6, 6);
  });

  it('ignores levels beyond N, so a deep wall cannot dominate', () => {
    // top 1: bids 3, asks 1 -> (3-1)/4 = 0.5
    expect(bookImbalance(bids, asks, 1)).toBeCloseTo(0.5, 6);
  });

  it('is null when there is no book, never a zero standing in for one', () => {
    expect(bookImbalance([], [], 10)).toBeNull();
    expect(bookImbalance([{ price: 1, size: 0 }], [{ price: 2, size: 0 }], 10)).toBeNull();
  });

  it('computes cumulative sizes and the depth scale', () => {
    expect(cumulativeSizes(bids)).toEqual([3, 8, 108]);
  });
});

describe('volume totals and bucket start', () => {
  it('sums buy and sell over the deltas', () => {
    const base = Date.UTC(2026, 10, 8, 2, 0, 0);
    const deltas = candleDeltas(
      [
        { bucketStart: base, buy: 4, sell: 1, trades: 1 },
        { bucketStart: base + MIN, buy: 0, sell: 5, trades: 1 },
      ],
      1,
      utcResetBoundary(base),
      100
    );
    const totals = volumeTotals(deltas);
    expect(totals.buy).toBe(4);
    expect(totals.sell).toBe(1);
    expect(totals.volume).toBe(5);
  });

  it('floors an instant to its bucket open', () => {
    const base = Date.UTC(2026, 10, 8, 10, 7, 33);
    expect(bucketStart(base, 5)).toBe(Date.UTC(2026, 10, 8, 10, 5, 0));
    expect(bucketStart(base, 1)).toBe(Date.UTC(2026, 10, 8, 10, 7, 0));
  });
});
