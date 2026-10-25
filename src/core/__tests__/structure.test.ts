// ============================================
// MARKET STRUCTURE TESTS
// ============================================

import { describe, expect, it } from 'vitest';
import { analyzeMarketStructure, findSwings } from '../structure';
import type { Candle } from '../types';

function candle(high: number, low: number, close: number, index: number): Candle {
  return {
    datetime: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
    open: close,
    high,
    low,
    close,
    volume: 1000,
  };
}

/**
 * Build a candle series from a list of highs/lows/closes. Each entry is
 * [high, low, close].
 */
function series(rows: Array<[number, number, number]>): Candle[] {
  return rows.map(([high, low, close], i) => candle(high, low, close, i));
}

describe('findSwings', () => {
  it('finds a fractal high and low', () => {
    const candles = series([
      [10, 9, 9.5],
      [11, 9.5, 10],
      [13, 12, 12.5], // swing high
      [11.5, 10.5, 11],
      [10.5, 9, 9.5],
      [9, 7, 7.5], // swing low
      [10, 8, 9],
      [11, 10, 10.5],
      [12, 11, 11.5],
    ]);
    const swings = findSwings(candles, 2);
    expect(swings.some(s => s.kind === 'HIGH' && s.price === 13)).toBe(true);
    expect(swings.some(s => s.kind === 'LOW' && s.price === 7)).toBe(true);
  });

  it('returns nothing when the series is too short', () => {
    expect(findSwings(series([[1, 1, 1], [2, 2, 2]]), 2)).toEqual([]);
  });
});

describe('analyzeMarketStructure', () => {
  it('reports BULLISH BOS when price closes above a confirmed swing high', () => {
    const candles = series([
      [10, 9, 9.5],
      [11, 10, 10.5],
      [12, 11, 11.5], // swing high at 12
      [11, 10, 10.5],
      [10, 9, 9.5],
      [11, 10, 10.5],
      [13, 11, 12.5], // closes above the 12 swing high -> BOS
      [14, 12, 13.5],
      [15, 13, 14.5],
    ]);
    const structure = analyzeMarketStructure(candles, 2);
    expect(structure.lastBos).toBe('BULLISH');
  });

  it('reports BEARISH BOS when price closes below a confirmed swing low', () => {
    const candles = series([
      [15, 13, 14],
      [14, 12, 13],
      [13, 11, 11.5], // swing low at 11
      [14, 12, 13],
      [15, 13, 14],
      [14, 12, 13],
      [12, 10, 10.5], // closes below the 11 swing low -> BOS
      [11, 9, 9.5],
      [10, 8, 8.5],
    ]);
    const structure = analyzeMarketStructure(candles, 2);
    expect(structure.lastBos).toBe('BEARISH');
  });

  it('reports a CHoCH when structure flips against the previous break', () => {
    // Break up through the 12 swing high first, then break down through the
    // 7 swing low that formed afterwards.
    const candles = series([
      [10, 8, 9],
      [11, 9, 10],
      [12, 10, 11], // swing high 12
      [11, 9, 10],
      [10, 8, 9], // swing low 8
      [11, 9, 10],
      [14, 10, 13], // break up -> BOS BULLISH
      [13, 9, 10],
      [12, 8, 9],
      [11, 7, 8], // swing low 7 armed
      [12, 9, 10],
      [13, 10, 11],
      [10, 6, 6.5], // break down -> CHoCH BEARISH
    ]);
    const structure = analyzeMarketStructure(candles, 2);
    expect(structure.lastBos).toBe('BULLISH');
    expect(structure.lastChoch).toBe('BEARISH');
  });

  it('classifies price in the upper part of the range as PREMIUM', () => {
    const candles = series([
      [100, 90, 95],
      [105, 95, 100],
      [110, 100, 108], // swing high 110
      [105, 95, 100],
      [100, 90, 95],
      [95, 85, 90],
      [90, 80, 82], // swing low 80
      [95, 85, 90],
      [100, 90, 105], // close 105 -> near the top
      [105, 95, 108],
    ]);
    const structure = analyzeMarketStructure(candles, 2);
    expect(structure.zone).toBe('PREMIUM');
    expect(structure.rangePosition).toBeGreaterThan(55);
  });

  it('classifies price in the lower part of the range as DISCOUNT', () => {
    const candles = series([
      [110, 100, 105],
      [110, 100, 105],
      [110, 100, 108], // swing high 110
      [105, 95, 100],
      [100, 90, 95],
      [95, 85, 90],
      [90, 80, 82], // swing low 80
      [85, 80, 82],
      [85, 80, 82],
      [84, 80, 81],
    ]);
    const structure = analyzeMarketStructure(candles, 2);
    expect(structure.zone).toBe('DISCOUNT');
    expect(structure.rangePosition).toBeLessThan(45);
  });

  it('reports UNKNOWN when there is no usable range', () => {
    const structure = analyzeMarketStructure(series([[1, 1, 1]]), 2);
    expect(structure.zone).toBe('UNKNOWN');
    expect(structure.swingHigh).toBeNull();
    expect(structure.swingLow).toBeNull();
    expect(structure.lastBos).toBeNull();
    expect(structure.lastChoch).toBeNull();
  });

  it('is deterministic for the same input', () => {
    const candles = series([
      [10, 9, 9.5],
      [11, 10, 10.5],
      [12, 11, 11.5],
      [11, 10, 10.5],
      [10, 9, 9.5],
      [13, 10, 12.5],
      [14, 12, 13.5],
    ]);
    expect(analyzeMarketStructure(candles, 2)).toEqual(analyzeMarketStructure(candles, 2));
  });
});
