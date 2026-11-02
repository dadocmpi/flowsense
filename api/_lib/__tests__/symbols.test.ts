// ============================================
// SYMBOL MAPPING TESTS
// ============================================
// The mapping decides what the app actually reads. Its invariants changed when
// runtime probing was removed: there is now exactly ONE symbol per instrument,
// so a request can never spend a second credit hunting for a working one.
//
// The defaults are spot / ETF proxies, not the continuous-futures contracts: a
// Twelve Data plan that does not entitle GC1!/ES1!/YM1!/NQ1! answers "symbol or
// figi parameter is missing or invalid", so the shipped default must be one the
// free tier carries. The override still comes from the instrument's own
// environment variable, named in the config.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configuredSymbol,
  findCandidate,
  INSTRUMENT_SYMBOLS,
  isEntitlementError,
  isRateLimitError,
} from '../symbols';

const SYMBOL_ENV_KEYS = ['SYMBOL_GOLD', 'SYMBOL_SP500', 'SYMBOL_DOW', 'SYMBOL_NASDAQ'];

describe('INSTRUMENT_SYMBOLS', () => {
  beforeEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
  });

  it('covers the four shipped instruments', () => {
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.instrumentId)).toEqual(['GC', 'ES', 'YM', 'NQ']);
  });

  it('configures exactly one symbol per instrument, so nothing is probed at runtime', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol).toBeDefined();
      // There is no candidate list to walk; the mapping carries one symbol.
      expect(entry).not.toHaveProperty('candidates');
    }
  });

  it('defaults each instrument to a proxy, not a continuous-futures contract', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol.kind).toBe('proxy');
      expect(entry.symbol.continuous).toBeUndefined();
    }
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.symbol.symbol)).toEqual(['XAU/USD', 'SPY', 'DIA', 'QQQ']);
  });

  it('declares the environment variable that overrides each symbol', () => {
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.envVar)).toEqual([
      'SYMBOL_GOLD',
      'SYMBOL_SP500',
      'SYMBOL_DOW',
      'SYMBOL_NASDAQ',
    ]);
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
    expect(configuredSymbol('gc')?.symbol).toBe('XAU/USD');
    expect(configuredSymbol('ES')?.symbol).toBe('SPY');
    expect(configuredSymbol('nq')?.symbol).toBe('QQQ');
  });

  it('returns undefined for an unknown instrument rather than guessing', () => {
    expect(configuredSymbol('NOPE')).toBeUndefined();
  });

  it('lets the instrument env var pin a different proxy, labelled as a proxy', () => {
    process.env.SYMBOL_SP500 = 'IVV';
    const configured = configuredSymbol('ES');
    expect(configured?.symbol).toBe('IVV');
    expect(configured?.kind).toBe('proxy');
  });

  it('labels an overridden continuous contract as futures', () => {
    process.env.SYMBOL_GOLD = 'GC1!';
    const configured = configuredSymbol('GC');
    expect(configured?.symbol).toBe('GC1!');
    expect(configured?.kind).toBe('futures');
  });
});

describe('findCandidate', () => {
  it('finds the configured symbol', () => {
    expect(findCandidate('ES', 'SPY')?.description).toContain('SPDR S&P 500 ETF');
  });

  it('returns undefined for a symbol that is not configured', () => {
    // ES1! is no longer a configured symbol for ES, so it must not be reported as
    // one — that is what stops a runtime probe from ever being reintroduced.
    expect(findCandidate('ES', 'ES1!')).toBeUndefined();
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

  it('recognises the exact message the vendor returns for an unentitled contract', () => {
    // This is what GC1!/ES1!/YM1!/NQ1! produced on the deployed plan.
    expect(isEntitlementError('symbol or figi parameter is missing or invalid')).toBe(true);
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

