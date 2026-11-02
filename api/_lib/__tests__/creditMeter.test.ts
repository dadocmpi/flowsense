// ============================================
// CREDIT METER TESTS
// ============================================
// The meter is the only thing standing between the app and the vendor's
// per-minute ceiling, so its behaviour is asserted against an injected clock
// rather than a real one.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertCredits,
  checkCredits,
  COLD_START_MAX_CREDITS,
  COLD_START_WINDOW_MS,
  CreditLimitError,
  DEFAULT_MINUTE_CREDITS,
  markExhausted,
  meterSnapshot,
  readVendorUsage,
  recordCredits,
  resetCreditMeter,
} from '../creditMeter';

/** A fixed minute boundary so the wall-clock window is deterministic. */
const T0 = Date.UTC(2024, 5, 10, 12, 0, 0);

const COST = { endpoint: 'time_series', symbol: 'XAU/USD', timeframe: '1D', credits: 1 };

describe('credit meter', () => {
  beforeEach(() => {
    resetCreditMeter();
    delete process.env.TWELVE_DATA_CREDITS_PER_MINUTE;
  });

  afterEach(() => {
    delete process.env.TWELVE_DATA_CREDITS_PER_MINUTE;
  });

  it('allows a call within the minute limit', () => {
    expect(checkCredits(1, T0).allowed).toBe(true);
  });

  it('blocks once the per-request tally reaches the limit', () => {
    for (let i = 0; i < DEFAULT_MINUTE_CREDITS; i += 1) {
      recordCredits(COST, {}, T0);
    }
    const snapshot = checkCredits(1, T0);
    expect(snapshot.allowed).toBe(false);
    expect(snapshot.reason).toMatch(/exceed/);
  });

  it('adopts the vendor-reported usage as the source of truth', () => {
    recordCredits(COST, { used: 5, left: 3 }, T0);
    const snapshot = meterSnapshot(T0);
    expect(snapshot.used).toBe(5);
    // used + left is the plan limit, learned from the vendor.
    expect(snapshot.limit).toBe(8);
  });

  it('lets the vendor-reported limit override the environment default', () => {
    process.env.TWELVE_DATA_CREDITS_PER_MINUTE = '50';
    recordCredits(COST, { used: 4, left: 4 }, T0);
    // The vendor said 8 (4 used + 4 left), so the plan ceiling is 8, not 50.
    expect(meterSnapshot(T0).limit).toBe(8);
  });

  it('marks itself exhausted for the rest of the minute on a vendor rate limit', () => {
    const snapshot = markExhausted(T0, 13);
    expect(snapshot.exhausted).toBe(true);
    expect(snapshot.used).toBe(13);
    expect(snapshot.resetAt).toBe(T0 + 60_000);
  });

  it('resets when the wall-clock minute rolls over', () => {
    markExhausted(T0, 13);
    expect(checkCredits(1, T0 + 30_000).allowed).toBe(false);
    // One minute later is a fresh window.
    const next = checkCredits(1, T0 + 60_000);
    expect(next.allowed).toBe(true);
    expect(next.used).toBe(0);
  });

  it('caps a cold instance at COLD_START_MAX_CREDITS for its first minute', () => {
    for (let i = 0; i < COLD_START_MAX_CREDITS; i += 1) {
      recordCredits(COST, {}, T0);
    }
    const snapshot = checkCredits(1, T0 + 1_000);
    expect(snapshot.coldStart).toBe(true);
    expect(snapshot.allowed).toBe(false);
    expect(snapshot.reason).toMatch(/cold start/);
  });

  it('lifts the cold-start cap once the window has passed', () => {
    for (let i = 0; i < COLD_START_MAX_CREDITS; i += 1) {
      recordCredits(COST, {}, T0);
    }
    expect(checkCredits(1, T0 + COLD_START_WINDOW_MS + 1).allowed).toBe(true);
  });

  it('raises a typed error carrying the reset time when a call is refused', () => {
    for (let i = 0; i < DEFAULT_MINUTE_CREDITS; i += 1) {
      recordCredits(COST, {}, T0);
    }
    try {
      assertCredits(1, T0);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CreditLimitError);
      expect((error as CreditLimitError).resetAt).toBe(T0 + 60_000);
    }
  });

  it('reads the vendor credit-usage headers', () => {
    const headers = new Headers({ 'api-credits-used': '3', 'api-credits-left': '5' });
    expect(readVendorUsage(headers)).toEqual({ used: 3, left: 5 });
  });

  it('reports no usage when the headers are absent', () => {
    expect(readVendorUsage(new Headers())).toEqual({});
    expect(readVendorUsage(undefined)).toEqual({});
  });

  it('reports a cold-start block resetting at the end of the cold-start window', () => {
    for (let i = 0; i < COLD_START_MAX_CREDITS; i += 1) {
      recordCredits(COST, {}, T0);
    }
    // Blocked at 30s, but the cold-start window runs to T0 + 60s, so a retry at
    // the minute boundary would land in the same block.
    const snapshot = checkCredits(1, T0 + 30_000);
    expect(snapshot.allowed).toBe(false);
    expect(snapshot.resetAt).toBe(T0 + COLD_START_WINDOW_MS);
  });
});
