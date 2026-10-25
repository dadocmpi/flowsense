// ============================================
// SYMBOL MAPPING TESTS
// ============================================
// The mapping decides what the app actually reads, so its invariants matter:
// futures are tried before proxies, and an unentitled plan falls back rather
// than failing.

import { describe, expect, it } from 'vitest';
import {
  candidatesFor,
  findCandidate,
  INSTRUMENT_SYMBOLS,
  isEntitlementError,
  isRateLimitError,
} from '../symbols';

describe('INSTRUMENT_SYMBOLS', () => {
  it('covers the three default instruments', () => {
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.instrumentId)).toEqual(['GC', 'ES', 'YM']);
  });

  it('tries the real futures contract before any proxy', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.candidates[0].kind).toBe('futures');
      expect(entry.candidates[0].continuous).toBe(true);
      // Everything after the first candidate is a fallback.
      for (const candidate of entry.candidates.slice(1)) {
        expect(candidate.kind).toBe('proxy');
      }
    }
  });

  it('gives every candidate a description, so the UI never shows a bare symbol', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      for (const candidate of entry.candidates) {
        expect(candidate.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('looks up candidates case-insensitively', () => {
    expect(candidatesFor('gc')[0].symbol).toBe('GC1!');
    expect(candidatesFor('ES')[0].symbol).toBe('ES1!');
  });

  it('returns an empty list for an unknown instrument rather than guessing', () => {
    expect(candidatesFor('NOPE')).toEqual([]);
  });
});

describe('findCandidate', () => {
  it('finds a candidate by symbol', () => {
    expect(findCandidate('ES', 'SPY')?.description).toBe('SPDR S&P 500 ETF');
  });

  it('returns undefined for a symbol not in the catalog', () => {
    expect(findCandidate('ES', 'NOPE')).toBeUndefined();
  });
});

describe('isEntitlementError', () => {
  it('recognises the phrasings that mean "try the next candidate"', () => {
    for (const message of [
      'You are not entitled to this symbol',
      'not authorized',
      'Please upgrade your plan',
      'invalid symbol',
      'symbol not found',
      'no data',
    ]) {
      expect(isEntitlementError(message)).toBe(true);
    }
  });

  it('does not treat a rate limit as an entitlement problem', () => {
    expect(isEntitlementError('API rate limit exceeded')).toBe(false);
  });
});

describe('isRateLimitError', () => {
  it('recognises credit and quota wording', () => {
    for (const message of ['rate limit', 'too many requests', 'You have run out of credits', 'quota exceeded']) {
      expect(isRateLimitError(message)).toBe(true);
    }
  });

  it('does not treat an entitlement problem as a rate limit', () => {
    expect(isRateLimitError('not entitled to this symbol')).toBe(false);
  });
});
