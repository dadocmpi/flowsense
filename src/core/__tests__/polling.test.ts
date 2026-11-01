// ============================================
// POLLING / CACHE TTL TESTS
// ============================================
// The per-timeframe TTL is what keeps the credit spend bounded: inside it a
// timeframe costs nothing, and outside it the timeframe refreshes on its own.
// The TTLs live in the compass config, so these tests also pin the config's own
// shape.

import { describe, expect, it } from 'vitest';
import {
  cacheTtlFor,
  POLL_INTERVAL_MS,
  pollIntervalFor,
  PRICE_POLL_INTERVAL_MS,
  SERVER_CACHE_TTL_MS,
  TIMEFRAME_TTL_MS,
} from '../providers/polling';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';
import { TIMEFRAME_MINUTES, TIMEFRAMES } from '../types';

describe('TIMEFRAME_TTL_MS', () => {
  it('covers every timeframe the UI offers', () => {
    for (const timeframe of TIMEFRAMES) {
      expect(TIMEFRAME_TTL_MS[timeframe]).toBeGreaterThan(0);
    }
  });

  it('IS the config, so there is exactly one place to tune it', () => {
    expect(TIMEFRAME_TTL_MS).toEqual(DEFAULT_COMPASS_CONFIG.timeframeTtlMs);
  });

  it('uses the documented defaults', () => {
    expect(TIMEFRAME_TTL_MS['1m']).toBe(60_000);
    expect(TIMEFRAME_TTL_MS['5m']).toBe(120_000);
    expect(TIMEFRAME_TTL_MS['15m']).toBe(300_000);
    expect(TIMEFRAME_TTL_MS['30m']).toBe(600_000);
    expect(TIMEFRAME_TTL_MS['1h']).toBe(900_000);
    expect(TIMEFRAME_TTL_MS['4h']).toBe(1_800_000);
    expect(TIMEFRAME_TTL_MS['1D']).toBe(3_600_000);
  });

  it('caches a longer timeframe for longer than a shorter one', () => {
    expect(TIMEFRAME_TTL_MS['1m']).toBeLessThan(TIMEFRAME_TTL_MS['1h']);
    expect(TIMEFRAME_TTL_MS['1h']).toBeLessThan(TIMEFRAME_TTL_MS['1D']);
  });

  it('keeps a short timeframe on a short leash and a long one on a long one', () => {
    // The TTL is a product choice, not a function of the bar length: a 1m bar is
    // re-read once a minute, a daily bar once an hour. The invariant that matters
    // is that the cadence is bounded and monotonic, not that it matches the bar.
    expect(TIMEFRAME_TTL_MS['1m']).toBeLessThanOrEqual(60_000);
    expect(TIMEFRAME_TTL_MS['1D']).toBeLessThanOrEqual(60 * 60_000);
    expect(TIMEFRAME_TTL_MS['1m']).toBeLessThan(TIMEFRAME_TTL_MS['5m']);
    expect(TIMEFRAME_TTL_MS['5m']).toBeLessThan(TIMEFRAME_TTL_MS['15m']);
    expect(TIMEFRAME_TTL_MS['15m']).toBeLessThan(TIMEFRAME_TTL_MS['30m']);
    expect(TIMEFRAME_TTL_MS['30m']).toBeLessThan(TIMEFRAME_TTL_MS['1h']);
    expect(TIMEFRAME_TTL_MS['1h']).toBeLessThan(TIMEFRAME_TTL_MS['4h']);
    expect(TIMEFRAME_TTL_MS['4h']).toBeLessThan(TIMEFRAME_TTL_MS['1D']);
  });
});

describe('SERVER_CACHE_TTL_MS / POLL_INTERVAL_MS', () => {
  it('are the same table as the config TTL', () => {
    expect(SERVER_CACHE_TTL_MS).toEqual(TIMEFRAME_TTL_MS);
    expect(POLL_INTERVAL_MS).toEqual(TIMEFRAME_TTL_MS);
  });
});

describe('accessors', () => {
  it('returns the configured TTL', () => {
    expect(pollIntervalFor('5m')).toBe(TIMEFRAME_TTL_MS['5m']);
    expect(cacheTtlFor('5m')).toBe(TIMEFRAME_TTL_MS['5m']);
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
