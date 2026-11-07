// ============================================
// ORDER BOOK PRESSURE TESTS
// ============================================
// The right-hand reading must never show a made-up number. These tests pin the
// honest behaviours: a two-sided book yields a real pressure percentage, and a
// missing or one-sided book yields NO reading rather than a neutral zero.

import { describe, expect, it } from 'vitest';
import { buildOrderBookReading, type BookQuote } from '../orderbook';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';

function quote(overrides: Partial<BookQuote> = {}): BookQuote {
  return {
    bid: 100,
    ask: 100.02,
    bidSize: 300,
    askSize: 100,
    volume: 1_000_000,
    source: 'test',
    at: 1_700_000_000_000,
    ...overrides,
  };
}

describe('buildOrderBookReading', () => {
  it('turns a bid-heavy book into positive pressure', () => {
    const reading = buildOrderBookReading(quote({ bidSize: 300, askSize: 100 }), DEFAULT_COMPASS_CONFIG);
    expect(reading).not.toBeNull();
    // (300-100)/400 = 0.5 -> +50, and 75% of the book rests on the bid.
    expect(reading!.metrics.imbalance).toBeCloseTo(0.5, 10);
    expect(reading!.metrics.bidSharePercent).toBeCloseTo(75, 10);
    expect(reading!.gauge.score).toBe(50);
    expect(reading!.gauge.label).toBe('BUY');
  });

  it('turns an ask-heavy book into negative pressure', () => {
    const reading = buildOrderBookReading(quote({ bidSize: 100, askSize: 300 }), DEFAULT_COMPASS_CONFIG);
    expect(reading!.metrics.imbalance).toBeCloseTo(-0.5, 10);
    expect(reading!.gauge.score).toBe(-50);
    expect(reading!.gauge.label).toBe('SELL');
  });

  it('reads Neutral inside the neutral band and never calls a side', () => {
    // 51/49 is within the +/-5% band: too close to balance to name a side.
    const reading = buildOrderBookReading(quote({ bidSize: 51, askSize: 49 }), DEFAULT_COMPASS_CONFIG);
    expect(reading!.gauge.label).toBe('NEUTRAL');
    expect(reading!.gauge.tally).toEqual({ buy: 0, neutral: 1, sell: 0 });
  });

  it('computes the mid, spread and spread percentage from real prices', () => {
    const reading = buildOrderBookReading(quote({ bid: 100, ask: 100.1 }), DEFAULT_COMPASS_CONFIG);
    expect(reading!.metrics.mid).toBeCloseTo(100.05, 10);
    expect(reading!.metrics.spread).toBeCloseTo(0.1, 10);
    expect(reading!.metrics.spreadPercent).toBeCloseTo((0.1 / 100.05) * 100, 6);
  });

  it('returns no reading for a one-sided book rather than a neutral zero', () => {
    expect(buildOrderBookReading(quote({ askSize: null }), DEFAULT_COMPASS_CONFIG)).toBeNull();
    expect(buildOrderBookReading(quote({ bidSize: null }), DEFAULT_COMPASS_CONFIG)).toBeNull();
  });

  it('returns no reading for an empty book', () => {
    expect(buildOrderBookReading(quote({ bidSize: 0, askSize: 0 }), DEFAULT_COMPASS_CONFIG)).toBeNull();
  });

  it('keeps the reading when prices are absent but sizes are real', () => {
    const reading = buildOrderBookReading(quote({ bid: null, ask: null }), DEFAULT_COMPASS_CONFIG);
    expect(reading).not.toBeNull();
    expect(reading!.metrics.mid).toBeNull();
    expect(reading!.metrics.spreadPercent).toBeNull();
    // The pressure percentage is still a real number derived from the sizes.
    expect(reading!.metrics.bidSharePercent).toBeCloseTo(75, 10);
  });

  it('reports volume alongside the book without letting it add a direction', () => {
    const withVolume = buildOrderBookReading(quote({ volume: 1_000 }), DEFAULT_COMPASS_CONFIG);
    const withoutVolume = buildOrderBookReading(quote({ volume: null }), DEFAULT_COMPASS_CONFIG);
    expect(withVolume!.metrics.volume).toBe(1_000);
    expect(withoutVolume!.metrics.volume).toBeNull();
    // Same book, same pressure: volume corroborates but never flips the read.
    expect(withVolume!.gauge.score).toBe(withoutVolume!.gauge.score);
  });

  it('keeps the label consistent with the score', () => {
    for (const [bidSize, askSize] of [[1000, 1], [1, 1000], [50, 50], [60, 40]] as const) {
      const reading = buildOrderBookReading(quote({ bidSize, askSize }), DEFAULT_COMPASS_CONFIG)!;
      const score = reading.gauge.score;
      const label = reading.gauge.label;
      if (score >= 60) expect(label).toBe('STRONG_BUY');
      else if (score >= 20) expect(label).toBe('BUY');
      else if (score > -20) expect(label).toBe('NEUTRAL');
      else if (score > -60) expect(label).toBe('SELL');
      else expect(label).toBe('STRONG_SELL');
    }
  });
});
