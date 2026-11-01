// ============================================
// SYMBOL MAPPING TESTS
// ============================================
// The mapping decides what the app actually reads. Its invariants changed when
// runtime probing was removed: there is now exactly ONE symbol per instrument,
// so a request can never spend a second credit hunting for a working one.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configuredSymbol,
  findCandidate,
  INSTRUMENT_SYMBOLS,
  isEntitlementError,
  isRateLimitError,
} from '../symbols';

const SYMBOL_ENV_KEYS = ['TWELVE_DATA_SYMBOL_GC', 'TWELVE_DATA_SYMBOL_ES', 'TWELVE_DATA_SYMBOL_YM'];

describe('INSTRUMENT_SYMBOLS', () => {
  beforeEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  it('covers the three default instruments', () => {
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.instrumentId)).toEqual(['GC', 'ES', 'YM']);
  });

  it('configures exactly one symbol per instrument, so nothing is probed at runtime', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol).toBeDefined();
      // There is no candidate list to walk; the mapping carries one symbol.
      expect(entry).not.toHaveProperty('candidates');
    }
  });

  it('defaults each instrument to its continuous futures contract', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol.kind).toBe('futures');
      expect(entry.symbol.continuous).toBe(true);
    }
  });

  it('gives every symbol a description, so the UI never shows a bare symbol', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol.description.length).toBeGreaterThan(0);
    }
  });
});

describe('configuredSymbol', () => {
  beforeEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  it('returns the configured symbol, case-insensitively', () => {
    expect(configuredSymbol('gc')?.symbol).toBe('GC1!');
    expect(configuredSymbol('ES')?.symbol).toBe('ES1!');
  });

  it('returns undefined for an unknown instrument rather than guessing', () => {
    expect(configuredSymbol('NOPE')).toBeUndefined();
  });

  it('lets an environment override pin a proxy, labelled as a proxy', () => {
    process.env.TWELVE_DATA_SYMBOL_ES = 'SPY';
    const configured = configuredSymbol('ES');
    expect(configured?.symbol).toBe('SPY');
    expect(configured?.kind).toBe('proxy');
  });

  it('labels an overridden continuous contract as futures', () => {
    process.env.TWELVE_DATA_SYMBOL_GC = 'GC1!';
    expect(configuredSymbol('GC')?.kind).toBe('futures');
  });
});

describe('findCandidate', () => {
  it('finds the configured symbol', () => {
    expect(findCandidate('ES', 'ES1!')?.description).toContain('E-mini S&P 500');
  });

  it('returns undefined for a symbol that is not configured', () => {
    // SPY is no longer a configured symbol for ES, so it must not be reported as
    // one — that is what stops a runtime probe from ever being reintroduced.
    expect(findCandidate('ES', 'SPY')).toBeUndefined();
  });
});

describe('isEntitlementError', () => {
  it('recognises the phrasings that mean "this symbol cannot be read"', () => {
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

