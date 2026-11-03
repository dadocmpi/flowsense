// ============================================
// SYMBOL MAPPING TESTS
// ============================================
// The mapping decides what the app actually reads. Its invariants changed when
// runtime probing was removed: there is now exactly ONE symbol per instrument, so
// a request can never spend a second credit hunting for a working one.
//
// It changed again when providers became per-asset: Gold stays on Twelve Data
// (spot XAU/USD) and the index assets moved to Alpaca, so the Twelve Data catalog
// now describes only what Twelve Data is really asked for.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configuredSymbol,
  findCandidate,
  INSTRUMENT_SYMBOLS,
  isEntitlementError,
  isRateLimitError,
} from '../symbols';

const SYMBOL_ENV_KEYS = [
  'TWELVE_DATA_SYMBOL_GC',
  'TWELVE_DATA_SYMBOL_ES',
  'TWELVE_DATA_SYMBOL_YM',
  'TWELVE_DATA_SYMBOL_NQ',
  'ASSET_SYMBOL_GC',
  'ASSET_SYMBOL_ES',
  'ASSET_PROVIDER_GC',
  'ASSET_PROVIDER_ES',
];

describe('INSTRUMENT_SYMBOLS', () => {
  beforeEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  it('covers only the Twelve Data assets — Gold', () => {
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.instrumentId)).toEqual(['GC']);
  });

  it('configures exactly one symbol per instrument, so nothing is probed at runtime', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol).toBeDefined();
      // There is no candidate list to walk; the mapping carries one symbol.
      expect(entry).not.toHaveProperty('candidates');
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

  it('returns the configured symbol for Gold, case-insensitively', () => {
    expect(configuredSymbol('gc')?.symbol).toBe('XAU/USD');
    expect(configuredSymbol('GC')?.symbol).toBe('XAU/USD');
  });

  it('returns undefined for an asset now served by Alpaca', () => {
    // ES moved to Alpaca, so Twelve Data has no symbol for it. That is what keeps
    // a stray Twelve Data call from ever being made for it.
    expect(configuredSymbol('ES')).toBeUndefined();
  });

  it('returns undefined for an unknown instrument rather than guessing', () => {
    expect(configuredSymbol('NOPE')).toBeUndefined();
  });

  it('lets an environment override pin a symbol', () => {
    process.env.ASSET_SYMBOL_GC = 'GLD';
    const configured = configuredSymbol('GC');
    expect(configured?.symbol).toBe('GLD');
  });

  it('honours the legacy TWELVE_DATA_SYMBOL override', () => {
    process.env.TWELVE_DATA_SYMBOL_GC = 'GC1!';
    expect(configuredSymbol('GC')?.symbol).toBe('GC1!');
  });

  it('labels an overridden continuous contract as futures', () => {
    process.env.TWELVE_DATA_SYMBOL_GC = 'GC1!';
    expect(configuredSymbol('GC')?.kind).toBe('futures');
  });

  it('reports a symbol that an env override moved to Alpaca as no Twelve Data symbol', () => {
    process.env.ASSET_PROVIDER_GC = 'alpaca';
    expect(configuredSymbol('GC')).toBeUndefined();
  });
});

describe('findCandidate', () => {
  it('finds the configured symbol', () => {
    expect(findCandidate('GC', 'XAU/USD')?.description).toContain('XAU/USD');
  });

  it('returns undefined for a symbol that is not configured', () => {
    // GC1! is not the configured symbol for GC, so it must not be reported as one
    // — that is what stops a runtime probe from ever being reintroduced.
    expect(findCandidate('GC', 'GC1!')).toBeUndefined();
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
