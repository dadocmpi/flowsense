// ============================================
// COMPASS ROSTER TESTS
// ============================================
// Every expected factor must appear, and a factor with too few candles must be
// an explicit N/A slot rather than a silently missing row.

import { describe, expect, it } from 'vitest';
import { gaugeRosters, MA_ROSTER, OSCILLATOR_ROSTER } from '../compassRoster';
import { movingAverageVotes, indicatorVotes } from '../votes';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';
import type { Candle } from '../types';

function series(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    datetime: `2024-06-10 13:${String(i % 60).padStart(2, '0')}:00`,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 10,
  }));
}

describe('roster shape', () => {
  it('lists every moving average and oscillator the compass expects', () => {
    expect(MA_ROSTER).toHaveLength(12);
    expect(OSCILLATOR_ROSTER.length).toBeGreaterThanOrEqual(12);
  });
});

describe('gaugeRosters', () => {
  it('fills every MA slot when there are enough candles', () => {
    const candles = series(250);
    const { movingAverages } = gaugeRosters(
      [...movingAverageVotes(candles, DEFAULT_COMPASS_CONFIG), ...indicatorVotes(candles, DEFAULT_COMPASS_CONFIG)],
      candles.length
    );
    expect(movingAverages.every(row => row.available)).toBe(true);
  });

  it('marks a long-warmup indicator N/A and reports how many candles it needs', () => {
    // 20 candles: SMA 50/100/200 and EMA 50/100/200 cannot exist yet.
    const candles = series(20);
    const { movingAverages } = gaugeRosters(movingAverageVotes(candles, DEFAULT_COMPASS_CONFIG), candles.length);

    const sma200 = movingAverages.find(row => row.name === 'SMA 200');
    expect(sma200?.available).toBe(false);
    expect(sma200?.detail).toBeNull();
    expect(sma200?.minCandles).toBe(200);
    expect(sma200?.candleCount).toBe(20);

    const sma5 = movingAverages.find(row => row.name === 'SMA 5');
    expect(sma5?.available).toBe(true);
  });

  it('reports RSI as N/A below 15 candles and available at 15', () => {
    const tooFew = gaugeRosters(indicatorVotes(series(14), DEFAULT_COMPASS_CONFIG), 14);
    expect(tooFew.oscillators.find(row => row.name === 'RSI (14)')?.available).toBe(false);

    const enough = gaugeRosters(indicatorVotes(series(15), DEFAULT_COMPASS_CONFIG), 15);
    expect(enough.oscillators.find(row => row.name === 'RSI (14)')?.available).toBe(true);
  });
});
