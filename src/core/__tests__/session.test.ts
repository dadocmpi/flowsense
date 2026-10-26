// ============================================
// SESSION + VWAP RESET TESTS
// ============================================
// The point of these tests is that futures metrics must reset at the session
// open. A VWAP that quietly averages yesterday's session is worse than no
// VWAP at all, because it looks like a real level.

import { describe, expect, it } from 'vitest';
import {
  candlesInCurrentSession,
  sessionStartMs,
  zonedParts,
  zonedTimeToUtc,
} from '../session';
import { computeTechnicalMetrics } from '../metrics';
import { DEFAULT_COMPASS_CONFIG, mergeCompassConfig } from '../../config/compass';
import type { Candle } from '../types';

const RTH = DEFAULT_COMPASS_CONFIG.session;
const FULL = mergeCompassConfig(DEFAULT_COMPASS_CONFIG, {
  session: { ...DEFAULT_COMPASS_CONFIG.session, mode: 'FULL' },
}).session;

/** Build a 5-minute candle at a given ET wall-clock time on 2024-06-10. */
function etCandle(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  price: number,
  volume = 100
): Candle {
  const ms = zonedTimeToUtc('America/New_York', year, month, day, hour, minute);
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    datetime: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume,
  };
}

describe('zonedParts / zonedTimeToUtc', () => {
  it('round-trips a wall-clock time through the timezone', () => {
    const ms = zonedTimeToUtc('America/New_York', 2024, 6, 10, 9, 30);
    const parts = zonedParts(ms, 'America/New_York');
    expect(parts).toEqual({ year: 2024, month: 6, day: 10, hour: 9, minute: 30 });
  });

  it('handles daylight saving: 09:30 ET is 13:30 UTC in June, 14:30 UTC in January', () => {
    expect(zonedTimeToUtc('America/New_York', 2024, 6, 10, 9, 30)).toBe(Date.UTC(2024, 5, 10, 13, 30));
    expect(zonedTimeToUtc('America/New_York', 2024, 1, 10, 9, 30)).toBe(Date.UTC(2024, 0, 10, 14, 30));
  });
});

describe('sessionStartMs — RTH', () => {
  it('is the same day 09:30 ET for a mid-session candle', () => {
    const at11 = zonedTimeToUtc('America/New_York', 2024, 6, 10, 11, 0);
    expect(sessionStartMs(at11, RTH)).toBe(zonedTimeToUtc('America/New_York', 2024, 6, 10, 9, 30));
  });

  it('is the previous day 09:30 ET for a pre-open candle', () => {
    const at8 = zonedTimeToUtc('America/New_York', 2024, 6, 10, 8, 0);
    expect(sessionStartMs(at8, RTH)).toBe(zonedTimeToUtc('America/New_York', 2024, 6, 9, 9, 30));
  });

  it('is the same day 09:30 ET exactly at the open', () => {
    const atOpen = zonedTimeToUtc('America/New_York', 2024, 6, 10, 9, 30);
    expect(sessionStartMs(atOpen, RTH)).toBe(atOpen);
  });
});

describe('sessionStartMs — FULL', () => {
  it('puts an evening candle in the session that started at 18:00 the same day', () => {
    const at19 = zonedTimeToUtc('America/New_York', 2024, 6, 10, 19, 0);
    expect(sessionStartMs(at19, FULL)).toBe(zonedTimeToUtc('America/New_York', 2024, 6, 10, 18, 0));
  });

  it('puts a 02:00 candle in the session that started at 18:00 the day before', () => {
    const at2 = zonedTimeToUtc('America/New_York', 2024, 6, 11, 2, 0);
    expect(sessionStartMs(at2, FULL)).toBe(zonedTimeToUtc('America/New_York', 2024, 6, 10, 18, 0));
  });

  it('rolls over exactly at 18:00', () => {
    const before = zonedTimeToUtc('America/New_York', 2024, 6, 10, 17, 55);
    const after = zonedTimeToUtc('America/New_York', 2024, 6, 10, 18, 0);
    // 17:55 belongs to the session that opened the previous day at 18:00.
    expect(sessionStartMs(before, FULL)).toBe(zonedTimeToUtc('America/New_York', 2024, 6, 9, 18, 0));
    expect(sessionStartMs(after, FULL)).toBe(zonedTimeToUtc('America/New_York', 2024, 6, 10, 18, 0));
  });
});

describe('candlesInCurrentSession', () => {
  const candles = [
    etCandle(2024, 6, 10, 15, 55, 100), // previous RTH session
    etCandle(2024, 6, 10, 16, 0, 101),
    etCandle(2024, 6, 11, 9, 30, 200), // today's open
    etCandle(2024, 6, 11, 9, 35, 201),
    etCandle(2024, 6, 11, 9, 40, 202),
  ];

  it('keeps only the current RTH session', () => {
    const inSession = candlesInCurrentSession(candles, RTH);
    expect(inSession).toHaveLength(3);
    expect(inSession[0].close).toBe(200);
  });

  it('is empty for an empty series', () => {
    expect(candlesInCurrentSession([], RTH)).toEqual([]);
  });
});

describe('computeTechnicalMetrics — VWAP and POC reset at the session open', () => {
  it('measures VWAP over the current session only', () => {
    const candles = [
      // Yesterday: heavy volume at a wildly different price.
      etCandle(2024, 6, 10, 10, 0, 1000, 10_000),
      etCandle(2024, 6, 10, 15, 0, 1000, 10_000),
      // Today: price around 200.
      etCandle(2024, 6, 11, 9, 30, 200, 100),
      etCandle(2024, 6, 11, 9, 35, 200, 100),
      etCandle(2024, 6, 11, 9, 40, 200, 100),
    ];

    const metrics = computeTechnicalMetrics(candles, RTH);
    // If yesterday leaked in, the VWAP would be dragged toward 1000.
    expect(metrics.vwap).toBeCloseTo(200, 0);
    expect(metrics.sessionCandles).toBe(3);
  });

  it('reports the session high/low over the current session only', () => {
    const candles = [
      etCandle(2024, 6, 10, 10, 0, 5000, 10_000),
      etCandle(2024, 6, 11, 9, 30, 200, 100),
      etCandle(2024, 6, 11, 9, 35, 210, 100),
      etCandle(2024, 6, 11, 9, 40, 195, 100),
    ];

    const metrics = computeTechnicalMetrics(candles, RTH);
    expect(metrics.sessionHigh).toBeCloseTo(211, 0); // 210 high + 1
    expect(metrics.sessionLow).toBeCloseTo(194, 0); // 195 low - 1
  });

  it('places the point of control inside the current session range', () => {
    const candles = [
      etCandle(2024, 6, 10, 10, 0, 5000, 10_000),
      etCandle(2024, 6, 11, 9, 30, 200, 10),
      etCandle(2024, 6, 11, 9, 35, 205, 900),
      etCandle(2024, 6, 11, 9, 40, 200, 10),
    ];

    const metrics = computeTechnicalMetrics(candles, RTH);
    expect(metrics.pointOfControl).not.toBeNull();
    expect(metrics.pointOfControl).toBeGreaterThan(150);
    expect(metrics.pointOfControl).toBeLessThan(250);
  });

  it('reports the session start so the UI can show when it reset', () => {
    const candles = [etCandle(2024, 6, 11, 9, 30, 200), etCandle(2024, 6, 11, 10, 0, 205)];
    const metrics = computeTechnicalMetrics(candles, RTH);
    expect(metrics.sessionStart).toBe(zonedTimeToUtc('America/New_York', 2024, 6, 11, 9, 30));
  });

  it('switches the reset boundary when the mode changes from RTH to FULL', () => {
    const candles = [
      etCandle(2024, 6, 10, 19, 0, 300, 100), // 19:00 ET, previous evening
      etCandle(2024, 6, 11, 2, 0, 300, 100), // overnight
      etCandle(2024, 6, 11, 10, 0, 300, 100), // RTH
    ];

    // In FULL mode all three belong to one session (opened 18:00 on the 10th).
    expect(computeTechnicalMetrics(candles, FULL).sessionCandles).toBe(3);
    // In RTH mode only the 10:00 candle is in the current session.
    expect(computeTechnicalMetrics(candles, RTH).sessionCandles).toBe(1);
  });

  it('falls back to the whole series when no candle is in the session', () => {
    const candles = [etCandle(2024, 6, 10, 19, 0, 300, 100)];
    const metrics = computeTechnicalMetrics(candles, RTH);
    expect(metrics.sessionCandles).toBe(1);
  });

  it('is empty for an empty series', () => {
    const metrics = computeTechnicalMetrics([], RTH);
    expect(metrics.atr).toBeNull();
    expect(metrics.vwap).toBeNull();
    expect(metrics.sessionHigh).toBeNull();
  });
});
