// ============================================
// FEED CACHE / LOAD ORDER TESTS
// ============================================
// The two decisions that keep the credit spend bounded are pure functions, so
// they are pinned here: the load order (selected first, then highest-first) and
// the TTL (inside it a timeframe is free, outside it it refreshes).

import { describe, expect, it } from 'vitest';
import { expiredTimeframes, isFresh, loadOrder, LOAD_PRIORITY } from '../feedCache';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';
import { TIMEFRAMES, type Timeframe } from '../types';

const TTL = DEFAULT_COMPASS_CONFIG.timeframeTtlMs;

describe('LOAD_PRIORITY', () => {
  it('lists every timeframe, highest first', () => {
    expect([...LOAD_PRIORITY].sort()).toEqual([...TIMEFRAMES].sort());
    expect(LOAD_PRIORITY[0]).toBe('1D');
    expect(LOAD_PRIORITY[LOAD_PRIORITY.length - 1]).toBe('1m');
  });
});

describe('loadOrder', () => {
  it('puts the selected timeframe first', () => {
    expect(loadOrder('15m')[0]).toBe('15m');
  });

  it('follows with the rest, highest-first', () => {
    expect(loadOrder('15m')).toEqual(['15m', '1D', '4h', '1h', '30m', '5m', '1m']);
  });

  it('never repeats a timeframe', () => {
    const order = loadOrder('1D');
    expect(order).toEqual(['1D', '4h', '1h', '30m', '15m', '5m', '1m']);
    expect(new Set(order).size).toBe(order.length);
  });

  it('covers all seven timeframes', () => {
    for (const selected of TIMEFRAMES) {
      expect(loadOrder(selected)).toHaveLength(7);
    }
  });
});

describe('isFresh', () => {
  const now = 1_000_000;

  it('is false for a series that was never fetched', () => {
    expect(isFresh(null, TTL['1m'], now)).toBe(false);
    expect(isFresh(undefined, TTL['1m'], now)).toBe(false);
  });

  it('is true inside the TTL and false at or past it', () => {
    expect(isFresh(now - 30_000, TTL['1m'], now)).toBe(true);
    expect(isFresh(now - TTL['1m'], TTL['1m'], now)).toBe(false);
    expect(isFresh(now - TTL['1m'] - 1, TTL['1m'], now)).toBe(false);
  });

  it('honours the safety margin so a refresh lands inside the server TTL', () => {
    // At 59.5s of a 60s TTL the client calls it expired, which keeps the refresh
    // inside the server's cache window and so costs no extra credit.
    expect(isFresh(now - 59_500, TTL['1m'], now, 1_000)).toBe(false);
    expect(isFresh(now - 58_000, TTL['1m'], now, 1_000)).toBe(true);
  });
});

describe('expiredTimeframes', () => {
  const now = 1_000_000;

  it('treats every never-fetched timeframe as expired', () => {
    expect(expiredTimeframes({}, TIMEFRAMES, TTL, now)).toEqual([...TIMEFRAMES]);
  });

  it('excludes a timeframe that is still fresh', () => {
    const cache = { '1m': { series: [], fetchedAt: now - 10_000 } };
    const expired = expiredTimeframes(cache, TIMEFRAMES, TTL, now);
    expect(expired).not.toContain('1m');
    expect(expired).toHaveLength(TIMEFRAMES.length - 1);
  });

  it('includes a timeframe whose TTL has passed', () => {
    const cache = { '1m': { series: [], fetchedAt: now - TTL['1m'] - 1 } };
    expect(expiredTimeframes(cache, TIMEFRAMES, TTL, now)).toContain('1m');
  });

  it('only refreshes the expired timeframes, never the whole board', () => {
    const cache: Partial<Record<Timeframe, { series: never[]; fetchedAt: number }>> = {
      '1D': { series: [], fetchedAt: now - 10_000 },
      '1m': { series: [], fetchedAt: now - TTL['1m'] - 1 },
    };
    // Returned in the canonical TIMEFRAMES order; only the 1m and the unfetched
    // ones are listed, and 1D (fresh) is not.
    expect(expiredTimeframes(cache, TIMEFRAMES, TTL, now)).toEqual(['1m', '5m', '15m', '30m', '1h', '4h']);
  });
});
