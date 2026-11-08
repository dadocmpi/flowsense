// ============================================
// ESTIMATED ORDER FLOW TESTS
// ============================================
// The estimator is pure, so it is tested directly against hand-built candles.
// The cases pinned here are the ones the panel's honesty depends on:
//
//   * a candle closing on its high reads buying pressure; on its low, selling
//   * a zero-range candle (high == low) is neutral, never a divide-by-zero
//   * a series with no usable volume falls back to the range activity proxy
//   * too few candles means no reading, never a half-filled one
//   * the state word needs a streak past the neutral zone (hysteresis)

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ESTIMATED_ORDER_FLOW_CONFIG as CFG,
  candleWeight,
  classifyState,
  closeLocationValue,
  detectActivityProxy,
  detectDivergence,
  estimateOrderFlow,
  provisionalImbalance,
  stateToVote,
} from '../orderFlowEstimator';
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

/** A series of candles that all close on their high (CLV = +1). */
function bullish(length = 20, volume = 100): Candle[] {
  return Array.from({ length }, (_, i) => candle(110, 110, 100, volume, i));
}

/** A series of candles that all close on their low (CLV = -1). */
function bearish(length = 20, volume = 100): Candle[] {
  return Array.from({ length }, (_, i) => candle(100, 110, 100, volume, i));
}

describe('closeLocationValue', () => {
  it('is +1 when the candle closes on its high', () => {
    expect(closeLocationValue(candle(110, 110, 100))).toBeCloseTo(1, 10);
  });

  it('is -1 when the candle closes on its low', () => {
    expect(closeLocationValue(candle(100, 110, 100))).toBeCloseTo(-1, 10);
  });

  it('is 0 for a zero-range candle (high == low), not a divide-by-zero', () => {
    const clv = closeLocationValue(candle(100, 100, 100));
    expect(clv).toBe(0);
    expect(Number.isNaN(clv)).toBe(false);
  });

  it('is 0 when the candle closes at the midpoint', () => {
    expect(closeLocationValue(candle(105, 110, 100))).toBeCloseTo(0, 10);
  });
});

describe('activity proxy', () => {
  it('uses volume when a candle carries a non-zero volume', () => {
    expect(detectActivityProxy(bullish(20, 100))).toBe('volume');
  });

  it('falls back to range when volume is empty/zero', () => {
    expect(detectActivityProxy(bullish(20, 0))).toBe('range');
  });

  it('prefers a live tick count when one is supplied', () => {
    expect(detectActivityProxy(bullish(20, 100), 42)).toBe('ticks');
  });

  it('weights by range when the proxy is range', () => {
    expect(candleWeight(candle(105, 110, 100, 0), 'range')).toBeCloseTo(10, 10);
    expect(candleWeight(candle(105, 110, 100, 0), 'volume')).toBe(0);
  });
});

describe('estimateOrderFlow', () => {
  it('reads strong buying pressure from a series closing on its highs', () => {
    const reading = estimateOrderFlow(bullish(20, 100), CFG);
    expect(reading.available).toBe(true);
    expect(reading.buyPressure).toBeCloseTo(100, 6);
    expect(reading.sellPressure).toBeCloseTo(0, 6);
    expect(reading.imbalance).toBeCloseTo(100, 6);
    expect(reading.smoothedImbalance).toBeCloseTo(100, 6);
    expect(reading.state).toBe('BUYING');
    expect(reading.cvd).toBeGreaterThan(0);
    expect(reading.cvdTrend).toBe('RISING');
    expect(reading.volumeBased).toBe(true);
    expect(reading.proxy).toBe('volume');
  });

  it('reads strong selling pressure from a series closing on its lows', () => {
    const reading = estimateOrderFlow(bearish(20, 100), CFG);
    expect(reading.buyPressure).toBeCloseTo(0, 6);
    expect(reading.sellPressure).toBeCloseTo(100, 6);
    expect(reading.imbalance).toBeCloseTo(-100, 6);
    expect(reading.smoothedImbalance).toBeCloseTo(-100, 6);
    expect(reading.state).toBe('SELLING');
    expect(reading.cvd).toBeLessThan(0);
    expect(reading.cvdTrend).toBe('FALLING');
  });

  it('keeps buy + sell = 100 and never returns a NaN', () => {
    for (const series of [bullish(20, 100), bearish(20, 100), bullish(20, 0)]) {
      const reading = estimateOrderFlow(series, CFG);
      expect(reading.buyPressure + reading.sellPressure).toBeCloseTo(100, 6);
      expect(Number.isFinite(reading.imbalance)).toBe(true);
      expect(Number.isFinite(reading.smoothedImbalance)).toBe(true);
    }
  });

  it('treats a doji series (high == low) as neutral, not a crash', () => {
    const dojis = Array.from({ length: 20 }, (_, i) => candle(100, 100, 100, 0, i));
    const reading = estimateOrderFlow(dojis, CFG);
    expect(reading.available).toBe(true);
    expect(reading.imbalance).toBe(0);
    expect(reading.buyPressure).toBe(50);
    expect(reading.sellPressure).toBe(50);
    expect(reading.state).toBe('NEUTRAL');
    expect(reading.proxy).toBe('range');
  });

  it('falls back to the range proxy when volume is missing', () => {
    const reading = estimateOrderFlow(bullish(20, 0), CFG);
    expect(reading.available).toBe(true);
    expect(reading.proxy).toBe('range');
    expect(reading.volumeBased).toBe(false);
    // The direction is still read from the close location, so it stays bullish.
    expect(reading.imbalance).toBeCloseTo(100, 6);
    expect(reading.state).toBe('BUYING');
  });

  it('returns no reading at all when the window is incomplete', () => {
    const reading = estimateOrderFlow(bullish(5, 100), CFG);
    expect(reading.available).toBe(false);
    expect(reading.needed).toBe(CFG.cvdWindow);
    expect(reading.candleCount).toBe(5);
    // No half-filled numbers: the pressures rest at the neutral 50/50.
    expect(reading.buyPressure).toBe(50);
    expect(reading.cvdSeries).toEqual([]);
  });

  it('flags absorption on a small-range, high-weight, near-mid candle', () => {
    const series: Candle[] = [];
    for (let i = 0; i < 19; i += 1) series.push(candle(110, 110, 100, 100, i));
    // A tiny-range candle that closes mid, on heavy volume: absorbed activity.
    series.push(candle(100.25, 100.5, 100, 500, 19));
    const reading = estimateOrderFlow(series, CFG);
    expect(reading.absorption).toBe(true);
  });

  it('does not flag absorption on a normal, full-range candle', () => {
    const reading = estimateOrderFlow(bullish(20, 100), CFG);
    expect(reading.absorption).toBe(false);
  });
});

describe('classifyState (neutral zone + hysteresis)', () => {
  it('stays Neutral inside the neutral zone', () => {
    expect(classifyState([10, 10, 10], CFG)).toBe('NEUTRAL');
    expect(classifyState([-10, -10], CFG)).toBe('NEUTRAL');
  });

  it('needs the threshold held for the hysteresis count, not a single candle', () => {
    // One candle past the zone is not enough.
    expect(classifyState([20, 0, 0], CFG)).toBe('NEUTRAL');
    // Two consecutive candles past the zone flips the state.
    expect(classifyState([20, 20, 0], CFG)).toBe('BUYING');
    expect(classifyState([-20, -20, 0], CFG)).toBe('SELLING');
  });

  it('holds the committed state through a dip back into the zone', () => {
    // Committed BUYING, then a neutral dip does not immediately flip to SELLING.
    expect(classifyState([20, 20, 0, -20, 0], CFG)).toBe('BUYING');
  });

  it('maps the state onto the shared Vote vocabulary', () => {
    expect(stateToVote('BUYING')).toBe('BUY');
    expect(stateToVote('SELLING')).toBe('SELL');
    expect(stateToVote('NEUTRAL')).toBe('NEUTRAL');
  });
});

describe('detectDivergence', () => {
  it('flags a bearish divergence: price makes a new high but CVD does not', () => {
    expect(detectDivergence([1, 2, 3, 2, 3.5], [0, 1, 2, 1, 1], 20)).toBe('BEARISH');
  });

  it('flags a bullish divergence: price makes a new low but CVD does not', () => {
    expect(detectDivergence([5, 4, 3, 4, 2.5], [0, -1, -2, -1, -1], 20)).toBe('BULLISH');
  });

  it('reports no divergence when price and CVD agree', () => {
    expect(detectDivergence([1, 2, 3, 4], [0, 1, 2, 3], 20)).toBeNull();
  });
});

describe('provisionalImbalance', () => {
  it('reads the forming candle alone and never touches the main window', () => {
    expect(provisionalImbalance(candle(110, 110, 100, 100), 'volume')).toBeCloseTo(100, 6);
    expect(provisionalImbalance(candle(100, 110, 100, 100), 'volume')).toBeCloseTo(-100, 6);
    // A zero-range forming candle is neutral.
    expect(provisionalImbalance(candle(100, 100, 100, 100), 'range')).toBe(0);
  });
});
