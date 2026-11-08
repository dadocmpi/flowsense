// ============================================
// PER-TIMEFRAME ENGINE TESTS
// ============================================
// The engine produces the three compasses, the structure read and the change for
// ONE timeframe's own series. These tests pin the invariants the redesigned
// screen depends on:
//
//   * the technical gauge covers both the moving averages and the oscillators
//   * order flow is carried through, never computed from candles
//   * with no order-flow source the summary IS the technical reading
//   * a series too short to read is reported unavailable, not filled with zeros

import { describe, expect, it } from 'vitest';
import { computeTimeframeReading } from '../timeframeEngine';
import { aggregateCandles, mergeLiveTail, normalizeSeries, resampleCandles, upsertLastCandle } from '../candles';
import { isBearishLabel, isBullishLabel, labelFromScore } from '../scoring';
import { DEFAULT_COMPASS_CONFIG, mergeCompassConfig } from '../../config/compass';
import type { Candle, OrderFlowReading } from '../types';

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

function ramp(length: number, start = 100, step = 0.5): Candle[] {
  return Array.from({ length }, (_, i) => candle(start + i * step, i));
}

/** One-minute candles from an explicit UTC start, for session-boundary tests. */
function oneMinuteSeries(startIso: string, length: number, start = 100, step = 1): Candle[] {
  const startMs = Date.parse(startIso);
  return Array.from({ length }, (_, i) => {
    const close = start + i * step;
    return {
      datetime: new Date(startMs + i * 60_000).toISOString(),
      open: close,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 100,
    };
  });
}

/** A stand-in order-flow reading, for the blending tests only. */
function orderFlow(score: number): OrderFlowReading {
  return {
    gauge: {
      score,
      label: labelFromScore(score, DEFAULT_COMPASS_CONFIG),
      tally: { buy: 1, neutral: 0, sell: 0 },
      details: [],
    },
    metrics: { delta: 120, cvd: 480, imbalance: 0.3, buyShare: 0.62, volume: 900 },
    detail: {
      venue: 'test venue',
      resetAt: Date.UTC(2024, 0, 1),
      state: 'BUYING',
      smoothedImbalance: score,
      cvdSeries: [],
      candleCount: 5,
      imbalanceLevels: 10,
    },
    source: 'test',
  };
}

describe('aggregateCandles', () => {
  it('buckets candles into larger intervals', () => {
    const fiveMin = Array.from({ length: 6 }, (_, i) => candle(100 + i, i));
    const aggregated = aggregateCandles(fiveMin, 15);
    expect(aggregated).toHaveLength(2);
    expect(aggregated[0].open).toBe(100);
    expect(aggregated[0].close).toBe(102);
    expect(aggregated[1].close).toBe(105);
  });

  it('sums volume across the bucket', () => {
    const fiveMin = Array.from({ length: 3 }, (_, i) => candle(100, i, 10));
    expect(aggregateCandles(fiveMin, 15)[0].volume).toBe(30);
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
    expect(resampleCandles(ramp(30), '30m', 5)).toHaveLength(5);
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
    // No fabricated order flow, and no reading at all from too few candles.
    expect(reading.orderFlow).toBeNull();
    expect(reading.technical.details).toEqual([]);
  });

  it('produces the technical gauge from both the moving averages and the oscillators', () => {
    const reading = computeTimeframeReading('15m', ramp(300), DEFAULT_COMPASS_CONFIG);
    expect(reading.available).toBe(true);

    const groups = new Set(reading.technical.details.map(detail => detail.group));
    expect(groups.has('MA')).toBe(true);
    expect(groups.has('OSCILLATOR')).toBe(true);
    // The technical gauge holds every vote from both blocks.
    expect(reading.technical.details.length).toBeGreaterThan(12);
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

  it('never fabricates order flow from candles: no source means a null reading', () => {
    const reading = computeTimeframeReading('15m', ramp(300), DEFAULT_COMPASS_CONFIG);
    // A candle carries no aggressor side and no book, so there is nothing real
    // to show. The reading is null and the card says so — it is not estimated.
    expect(reading.orderFlow).toBeNull();
    // With no source the summary IS the technical reading, not a blend against
    // a stand-in zero.
    expect(reading.summary.score).toBe(reading.technical.score);
    expect(reading.summary.details.length).toBe(reading.technical.details.length);
  });

  it('carries a supplied real order-flow reading and blends it into the summary', () => {
    const flow = orderFlow(-100);
    const reading = computeTimeframeReading('15m', ramp(300, 100, 1), DEFAULT_COMPASS_CONFIG, flow);
    expect(reading.orderFlow).toBe(flow);
    // The uptrend is bullish, order flow is strongly bearish, so the blended
    // summary must sit below the technical read and above the flow read.
    expect(reading.summary.score).toBeLessThan(reading.technical.score);
    expect(reading.summary.score).toBeGreaterThan(flow.gauge.score);
  });

  it('blends a real flow reading into the summary by the configured weights', () => {
    const flow = orderFlow(100);
    const reading = computeTimeframeReading('15m', ramp(300, 100, -1), DEFAULT_COMPASS_CONFIG, flow);
    // A downtrend plus strongly bullish flow: the summary sits between the two.
    expect(reading.summary.score).toBeGreaterThan(reading.technical.score);
    expect(reading.summary.score).toBeLessThan(flow.gauge.score);
  });

  it('keeps each timeframe reading from its own series', () => {
    const up = computeTimeframeReading('5m', ramp(300, 100, 1), DEFAULT_COMPASS_CONFIG);
    const down = computeTimeframeReading('1h', ramp(300, 400, -1), DEFAULT_COMPASS_CONFIG);
    // Different series, different timeframes, no bleed between them.
    expect(up.timeframe).toBe('5m');
    expect(down.timeframe).toBe('1h');
    expect(up.summary.score).toBeGreaterThan(0);
    expect(down.summary.score).toBeLessThan(0);
  });

  it('measures the change from the session open when the window covers it', () => {
    // 09:00-10:30 ET on 2024-01-02 (EST = UTC-5), so the 09:30 ET open is inside
    // the window and the change is a real session change.
    const series = oneMinuteSeries('2024-01-02T14:00:00Z', 91, 100, 1);
    const reading = computeTimeframeReading('1m', series, DEFAULT_COMPASS_CONFIG);
    expect(reading.changeBasis).toBe('SESSION');
    const sessionOpen = series[30].open; // 14:30Z = 09:30 ET
    expect(reading.change).toBeCloseTo(series[series.length - 1].close - sessionOpen, 6);
  });

  it('falls back to a window change when the session open is not covered', () => {
    // The window ends exactly at the 09:30 ET open, so only the final candle is
    // in-session. There is no session change to report, and saying there was one
    // would be wrong.
    const series = oneMinuteSeries('2024-01-02T14:00:00Z', 31, 100, 1);
    const reading = computeTimeframeReading('1m', series, DEFAULT_COMPASS_CONFIG);
    expect(reading.changeBasis).toBe('WINDOW');
    expect(reading.change).toBeCloseTo(series[series.length - 1].close - series[0].open, 6);
  });

  it('has no change figure when there is not enough data to measure one', () => {
    const reading = computeTimeframeReading('15m', [candle(100, 0)], DEFAULT_COMPASS_CONFIG);
    expect(reading.change).toBeNull();
    expect(reading.changePercent).toBeNull();
    expect(reading.changeBasis).toBeNull();
  });

  it('honours a custom minimum candle count', () => {
    const config = mergeCompassConfig(DEFAULT_COMPASS_CONFIG, { minCandles: 250 });
    expect(computeTimeframeReading('15m', ramp(100), config).available).toBe(false);
    expect(computeTimeframeReading('15m', ramp(300), config).available).toBe(true);
  });
});

describe('mergeLiveTail', () => {
  it('replaces the newest bar of a higher timeframe from the live base tail', () => {
    const native1h: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 190, high: 200, low: 189, close: 200, volume: 50 },
    ];
    const base: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 200, high: 210, low: 199, close: 205, volume: 10 },
      { datetime: '2024-01-01 12:05:00', open: 205, high: 216, low: 204, close: 215, volume: 20 },
    ];

    const merged = mergeLiveTail(native1h, base, 60);
    expect(merged).toHaveLength(1);
    expect(merged[0].close).toBe(215);
    expect(merged[0].high).toBe(216);
    expect(merged[0].volume).toBe(30);
  });

  it('refuses a partial rebuild when the base window starts inside the bucket', () => {
    const nativeDaily: Candle[] = [
      { datetime: '2024-01-01 00:00:00', open: 100, high: 130, low: 95, close: 120, volume: 9000 },
    ];
    const base: Candle[] = [
      { datetime: '2024-01-01 18:00:00', open: 118, high: 121, low: 117, close: 120, volume: 40 },
      { datetime: '2024-01-01 18:01:00', open: 120, high: 122, low: 119, close: 121, volume: 30 },
    ];

    expect(mergeLiveTail(nativeDaily, base, 1440)).toEqual(nativeDaily);
  });

  it('never invents a bar when the native series is empty', () => {
    const base: Candle[] = [
      { datetime: '2024-01-01 12:00:00', open: 200, high: 210, low: 199, close: 205, volume: 10 },
    ];
    expect(mergeLiveTail([], base, 60)).toEqual([]);
  });
});
