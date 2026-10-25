// ============================================
// VOTE LOGIC TESTS
// ============================================

import { describe, expect, it } from 'vitest';
import { indicatorVotes, movingAverageVote, movingAverageVotes } from '../votes';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';
import type { Candle } from '../types';

function candle(close: number, index = 0, high = close, low = close, volume = 1000): Candle {
  return {
    datetime: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
    open: close,
    high,
    low,
    close,
    volume,
  };
}

function ramp(length: number, start = 100, step = 1): Candle[] {
  return Array.from({ length }, (_, i) => {
    const close = start + i * step;
    return candle(close, i, close + 0.5, close - 0.5);
  });
}

describe('movingAverageVote', () => {
  it('is Buy above the average and Sell below it', () => {
    expect(movingAverageVote(105, 100, 0.05)).toBe('BUY');
    expect(movingAverageVote(95, 100, 0.05)).toBe('SELL');
  });

  it('is Neutral inside the configurable tolerance band', () => {
    // 0.04% above -> inside a 0.05% band -> Neutral
    expect(movingAverageVote(100.04, 100, 0.05)).toBe('NEUTRAL');
    // 0.06% above -> outside -> Buy
    expect(movingAverageVote(100.06, 100, 0.05)).toBe('BUY');
    // A wider band swallows the same move.
    expect(movingAverageVote(100.5, 100, 1)).toBe('NEUTRAL');
  });

  it('is Neutral for unusable inputs', () => {
    expect(movingAverageVote(100, 0, 0.05)).toBe('NEUTRAL');
    expect(movingAverageVote(NaN, 100, 0.05)).toBe('NEUTRAL');
  });
});

describe('movingAverageVotes', () => {
  it('emits both SMA and EMA lines for every period that has enough data', () => {
    const votes = movingAverageVotes(ramp(250), DEFAULT_COMPASS_CONFIG);
    const names = votes.map(v => v.name);
    for (const period of [5, 10, 20, 50, 100, 200]) {
      expect(names).toContain(`SMA ${period}`);
      expect(names).toContain(`EMA ${period}`);
    }
    expect(votes).toHaveLength(12);
  });

  it('skips periods without enough candles', () => {
    const votes = movingAverageVotes(ramp(25), DEFAULT_COMPASS_CONFIG);
    const names = votes.map(v => v.name);
    expect(names).toContain('SMA 20');
    expect(names).not.toContain('SMA 50');
    expect(names).not.toContain('SMA 200');
  });

  it('votes Buy when price is above every average in a steady uptrend', () => {
    const votes = movingAverageVotes(ramp(250), DEFAULT_COMPASS_CONFIG);
    expect(votes.every(v => v.vote === 'BUY')).toBe(true);
  });

  it('votes Sell when price is below every average in a steady downtrend', () => {
    const votes = movingAverageVotes(ramp(250, 400, -1), DEFAULT_COMPASS_CONFIG);
    expect(votes.every(v => v.vote === 'SELL')).toBe(true);
  });
});

describe('indicatorVotes', () => {
  const votes = indicatorVotes(ramp(300), DEFAULT_COMPASS_CONFIG);
  const names = votes.map(v => v.name);

  it('covers every required indicator', () => {
    for (const required of [
      'RSI (14)',
      'Stochastic (9,6)',
      'Stochastic RSI (14)',
      'MACD (12,26,9)',
      'ADX (14)',
      'Williams %R (14)',
      'CCI (14)',
      'ATR (14)',
      'Highs/Lows (14)',
      'Ultimate Oscillator',
      'ROC (12)',
      'Bull/Bear Power (13)',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('every vote is one of Buy / Neutral / Sell', () => {
    expect(votes.every(v => ['BUY', 'NEUTRAL', 'SELL'].includes(v.vote))).toBe(true);
  });

  it('reports a raw numeric value for every vote', () => {
    expect(votes.every(v => Number.isFinite(v.value))).toBe(true);
    expect(votes.every(v => typeof v.display === 'string' && v.display.length > 0)).toBe(true);
  });

  it('votes RSI Sell at 70 or above and Buy at 30 or below', () => {
    // A relentless rise pins RSI at 100.
    const up = indicatorVotes(ramp(300), DEFAULT_COMPASS_CONFIG).find(v => v.name === 'RSI (14)');
    expect(up!.vote).toBe('SELL');
    // A relentless fall pins it at 0.
    const down = indicatorVotes(ramp(300, 400, -1), DEFAULT_COMPASS_CONFIG).find(v => v.name === 'RSI (14)');
    expect(down!.vote).toBe('BUY');
  });

  it('keeps ATR neutral: volatility alone is not a direction', () => {
    const atrVote = votes.find(v => v.name === 'ATR (14)');
    expect(atrVote!.vote).toBe('NEUTRAL');
    expect(atrVote!.value).toBeGreaterThan(0);
  });

  it('votes MACD Buy on an accelerating rise and Sell on an accelerating fall', () => {
    const up = Array.from({ length: 120 }, (_, i) => candle(100 + i * i * 0.05, i));
    const down = Array.from({ length: 120 }, (_, i) => candle(500 - i * i * 0.05, i));
    expect(indicatorVotes(up, DEFAULT_COMPASS_CONFIG).find(v => v.name === 'MACD (12,26,9)')!.vote).toBe('BUY');
    expect(indicatorVotes(down, DEFAULT_COMPASS_CONFIG).find(v => v.name === 'MACD (12,26,9)')!.vote).toBe('SELL');
  });

  it('returns nothing for an empty series', () => {
    expect(indicatorVotes([], DEFAULT_COMPASS_CONFIG)).toEqual([]);
  });
});
