// ============================================
// MARKET SESSION TESTS
// ============================================
// The US-equity calendar decides whether an Alpaca asset is "market closed" (its
// newest candle legitimately at the last close) or genuinely stale. Getting this
// wrong would either excuse a stopped feed or cry stale every night.

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSessionCaches,
  isUsEquityHoliday,
  marketStateFor,
  usEquityMarketState,
  usEquitySessionState,
} from '../marketSessions';
import type { Candle } from '../types';

function candle(iso: string, close = 100): Candle {
  const date = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    datetime: `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  };
}

/** A regular-session Wednesday instant: 2024-06-12 14:00 UTC = 10:00 ET. */
const WEDNESDAY_MID_SESSION = Date.UTC(2024, 5, 12, 14, 0, 0);
/** 2024-06-12 21:00 UTC = 17:00 ET, after the close. */
const WEDNESDAY_AFTER_CLOSE = Date.UTC(2024, 5, 12, 21, 0, 0);

describe('usEquitySessionState', () => {
  afterEach(() => clearSessionCaches());

  it('is open mid-session on a weekday', () => {
    expect(usEquitySessionState(WEDNESDAY_MID_SESSION).open).toBe(true);
  });

  it('is closed on a weekend', () => {
    // 2024-06-15 is a Saturday.
    expect(usEquitySessionState(Date.UTC(2024, 5, 15, 14, 0, 0)).open).toBe(false);
  });

  it('is closed before the open and after the close', () => {
    // 2024-06-12 13:00 UTC = 09:00 ET, before the 09:30 open.
    expect(usEquitySessionState(Date.UTC(2024, 5, 12, 13, 0, 0)).open).toBe(false);
    expect(usEquitySessionState(WEDNESDAY_AFTER_CLOSE).open).toBe(false);
  });

  it('is closed on a holiday', () => {
    // 2024-07-04, Independence Day (a Thursday).
    expect(usEquitySessionState(Date.UTC(2024, 6, 4, 14, 0, 0)).open).toBe(false);
  });
});

describe('isUsEquityHoliday', () => {
  afterEach(() => clearSessionCaches());

  it('knows the fixed-date holidays', () => {
    expect(isUsEquityHoliday(2024, 7, 4)).toBe(true);
    expect(isUsEquityHoliday(2024, 12, 25)).toBe(true);
    expect(isUsEquityHoliday(2024, 1, 1)).toBe(true);
  });

  it('knows the rule-based holidays', () => {
    // MLK Day 2024: third Monday of January = Jan 15.
    expect(isUsEquityHoliday(2024, 1, 15)).toBe(true);
    // Thanksgiving 2024: fourth Thursday of November = Nov 28.
    expect(isUsEquityHoliday(2024, 11, 28)).toBe(true);
    // Memorial Day 2024: last Monday of May = May 27.
    expect(isUsEquityHoliday(2024, 5, 27)).toBe(true);
    // Good Friday 2024: March 29.
    expect(isUsEquityHoliday(2024, 3, 29)).toBe(true);
  });

  it('does not mark an ordinary weekday as a holiday', () => {
    expect(isUsEquityHoliday(2024, 6, 12)).toBe(false);
  });
});

describe('usEquityMarketState', () => {
  afterEach(() => clearSessionCaches());

  it('is CLOSED after hours even with an old candle, and reports the real age', () => {
    const candles = [candle(new Date(WEDNESDAY_MID_SESSION).toISOString())];
    const state = usEquityMarketState(candles, '1m', WEDNESDAY_AFTER_CLOSE);
    expect(state.state).toBe('CLOSED');
    // The age is still reported, so the UI can show the real last-candle age.
    expect(state.stalenessMs).toBe(WEDNESDAY_AFTER_CLOSE - WEDNESDAY_MID_SESSION);
  });

  it('still catches a stopped feed during the session rather than excusing it', () => {
    // A candle an hour old, mid-session, on a 1m chart: the feed has stopped. The
    // calendar is open, so this falls through to the staleness test, which flags
    // it — the calendar only excuses an out-of-hours gap, never a live one.
    const candles = [candle(new Date(WEDNESDAY_MID_SESSION - 3_600_000).toISOString())];
    const state = usEquityMarketState(candles, '1m', WEDNESDAY_MID_SESSION);
    expect(state.state).toBe('CLOSED');
  });
});

describe('marketStateFor', () => {
  afterEach(() => clearSessionCaches());

  it('routes Alpaca through the equity calendar', () => {
    const candles = [candle(new Date(WEDNESDAY_MID_SESSION).toISOString())];
    expect(marketStateFor('alpaca', candles, '1m', WEDNESDAY_AFTER_CLOSE).state).toBe('CLOSED');
  });

  it('routes Twelve Data through the candle-staleness heuristic', () => {
    // Gold spot keeps printing after the equity close, so its market state is
    // judged by candle staleness, not the equity calendar — an hour-old 1m candle
    // reads CLOSED by the staleness rule, not by the equity session.
    const candles = [candle(new Date(WEDNESDAY_MID_SESSION - 3_600_000).toISOString())];
    const state = marketStateFor('twelvedata', candles, '1m', WEDNESDAY_AFTER_CLOSE);
    expect(state.reason).toMatch(/bar/);
    expect(state.toleranceMs).toBe(3 * 60_000);
  });
});
