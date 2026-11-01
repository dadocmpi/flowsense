// ============================================
// SYMBOL MAPPING TESTS
// ============================================
// The mapping decides what the app actually reads. Its invariants:
//   * exactly ONE symbol per asset, so nothing is probed at runtime
//   * the DEFAULTS work on the Twelve Data free plan (spot / ETF proxies)
//   * a real futures contract is only ever named via the environment

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configuredSymbol,
  findCandidate,
  INSTRUMENT_SYMBOLS,
  isEntitlementError,
  isRateLimitError,
} from '../symbols';

const SYMBOL_ENV_KEYS = [
  'SYMBOL_GOLD',
  'SYMBOL_SP500',
  'SYMBOL_DOW',
  'SYMBOL_NASDAQ',
  'TWELVE_DATA_SYMBOL_GC',
  'TWELVE_DATA_SYMBOL_ES',
  'TWELVE_DATA_SYMBOL_YM',
  'TWELVE_DATA_SYMBOL_NQ',
];

function clearSymbolEnv() {
  for (const key of SYMBOL_ENV_KEYS) delete process.env[key];
}

describe('INSTRUMENT_SYMBOLS', () => {
  beforeEach(clearSymbolEnv);
  afterEach(clearSymbolEnv);

  it('covers Gold, S&P 500, Dow and Nasdaq', () => {
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.instrumentId)).toEqual(['GC', 'ES', 'YM', 'NQ']);
  });

  it('configures exactly one symbol per instrument, so nothing is probed at runtime', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol).toBeDefined();
      // There is no candidate list to walk; the mapping carries one symbol.
      expect(entry).not.toHaveProperty('candidates');
    }
  });

  it('defaults every asset to a free-plan symbol, i.e. a proxy', () => {
    // The continuous contracts (GC1! etc.) are not available on the free plan, so
    // no default may be a futures contract.
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol.kind).toBe('proxy');
      expect(entry.symbol.symbol.endsWith('!')).toBe(false);
    }
  });

  it('uses the documented free-plan defaults', () => {
    expect(configuredSymbol('GC')?.symbol).toBe('XAU/USD');
    expect(configuredSymbol('ES')?.symbol).toBe('SPY');
    expect(configuredSymbol('YM')?.symbol).toBe('DIA');
    expect(configuredSymbol('NQ')?.symbol).toBe('QQQ');
  });

  it('gives every symbol a description, so the UI never shows a bare symbol', () => {
    for (const entry of INSTRUMENT_SYMBOLS) {
      expect(entry.symbol.description.length).toBeGreaterThan(0);
    }
  });

  it('names the environment variable that overrides each asset', () => {
    expect(INSTRUMENT_SYMBOLS.map(entry => entry.envVar)).toEqual([
      'SYMBOL_GOLD',
      'SYMBOL_SP500',
      'SYMBOL_DOW',
      'SYMBOL_NASDAQ',
    ]);
  });
});

describe('configuredSymbol', () => {
  beforeEach(clearSymbolEnv);
  afterEach(clearSymbolEnv);

  it('returns the configured symbol, case-insensitively', () => {
    expect(configuredSymbol('gc')?.symbol).toBe('XAU/USD');
    expect(configuredSymbol('ES')?.symbol).toBe('SPY');
  });

  it('returns undefined for an unknown instrument rather than guessing', () => {
    expect(configuredSymbol('NOPE')).toBeUndefined();
  });

  it('lets the SYMBOL_* variable pin a different symbol, labelled as a proxy', () => {
    process.env.SYMBOL_SP500 = 'IVV';
    const configured = configuredSymbol('ES');
    expect(configured?.symbol).toBe('IVV');
    expect(configured?.kind).toBe('proxy');
  });

  it('labels an overridden continuous contract as futures', () => {
    process.env.SYMBOL_GOLD = 'GC1!';
    expect(configuredSymbol('GC')?.kind).toBe('futures');
  });

  it('still honours the legacy TWELVE_DATA_SYMBOL_<ID> name', () => {
    process.env.TWELVE_DATA_SYMBOL_YM = 'DIA';
    expect(configuredSymbol('YM')?.symbol).toBe('DIA');
  });
});

describe('findCandidate', () => {
  beforeEach(clearSymbolEnv);
  afterEach(clearSymbolEnv);

  it('finds the configured symbol', () => {
    expect(findCandidate('ES', 'SPY')?.description).toContain('S&P 500');
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
      'symbol is not available',
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
