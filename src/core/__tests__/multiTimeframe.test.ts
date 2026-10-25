// ============================================
// MULTI-TIMEFRAME ENGINE + CONFLUENCE TESTS
// ============================================

import { describe, expect, it } from 'vitest';
import { computeMultiTimeframe } from '../multiTimeframe';
import { computeTimeframeReading } from '../timeframeEngine';
import { computeConfluence, isBearishLabel, isBullishLabel, labelFromScore } from '../scoring';
import { aggregateCandles, resampleCandles, normalizeSeries, upsertLastCandle } from '../candles';
import { DEFAULT_COMPASS_CONFIG, mergeCompassConfig } from '../../config/compass';
import { TIMEFRAMES } from '../types';
import type { Candle } from '../types';

function candle(close: number, index: number, volume = 100): Candle {
  return {
    datetime: new Date(Date.UTC(2024, 0, 1, 0, index * 5)).toISOString(),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  };
}

/** A 5-minute series long enough to fill the longest timeframe that can be
 *  aggregated from it (the weekly needs 30 weekly bars, which a 5m series
 *  cannot supply in a test, so only the reachable timeframes are asserted). */
function ramp(length: number, start = 100, step = 0.5): Candle[] {
  return Array.from({ length }, (_, i) => candle(start + i * step, i));
}

describe('aggregateCandles', () => {
  it('buckets candles into larger intervals', () => {
    const fiveMin = Array.from({ length: 6 }, (_, i) => candle(100 + i, i));
    // 6 x 5m = 30m, so 15m bucketing yields 2 candles.
    const aggregated = aggregateCandles(fiveMin, 15);
    expect(aggregated).toHaveLength(2);
    expect(aggregated[0].open).toBe(100);
    expect(aggregated[0].close).toBe(102);
    expect(aggregated[1].close).toBe(105);
  });

  it('sums volume across the bucket', () => {
    const fiveMin = Array.from({ length: 3 }, (_, i) => candle(100, i, 10));
    const aggregated = aggregateCandles(fiveMin, 15);
    expect(aggregated[0].volume).toBe(30);
  });

  it('keeps the taker-buy split when the source candles have it', () => {
    const fiveMin = [
      { ...candle(100, 0, 10), takerBuyVolume: 6 },
      { ...candle(101, 1, 10), takerBuyVolume: 4 },
      { ...candle(102, 2, 10), takerBuyVolume: 5 },
    ];
    const aggregated = aggregateCandles(fiveMin, 15);
    expect(aggregated[0].takerBuyVolume).toBe(15);
  });

  it('never invents a taker-buy split that was not provided', () => {
    const fiveMin = [candle(100, 0, 10), candle(101, 1, 10)];
    const aggregated = aggregateCandles(fiveMin, 15);
    expect(aggregated[0].takerBuyVolume).toBeUndefined();
  });

  it('returns nothing for an empty series or a zero bucket', () => {
    expect(aggregateCandles([], 15)).toEqual([]);
    expect(aggregateCandles([candle(100, 0)], 0)).toEqual([]);
  });
});

describe('resampleCandles', () => {
  it('never synthesises a finer series than the base', () => {
    const fiveMin = ramp(10);
    expect(resampleCandles(fiveMin, '5m', 5)).toBe(fiveMin);
    expect(resampleCandles(fiveMin, '15m', 15)).toBe(fiveMin);
  });

  it('aggregates when the target is coarser', () => {
    const fiveMin = ramp(30);
    expect(resampleCandles(fiveMin, '30m', 5)).toHaveLength(5);
  });
});

describe('normalizeSeries / upsertLastCandle', () => {
  it('sorts and dedupes by open time', () => {
    const a = candle(100, 0);
    const b = candle(101, 1);
    expect(normalizeSeries([b, a, b]).map(c => c.close)).toEqual([100, 101]);
  });

  it('replaces the open candle and appends a new one', () => {
    const series = [candle(100, 0), candle(101, 1)];
    const updated = upsertLastCandle(series, candle(105, 1));
    expect(updated).toHaveLength(2);
    expect(updated[1].close).toBe(105);

    const extended = upsertLastCandle(updated, candle(106, 2));
    expect(extended).toHaveLength(3);
    expect(extended[2].close).toBe(106);
  });

  it('ignores a candle older than the series tail', () => {
    const series = [candle(100, 0), candle(101, 1)];
    expect(upsertLastCandle(series, candle(99, 0))).toBe(series);
  });
});

describe('computeTimeframeReading', () => {
  it('marks a timeframe unavailable below the minimum candle count', () => {
    const reading = computeTimeframeReading('15m', ramp(5), DEFAULT_COMPASS_CONFIG);
    expect(reading.available).toBe(false);
    expect(reading.summary.score).toBe(0);
    expect(reading.summary.label).toBe('NEUTRAL');
  });

  it('produces all three gauges when there is enough data', () => {
    const reading = computeTimeframeReading('15m', ramp(300), DEFAULT_COMPASS_CONFIG);
    expect(reading.available).toBe(true);
    expect(reading.movingAverages.details.length).toBeGreaterThan(0);
    expect(reading.indicators.details.length).toBeGreaterThan(0);
    expect(reading.summary.details.length).toBe(
      reading.movingAverages.details.length + reading.indicators.details.length
    );
  });

  it('reads bullish on a sustained uptrend and bearish on a downtrend', () => {
    const up = computeTimeframeReading('15m', ramp(300, 100, 1), DEFAULT_COMPASS_CONFIG);
    const down = computeTimeframeReading('15m', ramp(300, 400, -1), DEFAULT_COMPASS_CONFIG);
    expect(up.summary.score).toBeGreaterThan(0);
    expect(isBearishLabel(up.summary.label)).toBe(false);
    expect(down.summary.score).toBeLessThan(0);
    expect(isBullishLabel(down.summary.label)).toBe(false);
  });

  it('keeps the summary label consistent with the summary score', () => {
    for (const step of [-1, -0.5, 0, 0.5, 1]) {
      const reading = computeTimeframeReading('1h', ramp(300, 200, step), DEFAULT_COMPASS_CONFIG);
      expect(reading.summary.label).toBe(labelFromScore(reading.summary.score, DEFAULT_COMPASS_CONFIG));
    }
  });
});

describe('computeMultiTimeframe', () => {
  it('returns one reading per requested timeframe', () => {
    const result = computeMultiTimeframe(ramp(2000), 5, DEFAULT_COMPASS_CONFIG);
    expect(result.timeframes.map(t => t.timeframe)).toEqual(TIMEFRAMES);
  });

  it('reports the price from the base series', () => {
    const candles = ramp(2000, 100, 0.5);
    const result = computeMultiTimeframe(candles, 5, DEFAULT_COMPASS_CONFIG);
    expect(result.price).toBe(candles[candles.length - 1].close);
  });

  it('marks short timeframes available and the weekly unavailable on a short base', () => {
    const result = computeMultiTimeframe(ramp(500), 5, DEFAULT_COMPASS_CONFIG);
    const byTf = new Map(result.timeframes.map(t => [t.timeframe, t]));
    expect(byTf.get('5m')!.available).toBe(true);
    expect(byTf.get('1h')!.available).toBe(true);
    // 500 x 5m is under two days, so the weekly cannot have 30 bars.
    expect(byTf.get('1W')!.available).toBe(false);
  });

  it('produces a positive confluence bias on a sustained uptrend', () => {
    const result = computeMultiTimeframe(ramp(3000, 100, 0.5), 5, DEFAULT_COMPASS_CONFIG);
    expect(result.confluence.bias).toBeGreaterThan(0);
    expect(result.confluence.direction).toBe('BULLISH');
    expect(result.confluence.available).toBeGreaterThan(0);
  });

  it('produces a negative confluence bias on a sustained downtrend', () => {
    const result = computeMultiTimeframe(ramp(3000, 2000, -0.5), 5, DEFAULT_COMPASS_CONFIG);
    expect(result.confluence.bias).toBeLessThan(0);
    expect(result.confluence.direction).toBe('BEARISH');
  });

  it('keeps the confluence label consistent with the confluence bias', () => {
    for (const step of [-1, -0.25, 0, 0.25, 1]) {
      const result = computeMultiTimeframe(ramp(3000, 1000, step), 5, DEFAULT_COMPASS_CONFIG);
      if (result.confluence.bias > 0) expect(isBearishLabel(result.confluence.label)).toBe(false);
      if (result.confluence.bias < 0) expect(isBullishLabel(result.confluence.label)).toBe(false);
    }
  });

  it('honours a custom timeframe weight table', () => {
    const heavy5m = mergeCompassConfig(DEFAULT_COMPASS_CONFIG, {
      timeframeWeights: { '5m': 100, '15m': 0, '30m': 0, '1h': 0, '4h': 0, '1D': 0, '1W': 0 },
    });
    const readings = [
      { timeframe: '5m', score: 90, available: true },
      { timeframe: '1D', score: -90, available: true },
    ];
    expect(computeConfluence(readings, heavy5m).bias).toBe(90);
    expect(computeConfluence(readings, DEFAULT_COMPASS_CONFIG).bias).toBeLessThan(0);
  });
});

describe('confluence agreement', () => {
  it('counts how many timeframes back the bias', () => {
    const result = computeConfluence(
      [
        { timeframe: '15m', score: 80, available: true },
        { timeframe: '1h', score: 70, available: true },
        { timeframe: '4h', score: -60, available: true },
      ],
      DEFAULT_COMPASS_CONFIG
    );
    expect(result.directional).toBe(3);
    expect(result.agreement).toBeGreaterThan(50);
    expect(result.direction).toBe('BULLISH');
  });

  it('reports zero agreement when nothing is directional', () => {
    const result = computeConfluence([{ timeframe: '1h', score: 0, available: true }], DEFAULT_COMPASS_CONFIG);
    expect(result.agreement).toBe(0);
    expect(result.direction).toBeNull();
  });
});
