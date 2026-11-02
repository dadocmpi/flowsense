// ============================================
// TIMEFRAME QUEUE TESTS
// ============================================
// The queue decides what loads, in what order, and what is worth retrying. These
// assert the three rules the task depends on: the selected timeframe loads first,
// the base timeframe loads next, and a permanent error is NEVER retried.

import { describe, expect, it } from 'vitest';
import {
  expiredTimeframes,
  isFresh,
  LOAD_PRIORITY,
  loadOrder,
  queueable,
  shouldQueue,
  type LoadStatus,
} from '../timeframeQueue';
import type { Timeframe } from '../types';
import { TIMEFRAMES } from '../types';

describe('timeframe load order', () => {
  it('loads the selected timeframe first', () => {
    expect(loadOrder('30m')[0]).toBe('30m');
  });

  it('puts the base timeframe right after the selected one', () => {
    const order = loadOrder('30m', '1m');
    expect(order.slice(0, 2)).toEqual(['30m', '1m']);
  });

  it('never duplicates the base when it is the selected timeframe', () => {
    const order = loadOrder('1m', '1m');
    expect(order.filter(timeframe => timeframe === '1m')).toHaveLength(1);
    expect(new Set(order).size).toBe(order.length);
  });

  it('covers every timeframe exactly once', () => {
    const order = loadOrder('15m', '1m');
    expect(order).toHaveLength(TIMEFRAMES.length);
    expect(new Set(order)).toEqual(new Set(TIMEFRAMES));
  });

  it('falls back to highest-first after the head', () => {
    const order = loadOrder('1D', '1m');
    expect(order).toEqual(['1D', '1m', ...LOAD_PRIORITY.filter(tf => tf !== '1D' && tf !== '1m')]);
  });
});

describe('timeframe queueing rules', () => {
  it('queues only idle and waiting timeframes', () => {
    expect(shouldQueue('idle')).toBe(true);
    expect(shouldQueue('waiting')).toBe(true);
    expect(shouldQueue('loaded')).toBe(false);
    expect(shouldQueue('loading')).toBe(false);
    // The critical rule: a permanent error is never retried in a loop.
    expect(shouldQueue('error')).toBe(false);
  });

  it('filters a status map down to the queueable timeframes', () => {
    const status: Record<Timeframe, LoadStatus> = {
      '1m': 'loaded',
      '5m': 'error',
      '15m': 'idle',
      '30m': 'waiting',
      '1h': 'idle',
      '4h': 'idle',
      '1D': 'loaded',
    };
    const queued = queueable('15m', timeframe => status[timeframe], '1m');
    expect(queued).not.toContain('5m'); // error: never retried
    expect(queued).not.toContain('1m'); // loaded
    expect(queued).not.toContain('1D'); // loaded
    expect(queued[0]).toBe('15m'); // selected first
    expect(queued).toContain('30m'); // waiting: retried
  });
});

describe('cache freshness', () => {
  const TTL = { '1m': 20_000, '5m': 45_000, '15m': 60_000, '30m': 90_000, '1h': 120_000, '4h': 300_000, '1D': 600_000 } as Record<Timeframe, number>;

  it('treats a never-fetched series as expired', () => {
    expect(isFresh(null, 60_000, 1_000)).toBe(false);
    expect(isFresh(undefined, 60_000, 1_000)).toBe(false);
  });

  it('keeps a series inside its TTL fresh and one past it expired', () => {
    const now = 1_000_000;
    expect(isFresh(now - 10_000, 60_000, now)).toBe(true);
    expect(isFresh(now - 70_000, 60_000, now)).toBe(false);
  });

  it('reports only the expired timeframes', () => {
    const now = 1_000_000;
    const cache = {
      '15m': { series: [], fetchedAt: now - 10_000 },
      '1D': { series: [], fetchedAt: now - 10 * 60_000 },
    };
    const expired = expiredTimeframes(cache, TIMEFRAMES, TTL, now);
    expect(expired).not.toContain('15m');
    expect(expired).toContain('1D');
    // Everything never fetched is expired.
    expect(expired).toContain('1m');
  });
});
