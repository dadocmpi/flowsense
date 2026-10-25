// ============================================
// INDICATOR MATH TESTS
// ============================================
// Reference values are hand-computed or taken from the classic published
// datasets (Wilder's RSI/ATR/DMI tables, the standard MACD/Bollinger worked
// examples). Every expectation below is reproducible from the inputs alone.

import { describe, expect, it } from 'vitest';
import {
  adx,
  atr,
  bullBearPower,
  cci,
  ema,
  emaSeries,
  highest,
  highsLows,
  lowest,
  macd,
  percentChange,
  pointOfControl,
  roc,
  rsi,
  rsiSeries,
  sma,
  stochastic,
  stochasticRsi,
  ultimateOscillator,
  volumeProfile,
  vwap,
  williamsR,
} from '../indicators';
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

function series(values: number[]): Candle[] {
  return values.map((v, i) => candle(v, i));
}

/** The published Wilder RSI dataset (14-period), 33 closes. */
const WILDER_CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
  46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
  43.42, 42.66, 43.13,
];

/** The published Wilder true-range dataset (30 bars) used for ATR / DMI. */
const HIGHS = [
  48.7, 48.72, 48.9, 48.87, 48.82, 49.05, 49.2, 49.35, 49.92, 50.19, 50.12, 49.66, 49.88, 50.19, 50.36, 50.57,
  50.65, 50.43, 49.63, 50.33, 50.29, 50.17, 49.32, 48.5, 48.32, 46.8, 47.8, 48.39, 48.66, 48.58,
];
const LOWS = [
  47.79, 48.14, 48.39, 48.37, 48.24, 48.64, 48.94, 48.86, 49.5, 49.87, 49.2, 48.9, 49.43, 49.73, 49.26, 50.09,
  50.3, 49.21, 48.98, 49.61, 49.2, 49.43, 48.08, 47.64, 41.55, 44.1, 44.18, 45.29, 45.83, 45.9,
];
const CLOSES = [
  48.16, 48.61, 48.75, 48.63, 48.74, 49.03, 49.07, 49.32, 49.91, 50.13, 49.53, 49.5, 49.75, 50.03, 50.31, 50.52,
  50.41, 49.34, 49.37, 50.23, 49.24, 49.93, 48.43, 48.18, 46.57, 45.41, 47.77, 47.72, 48.62, 47.85,
];

const WILDER_CANDLES: Candle[] = CLOSES.map((close, i) => ({
  datetime: new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(),
  open: i === 0 ? close : CLOSES[i - 1],
  high: HIGHS[i],
  low: LOWS[i],
  close,
  volume: 1000 + i,
}));

describe('sma / ema', () => {
  it('computes a simple moving average over the last N values', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
    expect(sma([1, 2, 3], 5)).toBeNull();
    expect(sma([1, 2, 3], 0)).toBeNull();
  });

  it('seeds the EMA with the SMA of the first period and then smooths', () => {
    // seed = sma(1,2,3) = 2; then 2 + (4-2)*0.5 = 3; then 3 + (5-3)*0.5 = 4
    expect(emaSeries([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
    expect(ema([1, 2, 3, 4, 5], 3)).toBe(4);
  });

  it('returns null/empty when there is not enough data', () => {
    expect(ema([1, 2], 3)).toBeNull();
    expect(emaSeries([1, 2], 3)).toEqual([]);
  });
});

describe('rsi', () => {
  it('matches the hand-computed Wilder value at the first bar', () => {
    // First 14 deltas: gains sum 3.34, losses sum 1.40.
    // avgGain = 3.34/14, avgLoss = 1.40/14, RS = 2.38571 -> RSI = 70.4641.
    const out = rsiSeries(WILDER_CLOSES, 14);
    expect(out).toHaveLength(WILDER_CLOSES.length - 14);
    expect(out[0]).toBeCloseTo(70.4641, 3);
  });

  it('matches the published Wilder series at the last bar', () => {
    const out = rsiSeries(WILDER_CLOSES, 14);
    expect(out[out.length - 1]).toBeCloseTo(37.79, 1);
  });

  it('returns 100 when there are no losses and 50 when the series is flat', () => {
    expect(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14)).toBe(100);
    expect(rsi(new Array(20).fill(50), 14)).toBe(50);
  });

  it('needs period + 1 values', () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });
});

describe('atr', () => {
  it('matches the mean of the first 14 hand-computed true ranges', () => {
    // True range i = max(high-low, |high-prevClose|, |low-prevClose|).
    const trueRanges: number[] = [];
    for (let i = 1; i < WILDER_CANDLES.length; i++) {
      const c = WILDER_CANDLES[i];
      const prevClose = WILDER_CANDLES[i - 1].close;
      trueRanges.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
    }
    const firstAtr = trueRanges.slice(0, 14).reduce((a, b) => a + b, 0) / 14;

    // First ATR value is the plain average of the first 14 true ranges.
    expect(atr(WILDER_CANDLES.slice(0, 15), 14)).toBeCloseTo(firstAtr, 10);
    expect(atr(WILDER_CANDLES.slice(0, 15), 14)).toBeCloseTo(0.5679, 4);
    // Then it is Wilder-smoothed, which lags the raw average.
    expect(atr(WILDER_CANDLES, 14)).toBeGreaterThan(firstAtr);
  });

  it('needs period + 1 candles', () => {
    expect(atr(series([1, 2, 3]), 14)).toBeNull();
  });
});

describe('macd', () => {
  it('is zero on a perfectly linear ramp (fast and slow EMAs converge)', () => {
    const ramp = Array.from({ length: 60 }, (_, i) => 100 + i);
    const result = macd(ramp, 12, 26, 9);
    expect(result).not.toBeNull();
    expect(result!.histogram).toBeCloseTo(0, 6);
  });

  it('turns bullish on an accelerating series', () => {
    const accel = Array.from({ length: 60 }, (_, i) => 100 + i * i * 0.1);
    const result = macd(accel, 12, 26, 9);
    expect(result!.macd).toBeGreaterThan(0);
    expect(result!.histogram).toBeGreaterThan(0);
  });

  it('turns bearish on a decelerating series', () => {
    const decel = Array.from({ length: 60 }, (_, i) => 500 - i * i * 0.1);
    const result = macd(decel, 12, 26, 9);
    expect(result!.histogram).toBeLessThan(0);
  });

  it('needs slow + signal values', () => {
    expect(macd(Array.from({ length: 30 }, (_, i) => i), 12, 26, 9)).toBeNull();
  });
});

describe('stochastic', () => {
  it('is 100 when the close is at the top of the range', () => {
    // high == close and low == close - 1, so the close is the window high.
    const rising = Array.from({ length: 20 }, (_, i) => candle(i + 1, i, i + 1, i));
    const result = stochastic(rising, 9, 6);
    expect(result!.k).toBeCloseTo(100, 6);
    expect(result!.d).toBeCloseTo(100, 6);
  });

  it('is 0 when the close is at the bottom of the range', () => {
    // high == close + 1 and low == close, so the close is the window low.
    const falling = Array.from({ length: 20 }, (_, i) => candle(20 - i, i, 21 - i, 20 - i));
    const result = stochastic(falling, 9, 6);
    expect(result!.k).toBeCloseTo(0, 6);
  });

  it('sits below 100 when the close stops short of the window high', () => {
    // Bars span [i, i+1] and close at i+0.5. Over the last 9 bars the window
    // is 11..20 and the close is 19.5, so %K = 8.5/9 = 94.444%.
    const rising = Array.from({ length: 20 }, (_, i) => candle(i + 0.5, i, i + 1, i));
    expect(stochastic(rising, 9, 6)!.k).toBeCloseTo(94.4444, 3);
  });

  it('is 50 on a flat series', () => {
    const flat = Array.from({ length: 20 }, (_, i) => candle(100, i));
    expect(stochastic(flat, 9, 6)!.k).toBe(50);
  });
});

describe('stochastic rsi', () => {
  it('produces a value inside 0..100', () => {
    const result = stochasticRsi(WILDER_CLOSES, 14, 3);
    expect(result).not.toBeNull();
    expect(result!.k).toBeGreaterThanOrEqual(0);
    expect(result!.k).toBeLessThanOrEqual(100);
  });

  it('returns null without enough data', () => {
    expect(stochasticRsi([1, 2, 3, 4, 5], 14, 3)).toBeNull();
  });
});

describe('adx / dmi', () => {
  it('reports a strong trend with +DI above -DI on a clean uptrend', () => {
    const up = Array.from({ length: 60 }, (_, i) => candle(100 + i, i, 101 + i, 99.5 + i));
    const result = adx(up, 14);
    expect(result).not.toBeNull();
    expect(result!.plusDi).toBeGreaterThan(result!.minusDi);
    expect(result!.adx).toBeGreaterThan(25);
  });

  it('reports -DI above +DI on a clean downtrend', () => {
    const down = Array.from({ length: 60 }, (_, i) => candle(200 - i, i, 200.5 - i, 199 - i));
    const result = adx(down, 14);
    expect(result!.minusDi).toBeGreaterThan(result!.plusDi);
    expect(result!.adx).toBeGreaterThan(25);
  });

  it('is weak on a flat series', () => {
    const flat = Array.from({ length: 60 }, (_, i) => candle(100, i, 100.2, 99.8));
    const result = adx(flat, 14);
    expect(result!.adx).toBeLessThan(20);
  });
});

describe('williams %R', () => {
  it('is 0 at the top of the range and -100 at the bottom', () => {
    const top = Array.from({ length: 20 }, (_, i) => candle(i + 1, i, i + 1, i));
    expect(williamsR(top, 14)).toBeCloseTo(0, 6);

    // A falling series whose close is always the bar low, so the newest close
    // is the window low and %R pins to -100.
    const bottom = Array.from({ length: 20 }, (_, i) => candle(20 - i, i, 21 - i, 20 - i));
    expect(williamsR(bottom, 14)).toBeCloseTo(-100, 6);
  });

  it('is -50 on a flat series', () => {
    const flat = Array.from({ length: 20 }, (_, i) => candle(100, i));
    expect(williamsR(flat, 14)).toBe(-50);
  });
});

describe('cci', () => {
  it('is 0 when every typical price equals the mean (zero deviation)', () => {
    const flat = Array.from({ length: 20 }, (_, i) => candle(100, i));
    expect(cci(flat, 14)).toBe(0);
  });

  it('is strongly positive at the top of a rising channel', () => {
    const up = Array.from({ length: 30 }, (_, i) => candle(100 + i, i, 100.5 + i, 99.5 + i));
    expect(cci(up, 14)).toBeGreaterThan(100);
  });
});

describe('highs / lows', () => {
  it('finds the rolling extremes', () => {
    const candles = series([5, 3, 9, 1, 7]);
    expect(highest(candles, 3)).toBe(9);
    expect(lowest(candles, 3)).toBe(1);
    expect(highest(candles, 10)).toBeNull();
  });

  it('reports range expansion and contraction', () => {
    const expanding = [
      candle(10, 0, 10, 10),
      candle(11, 1, 11, 10),
      candle(12, 2, 12, 9),
      candle(13, 3, 14, 8),
    ];
    const result = highsLows(expanding, 2);
    expect(result).not.toBeNull();
    expect(result!.value).toBeGreaterThanOrEqual(0);
  });
});

describe('ultimate oscillator', () => {
  it('is high when closes repeatedly finish near the high of the bar', () => {
    const up = Array.from({ length: 40 }, (_, i) => candle(100 + i, i, 100 + i, 99 + i));
    const result = ultimateOscillator(up);
    expect(result).not.toBeNull();
    expect(result!.value).toBeGreaterThan(70);
  });

  it('is low when closes repeatedly finish near the low of the bar', () => {
    const down = Array.from({ length: 40 }, (_, i) => candle(200 - i, i, 201 - i, 200 - i));
    const result = ultimateOscillator(down);
    expect(result!.value).toBeLessThan(30);
  });

  it('needs 30 candles', () => {
    expect(ultimateOscillator(series([1, 2, 3]))).toBeNull();
  });
});

describe('roc', () => {
  it('measures percentage change over the lookback', () => {
    // 10 -> 20 over 5 bars = +100%
    expect(roc([10, 11, 12, 13, 14, 20], 5)).toBeCloseTo(100, 6);
    expect(roc([20, 19, 18, 17, 16, 10], 5)).toBeCloseTo(-50, 6);
    expect(roc([10, 11], 5)).toBeNull();
  });
});

describe('bull / bear power', () => {
  it('is positive for both lines above the EMA in an uptrend', () => {
    const up = Array.from({ length: 40 }, (_, i) => candle(100 + i, i, 101 + i, 99.5 + i));
    const result = bullBearPower(up, 13);
    expect(result!.bull).toBeGreaterThan(0);
    expect(result!.bear).toBeGreaterThan(0);
  });

  it('is negative for both lines below the EMA in a downtrend', () => {
    const down = Array.from({ length: 40 }, (_, i) => candle(200 - i, i, 200.5 - i, 199 - i));
    const result = bullBearPower(down, 13);
    expect(result!.bull).toBeLessThan(0);
    expect(result!.bear).toBeLessThan(0);
  });
});

describe('vwap', () => {
  it('weights by volume', () => {
    // typical prices 10 and 20, volumes 1 and 3 -> (10 + 60) / 4 = 17.5
    const candles = [candle(10, 0, 10, 10, 1), candle(20, 1, 20, 20, 3)];
    expect(vwap(candles)).toBeCloseTo(17.5, 10);
  });

  it('is null without volume', () => {
    expect(vwap([candle(10, 0, 10, 10, 0)])).toBeNull();
  });
});

describe('volume profile / point of control', () => {
  it('places the point of control at the heaviest-traded price', () => {
    const candles = [
      candle(100, 0, 100, 100, 10),
      candle(110, 1, 110, 110, 900),
      candle(120, 2, 120, 120, 10),
    ];
    const profile = volumeProfile(candles, 30);
    const poc = pointOfControl(profile);
    expect(poc).not.toBeNull();
    // The POC must be nearest the 110 level, not the light 100/120 bars.
    expect(Math.abs(poc!.price - 110)).toBeLessThan(1.5);
  });

  it('returns an empty profile when the range is zero', () => {
    expect(volumeProfile([candle(100, 0, 100, 100, 10)], 10)).toEqual([]);
    expect(pointOfControl([])).toBeNull();
  });
});

describe('percentChange', () => {
  it('is a signed percentage and 0 on a zero reference', () => {
    expect(percentChange(110, 100)).toBeCloseTo(10, 10);
    expect(percentChange(90, 100)).toBeCloseTo(-10, 10);
    expect(percentChange(10, 0)).toBe(0);
  });
});
