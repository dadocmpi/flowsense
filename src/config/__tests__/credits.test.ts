// ============================================
// PLAN-AWARE CREDIT CONFIG TESTS
// ============================================
// The config is what lets an upgraded plan be an environment change. These
// assert the two properties that matter: the shipped 8-credit plan keeps the
// conservative cadence, and a roomier plan can only refresh sooner, never later.

import { describe, expect, it } from 'vitest';
import {
  DAILY_CAP_WARN_FRACTION,
  DEFAULT_CREDITS_PER_MINUTE,
  DEFAULT_DAILY_CAP,
  parseLimit,
  pollIntervalForPlan,
  queueStaggerMs,
  serverCacheTtlForPlan,
} from '../credits';

describe('plan-aware credit config', () => {
  it('defaults to the shipped Twelve Data Basic plan', () => {
    expect(DEFAULT_CREDITS_PER_MINUTE).toBe(8);
    expect(DEFAULT_DAILY_CAP).toBe(800);
    expect(DAILY_CAP_WARN_FRACTION).toBe(0.8);
  });

  it('keeps the conservative cadence on the default plan', () => {
    const poll = pollIntervalForPlan(DEFAULT_CREDITS_PER_MINUTE);
    expect(poll['1m']).toBe(20_000);
    expect(poll['1D']).toBe(600_000);
  });

  it('polls sooner as the plan gets roomier', () => {
    const small = pollIntervalForPlan(8);
    const large = pollIntervalForPlan(64);
    for (const timeframe of Object.keys(small) as Array<keyof typeof small>) {
      expect(large[timeframe]).toBeLessThanOrEqual(small[timeframe]);
    }
    // Eight times the budget means up to eight times sooner, floored at 5s.
    expect(large['1m']).toBe(5_000);
  });

  it('never polls slower than the default on a bigger plan', () => {
    const small = pollIntervalForPlan(4);
    const large = pollIntervalForPlan(8);
    for (const timeframe of Object.keys(small) as Array<keyof typeof small>) {
      expect(large[timeframe]).toBeLessThanOrEqual(small[timeframe]);
    }
  });

  it('keeps the server cache TTL just under the poll interval', () => {
    const poll = pollIntervalForPlan(DEFAULT_CREDITS_PER_MINUTE);
    const ttl = serverCacheTtlForPlan(DEFAULT_CREDITS_PER_MINUTE);
    for (const timeframe of Object.keys(poll) as Array<keyof typeof poll>) {
      expect(ttl[timeframe]).toBeLessThan(poll[timeframe]);
      expect(ttl[timeframe]).toBeGreaterThan(0);
    }
  });

  it('staggers the queue so a sweep cannot trip the meter', () => {
    // Seven requests at 8/minute: the stagger must be at least 60/8/2 = 3750ms,
    // floored at 750ms.
    const stagger = queueStaggerMs(8);
    expect(stagger).toBeGreaterThanOrEqual(750);
    expect(stagger * 7).toBeLessThan(60_000 + 10_000);
    // A bigger plan loads sooner.
    expect(queueStaggerMs(64)).toBeLessThan(stagger);
  });

  it('falls back to the default for a malformed limit', () => {
    expect(pollIntervalForPlan(Number.NaN)['1m']).toBe(20_000);
    expect(pollIntervalForPlan(0)['1m']).toBe(20_000);
    expect(pollIntervalForPlan(-5)['1m']).toBe(20_000);
  });

  it('parses an env limit, keeping 0 meaningful and rejecting junk', () => {
    expect(parseLimit('16', 8)).toBe(16);
    expect(parseLimit('0', 800)).toBe(0);
    expect(parseLimit(undefined, 800)).toBe(800);
    expect(parseLimit('not-a-number', 8)).toBe(8);
    expect(parseLimit('-3', 8)).toBe(8);
  });
});
