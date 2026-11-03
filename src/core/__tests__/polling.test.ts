// ============================================
// POLLING CADENCE TESTS
// ============================================
// The cadence is what keeps the credit spend bounded. If a timeframe's poll
// interval ever dropped below its bar length, the app would fetch far more than
// it needs and burn the plan.

import { describe, expect, it } from 'vitest';
import {
  ALPACA_POLL_INTERVAL_MS,
  ALPACA_SERVER_CACHE_TTL_MS,
  cacheTtlFor,
  cacheTtlForProvider,
  POLL_INTERVAL_MS,
  pollIntervalFor,
  pollIntervalForProvider,
  PRICE_POLL_INTERVAL_MS,
  SERVER_CACHE_TTL_MS,
} from '../providers/polling';
import { TIMEFRAME_MINUTES, TIMEFRAMES } from '../types';

describe('POLL_INTERVAL_MS', () => {
  it('covers every timeframe the UI offers', () => {
    for (const timeframe of TIMEFRAMES) {
      expect(POLL_INTERVAL_MS[timeframe]).toBeGreaterThan(0);
    }
  });

  it('keeps every interval short enough to catch a new bar promptly', () => {
    // The point of the cadence is that a newly opened bar shows up quickly.
    // Half an hour is the longest we ever wait.
    for (const timeframe of TIMEFRAMES) {
      expect(POLL_INTERVAL_MS[timeframe]).toBeLessThanOrEqual(30 * 60_000);
    }
  });

  it('polls a short timeframe sooner than a long one', () => {
    expect(POLL_INTERVAL_MS['1m']).toBeLessThan(POLL_INTERVAL_MS['1h']);
    expect(POLL_INTERVAL_MS['1h']).toBeLessThan(POLL_INTERVAL_MS['1D']);
  });
});

describe('ALPACA_POLL_INTERVAL_MS', () => {
  it('covers every timeframe and stays short enough to catch a new bar', () => {
    for (const timeframe of TIMEFRAMES) {
      expect(ALPACA_POLL_INTERVAL_MS[timeframe]).toBeGreaterThan(0);
      expect(ALPACA_POLL_INTERVAL_MS[timeframe]).toBeLessThanOrEqual(30 * 60_000);
    }
  });

  it('is a separate cadence from Twelve Data, chosen per provider', () => {
    expect(pollIntervalForProvider('alpaca', '1m')).toBe(ALPACA_POLL_INTERVAL_MS['1m']);
    expect(pollIntervalForProvider('twelvedata', '1m')).toBe(POLL_INTERVAL_MS['1m']);
  });
});

describe('SERVER_CACHE_TTL_MS', () => {
  it('sits just under the poll interval, so a poller still sees a new bar', () => {
    for (const timeframe of TIMEFRAMES) {
      expect(SERVER_CACHE_TTL_MS[timeframe]).toBeLessThan(POLL_INTERVAL_MS[timeframe]);
      // But not so short that concurrent users cannot share one vendor call.
      expect(SERVER_CACHE_TTL_MS[timeframe]).toBeGreaterThan(POLL_INTERVAL_MS[timeframe] * 0.5);
    }
  });
});

describe('ALPACA_SERVER_CACHE_TTL_MS', () => {
  it('is derived from the Alpaca cadence, not the Twelve Data one', () => {
    for (const timeframe of TIMEFRAMES) {
      expect(ALPACA_SERVER_CACHE_TTL_MS[timeframe]).toBeLessThan(ALPACA_POLL_INTERVAL_MS[timeframe]);
      expect(ALPACA_SERVER_CACHE_TTL_MS[timeframe]).toBeGreaterThan(ALPACA_POLL_INTERVAL_MS[timeframe] * 0.5);
    }
    // The 1m TTLs differ, which they would not if Alpaca's reused Twelve Data's.
    expect(cacheTtlForProvider('alpaca', '1m')).toBe(ALPACA_SERVER_CACHE_TTL_MS['1m']);
    expect(cacheTtlForProvider('twelvedata', '1m')).toBe(SERVER_CACHE_TTL_MS['1m']);
    expect(ALPACA_SERVER_CACHE_TTL_MS['1m']).not.toBe(SERVER_CACHE_TTL_MS['1m']);
  });
});

describe('accessors', () => {
  it('returns the configured interval', () => {
    expect(pollIntervalFor('5m')).toBe(POLL_INTERVAL_MS['5m']);
    expect(cacheTtlFor('5m')).toBe(SERVER_CACHE_TTL_MS['5m']);
  });
});

describe('PRICE_POLL_INTERVAL_MS', () => {
  it('keeps the credit spend bounded', () => {
    // The polled price is a convenience, not a tick: it must never cost more
    // than a couple of requests a minute per open tab.
    expect(PRICE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(20_000);
    expect(PRICE_POLL_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });

  it('is quick enough that a new 1m bar is caught within its own length', () => {
    expect(PRICE_POLL_INTERVAL_MS).toBeLessThanOrEqual(TIMEFRAME_MINUTES['1m'] * 60_000);
  });
});
