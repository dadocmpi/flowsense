// ============================================
// GENERIC RATE METER TESTS
// ============================================
// One gate for every vendor. The invariants: it blocks before the limit is
// exceeded, it remembers a vendor rate limit for the rest of the minute, it
// adopts the vendor's own reported usage, and a cold instance is capped.

import { describe, expect, it } from 'vitest';
import { createRateMeter, CreditLimitError } from '../rateMeter';

function makeMeter(overrides: Partial<Parameters<typeof createRateMeter>[0]> = {}) {
  return createRateMeter({
    coldStartMax: 3,
    coldStartWindowMs: 60_000,
    envLimit: () => 8,
    label: 'test',
    ...overrides,
  });
}

describe('createRateMeter', () => {
  it('allows calls until the limit, then blocks', () => {
    const meter = makeMeter();
    const now = 1_700_000_000_000;
    expect(meter.check(1, now).allowed).toBe(true);
    meter.record({ endpoint: 'e', symbol: 's', credits: 1 }, {}, now);
    meter.record({ endpoint: 'e', symbol: 's', credits: 1 }, {}, now);
    meter.record({ endpoint: 'e', symbol: 's', credits: 1 }, {}, now);
    // The cold-start cap (3) blocks the fourth, before the minute limit (8).
    expect(meter.check(1, now).allowed).toBe(false);
  });

  it('adopts the vendor-reported usage over its own tally', () => {
    const meter = makeMeter();
    const now = 1_700_000_000_000;
    meter.record({ endpoint: 'e', symbol: 's', credits: 1 }, { used: 5, left: 3 }, now);
    const snap = meter.snapshot(now);
    expect(snap.used).toBe(5);
    // Vendor-reported limit is used + left.
    expect(snap.limit).toBe(8);
  });

  it('remembers a vendor rate limit for the rest of the minute', () => {
    const meter = makeMeter();
    const now = 1_700_000_000_000;
    meter.markExhausted(now);
    expect(meter.check(1, now).allowed).toBe(false);
    // The next wall-clock minute clears it.
    expect(meter.check(1, now + 60_000).allowed).toBe(true);
  });

  it('throws a CreditLimitError carrying the reset window', () => {
    const meter = makeMeter();
    const now = 1_700_000_000_000;
    meter.markExhausted(now);
    try {
      meter.assert(1, now);
      throw new Error('expected assert to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CreditLimitError);
      expect((error as CreditLimitError).resetAt).toBeGreaterThan(now);
      expect((error as CreditLimitError).label).toBe('test');
    }
  });

  it('counts calls and remembers the last call time', () => {
    const meter = makeMeter();
    const now = 1_700_000_000_000;
    meter.noteCall(now);
    meter.noteCall(now + 5);
    expect(meter.callsThisMinute(now + 5)).toBe(2);
    expect(meter.lastCallAt()).toBe(now + 5);
  });

  it('forgets everything on reset', () => {
    const meter = makeMeter();
    const now = 1_700_000_000_000;
    meter.markExhausted(now);
    meter.reset();
    expect(meter.snapshot(now).allowed).toBe(true);
    expect(meter.lastCallAt()).toBeNull();
  });
});
