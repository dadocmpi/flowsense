// ============================================
// UI FORMATTER TESTS
// ============================================
// The ages on the compass cards and the entry-check chips are what tell the
// reader how current a number is, so the wording is pinned down here.

import { describe, expect, it } from 'vitest';
import { formatAge, formatSigned, formatSignedPercent } from '../compass/format';

const NOW = Date.parse('2024-06-10T12:00:00Z');

describe('formatAge', () => {
  it('reports seconds, then minutes, then hours and minutes', () => {
    expect(formatAge(NOW - 42_000, NOW)).toBe('42s ago');
    expect(formatAge(NOW - 2 * 60_000, NOW)).toBe('2 min ago');
    expect(formatAge(NOW - (60 * 60_000 + 5 * 60_000), NOW)).toBe('1h 5m ago');
  });

  it('switches to minutes at the one-minute boundary', () => {
    expect(formatAge(NOW - 59_000, NOW)).toBe('59s ago');
    expect(formatAge(NOW - 60_000, NOW)).toBe('1 min ago');
  });

  it('never reports a negative age', () => {
    expect(formatAge(NOW + 5_000, NOW)).toBe('0s ago');
  });

  it('reports an unknown age rather than a guess', () => {
    expect(formatAge(null, NOW)).toBe('--');
    expect(formatAge(0, NOW)).toBe('--');
  });
});

describe('formatSigned', () => {
  it('adds a plus for positive values and keeps the minus for negative ones', () => {
    expect(formatSigned(12.5, 2)).toBe('+12.50');
    expect(formatSigned(-3.25, 2)).toBe('-3.25');
    expect(formatSigned(0, 2)).toBe('0.00');
  });
});

describe('formatSignedPercent', () => {
  it('adds a plus for positive percentages and keeps the minus for negative ones', () => {
    expect(formatSignedPercent(0.42)).toBe('+0.42%');
    expect(formatSignedPercent(-1.5)).toBe('-1.50%');
    expect(formatSignedPercent(0)).toBe('0.00%');
  });
});
