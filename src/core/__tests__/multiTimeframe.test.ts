// ============================================
// MULTI-TIMEFRAME ENGINE + CONFLUENCE TESTS
// ============================================

import { describe, expect, it } from 'vitest';
import { computeMultiTimeframe, computeMultiTimeframeFromSeries } from '../multiTimeframe';
import { computeTimeframeReading } from '../timeframeEngine';
import { computeConfluence, isBearishLabel, isBullishLabel, labelFromScore } from '../scoring';
import { aggregateCandles, mergeLiveTail, resampleCandles, normalizeSeries, upsertLastCandle } from '../candles';
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
      timeframeWeights: { '1m': 0, '5m': 100, '15m': 0, '30m': 0, '1h': 0, '4h': 0, '1D': 0, '1W': 0 },
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

describe('computeMultiTimeframeFromSeries', () => {
  it('uses each timeframe\u2019s own series rather than aggregating one base series', () => {
    const result = computeMultiTimeframeFromSeries({
      '5m': ramp(400),
      '15m': ramp(400),
      '1h': ramp(400),
      '1D': ramp(400),
    });
    const daily = result.timeframes.find(t => t.timeframe === '1D');
    // The daily is filled from its own native series even though no 5m series
    // could have reached back far enough to build it.
    expect(daily?.available).toBe(true);
    expect(daily?.candleCount).toBe(400);
  });

  it('reports a timeframe with no series as unavailable instead of back-filling it', () => {
    const result = computeMultiTimeframeFromSeries({ '5m': ramp(400) });
    const weekly = result.timeframes.find(t => t.timeframe === '1W');
    expect(weekly?.available).toBe(false);
    expect(weekly?.candleCount).toBe(0);
  });

  it('covers every timeframe exactly once', () => {
    const result = computeMultiTimeframeFromSeries({ '5m': ramp(400) });
    expect(result.timeframes.map(t => t.timeframe)).toEqual(TIMEFRAMES);
  });

  it('takes the price from the finest available series', () => {
    const result = computeMultiTimeframeFromSeries({ '1h': ramp(50, 500, 1) });
    expect(result.price).toBe(549);
  });

  it('falls back to the supplied price when no series is present', () => {
    expect(computeMultiTimeframeFromSeries({}, DEFAULT_COMPASS_CONFIG, undefined, 1234).price).toBe(1234);
  });
});

describe('mergeLiveTail', () => {
  it('replaces the newest bar of a higher timeframe from the live base tail', () => {
    // A 1h bar as the provider last reported it: close 200.
    const native1h: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 190, high: 200, low: 189, close: 200, volume: 50 },
    ];
    // Live 5m bars inside the same 12:00-13:00 bucket, closing at 215.
    const base: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 200, high: 210, low: 199, close: 205, volume: 10 },
      { datetime: '2024-01-01 12:05:00', open: 205, high: 216, low: 204, close: 215, volume: 20 },
    ];

    const merged = mergeLiveTail(native1h, base, 60);
    expect(merged).toHaveLength(1);
    expect(merged[0].datetime).toBe('2024-01-01 12:00:00');
    expect(merged[0].close).toBe(215);
    expect(merged[0].high).toBe(216);
    expect(merged[0].volume).toBe(30);
  });

  it('appends a bucket the native series has not seen yet', () => {
    const native1h: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 190, high: 200, low: 189, close: 200, volume: 50 },
    ];
    const base: Candle[] = [
      { datetime: '2024-01-01 13:00:00', open: 200, high: 205, low: 198, close: 204, volume: 5 },
    ];

    const merged = mergeLiveTail(native1h, base, 60);
    expect(merged).toHaveLength(2);
    expect(merged[1].datetime).toBe('2024-01-01 13:00:00');
    expect(merged[1].close).toBe(204);
  });

  it('leaves the series untouched when the base tail is empty', () => {
    const native1h: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 190, high: 200, low: 189, close: 200, volume: 50 },
    ];
    expect(mergeLiveTail(native1h, [], 60)).toBe(native1h);
  });

  it('never invents a bar when the native series is empty', () => {
    const base: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 200, high: 210, low: 199, close: 205, volume: 10 },
    ];
    expect(mergeLiveTail([], base, 60)).toEqual([]);
  });

  it('does not merge bars from a different bucket', () => {
    const native1h: Candle[] = [
      { datetime: '2024-01-01 11:00:00', open: 190, high: 200, low: 189, close: 200, volume: 50 },
    ];
    // The base tail sits in the 12:00 bucket, which the native series has not
    // reported yet; the new bucket is appended, and the 11:00 bar is untouched.
    const base: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 200, high: 210, low: 199, close: 205, volume: 10 },
    ];
    const merged = mergeLiveTail(native1h, base, 60);
    expect(merged[0].close).toBe(200);
    expect(merged[1].close).toBe(205);
  });

  it('refuses a partial rebuild when the base window starts inside the bucket', () => {
    // A 1m base covers a few hours, so the current daily bucket is usually only
    // partly observed. Rebuilding it would report a high, low and volume for a
    // day that has barely started, so the native bar must be left alone.
    const nativeDaily: Candle[] = [
      { datetime: '2024-01-01 00:00:00', open: 100, high: 130, low: 95, close: 120, volume: 9000 },
    ];
    // The base window begins at 18:00, well after the 00:00 daily open.
    const base: Candle[] = [
      { datetime: '2024-01-01 18:00:00', open: 118, high: 121, low: 117, close: 120, volume: 40 },
      { datetime: '2024-01-01 18:01:00', open: 120, high: 122, low: 119, close: 121, volume: 30 },
    ];

    const merged = mergeLiveTail(nativeDaily, base, 1440);
    // Untouched: still the native bar, not a 70-volume partial day.
    expect(merged).toEqual(nativeDaily);
  });

  it('merges once the base window reaches the bucket open', () => {
    const nativeDaily: Candle[] = [
      { datetime: '2024-01-01 00:00:00', open: 100, high: 130, low: 95, close: 120, volume: 9000 },
    ];
    // The base window now starts at the daily open, so a rebuild is complete.
    const base: Candle[] = [
      { datetime: '2024-01-01 00:00:00', open: 100, high: 130, low: 95, close: 120, volume: 9000 },
      { datetime: '2024-01-01 00:01:00', open: 120, high: 124, low: 119, close: 123, volume: 25 },
    ];

    const merged = mergeLiveTail(nativeDaily, base, 1440);
    expect(merged[0].close).toBe(123);
    expect(merged[0].high).toBe(130);
    expect(merged[0].volume).toBe(9025);
  });
});
