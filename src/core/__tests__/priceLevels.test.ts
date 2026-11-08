// ============================================
// ESTIMATED PRICE LEVELS TESTS
// ============================================
// The levels line for an instrument with no book. The invariants that matter:
//   * the busiest zone is where most activity actually happened
//   * a flat series (zero range) reports no zones rather than inventing one
//   * the swing high / low come from the recent window

import { describe, expect, it } from 'vitest';
import { DEFAULT_ESTIMATED_LEVELS_CONFIG as CFG, estimatePriceLevels } from '../priceLevels';
import type { Candle } from '../types';

function candle(close: number, high: number, low: number, volume = 0, index = 0): Candle {
  return {
    datetime: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
    open: close,
    high,
    low,
    close,
    volume,
  };
}

describe('estimatePriceLevels', () => {
  it('places the busiest zone where the most activity happened', () => {
    const candles: Candle[] = [];
    // Most candles close near 100 (busy), a few near 110.
    for (let i = 0; i < 18; i += 1) candles.push(candle(100, 101, 99, 100, i));
    for (let i = 0; i < 2; i += 1) candles.push(candle(110, 111, 109, 100, 100 + i));

    const levels = estimatePriceLevels(candles, CFG);
    expect(levels.available).toBe(true);
    expect(levels.zones.length).toBeGreaterThan(0);
    // The busiest zone sits around 100, not 110.
    expect(levels.zones[0].mid).toBeGreaterThan(95);
    expect(levels.zones[0].mid).toBeLessThan(105);
    expect(levels.zones[0].share).toBeGreaterThan(0.5);
  });

  it('reports the recent swing high and low', () => {
    const candles = [
      candle(100, 105, 95, 100, 0),
      candle(102, 108, 98, 100, 1),
      candle(101, 106, 99, 100, 2),
    ];
    const levels = estimatePriceLevels(candles, CFG);
    expect(levels.swingHigh).toBe(108);
    expect(levels.swingLow).toBe(95);
    expect(levels.price).toBe(101);
  });

  it('returns no zones for a zero-range series, but keeps the swing levels', () => {
    const flat = Array.from({ length: 10 }, (_, i) => candle(100, 100, 100, 0, i));
    const levels = estimatePriceLevels(flat, CFG);
    expect(levels.available).toBe(false);
    expect(levels.zones).toEqual([]);
    expect(levels.swingHigh).toBe(100);
    expect(levels.swingLow).toBe(100);
  });

  it('uses the range proxy when volume is missing', () => {
    const candles = Array.from({ length: 10 }, (_, i) => candle(100 + i, 101 + i, 99 + i, 0, i));
    const levels = estimatePriceLevels(candles, CFG);
    expect(levels.proxy).toBe('range');
    expect(levels.available).toBe(true);
  });

  it('returns nothing at all for an empty series', () => {
    const levels = estimatePriceLevels([]);
    expect(levels.available).toBe(false);
    expect(levels.zones).toEqual([]);
    expect(levels.swingHigh).toBeNull();
  });
});
