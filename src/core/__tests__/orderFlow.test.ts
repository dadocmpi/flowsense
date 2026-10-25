// ============================================
// ORDER FLOW AGGREGATION TESTS
// ============================================
// Order flow must be real or absent. These tests pin down that the split comes
// only from real trades, that an empty tape is not presented as a balanced
// market, and that the two delta windows are not conflated.

import { describe, expect, it } from 'vitest';
import {
  applyTrade,
  buildOrderFlowSnapshot,
  computeVolumeSplit,
  cumulativeDeltaFromCandles,
  emptyOrderFlowState,
  MAX_TAPE_ITEMS,
} from '../orderFlow';
import type { Candle } from '../types';
import type { TradeTapeItem } from '../providers/types';

function trade(type: 'BUY' | 'SELL', size: number, id = '1'): TradeTapeItem {
  return { id, price: 100, size, time: '12:00:00.000', type, quoteValue: 100 * size };
}

function candle(volume: number, takerBuyVolume?: number): Candle {
  return {
    datetime: '2024-06-10 13:30:00',
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume,
    ...(takerBuyVolume !== undefined ? { takerBuyVolume } : {}),
  };
}

describe('computeVolumeSplit', () => {
  it('reports the true split from real tape totals', () => {
    const split = computeVolumeSplit(75, 25);
    expect(split.buyersPercent).toBe(75);
    expect(split.sellersPercent).toBe(25);
    expect(split.volumeDelta).toBe(50);
    expect(split.hasSplit).toBe(true);
  });

  it('flags an empty tape instead of implying a balanced market', () => {
    const split = computeVolumeSplit(0, 0);
    expect(split.hasSplit).toBe(false);
    expect(split.volumeDelta).toBe(0);
    // The percentages are a neutral placeholder, and hasSplit tells the UI not
    // to draw a bar from them.
    expect(split.buyersPercent).toBe(50);
  });

  it('percentages always sum to 100', () => {
    for (const [buy, sell] of [
      [1, 0],
      [0, 1],
      [3, 7],
      [123.456, 789.012],
    ]) {
      const split = computeVolumeSplit(buy, sell);
      expect(split.buyersPercent + split.sellersPercent).toBeCloseTo(100, 10);
    }
  });

  it('treats unusable input as no volume', () => {
    expect(computeVolumeSplit(NaN, NaN).hasSplit).toBe(false);
    expect(computeVolumeSplit(-5, -5).hasSplit).toBe(false);
  });
});

describe('cumulativeDeltaFromCandles', () => {
  it('is buy minus sell volume from the per-candle split', () => {
    // 30 volume with 20 buy -> 20 buy, 10 sell -> +10.
    expect(cumulativeDeltaFromCandles([candle(30, 20)])).toBe(10);
    expect(cumulativeDeltaFromCandles([candle(30, 5)])).toBe(-20);
  });

  it('sums across the window', () => {
    expect(cumulativeDeltaFromCandles([candle(30, 20), candle(10, 10)])).toBe(20);
  });

  it('returns 0 rather than guessing when no candle reports a split', () => {
    expect(cumulativeDeltaFromCandles([candle(100), candle(200)])).toBe(0);
  });

  it('skips split-less candles without counting them as balanced', () => {
    // Only the split candle contributes: +10, not (20+10)/2.
    expect(cumulativeDeltaFromCandles([candle(30, 20), candle(10)])).toBe(10);
  });

  it('returns 0 for an empty window', () => {
    expect(cumulativeDeltaFromCandles([])).toBe(0);
  });
});

describe('applyTrade', () => {
  it('accumulates buy and sell volume from the aggressor flag', () => {
    let state = emptyOrderFlowState();
    state = applyTrade(state, trade('BUY', 5, 'a'));
    state = applyTrade(state, trade('SELL', 2, 'b'));
    state = applyTrade(state, trade('BUY', 1, 'c'));
    expect(state.buyerVolume).toBe(6);
    expect(state.sellerVolume).toBe(2);
  });

  it('puts the newest trade at the head of the tape', () => {
    let state = emptyOrderFlowState();
    state = applyTrade(state, trade('BUY', 1, 'first'));
    state = applyTrade(state, trade('SELL', 1, 'second'));
    expect(state.recentTrades[0].id).toBe('second');
    expect(state.recentTrades[1].id).toBe('first');
  });

  it('caps the tape so a busy market cannot grow it without bound', () => {
    let state = emptyOrderFlowState();
    for (let i = 0; i < MAX_TAPE_ITEMS + 25; i++) {
      state = applyTrade(state, trade('BUY', 1, String(i)));
    }
    expect(state.recentTrades).toHaveLength(MAX_TAPE_ITEMS);
    expect(state.recentTrades[0].id).toBe(String(MAX_TAPE_ITEMS + 24));
  });

  it('never changes the totals when the tape is trimmed', () => {
    let state = emptyOrderFlowState();
    for (let i = 0; i < MAX_TAPE_ITEMS + 10; i++) {
      state = applyTrade(state, trade('BUY', 2, String(i)));
    }
    expect(state.buyerVolume).toBe((MAX_TAPE_ITEMS + 10) * 2);
  });
});

describe('buildOrderFlowSnapshot', () => {
  it('marks the stream live only when the status is LIVE', () => {
    const state = { ...emptyOrderFlowState(), buyerVolume: 10, sellerVolume: 5 };
    expect(buildOrderFlowSnapshot(state, [], 'LIVE', 1).isLive).toBe(true);
    expect(buildOrderFlowSnapshot(state, [], 'RECONNECTING', 1).isLive).toBe(false);
    expect(buildOrderFlowSnapshot(state, [], 'UNAVAILABLE', 1).isLive).toBe(false);
  });

  it('carries both delta windows without merging them', () => {
    const state = { ...emptyOrderFlowState(), buyerVolume: 60, sellerVolume: 40 };
    const snapshot = buildOrderFlowSnapshot(state, [candle(100, 80)], 'LIVE', 123);
    // Live tape delta and candle-window delta are different windows.
    expect(snapshot.volumeDelta).toBe(20);
    expect(snapshot.cumulativeDelta).toBe(60);
    expect(snapshot.lastUpdate).toBe(123);
  });
});
