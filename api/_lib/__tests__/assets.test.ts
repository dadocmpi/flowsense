// ============================================
// PER-ASSET PROVIDER CONFIGURATION TESTS
// ============================================
// The one place that decides which provider serves each asset. Its invariants:
// Gold reads Twelve Data (spot XAU/USD), the index assets read Alpaca
// (SPY/DIA/QQQ), and any asset can be moved by configuration alone.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASSET_DISPLAY_NAMES,
  ASSET_PROVIDER_DEFAULTS,
  assetDisplayName,
  assetProvider,
  assetProviderConfig,
  assetRequirement,
  assetRequirements,
  assetSymbol,
  CONFIGURED_ASSET_IDS,
  PROVIDER_ENV_VARS,
  providerCredentials,
} from '../assets';

const ENV_KEYS = [
  'ASSET_PROVIDER_GC',
  'ASSET_PROVIDER_ES',
  'ASSET_PROVIDER_YM',
  'ASSET_PROVIDER_NQ',
  'ASSET_SYMBOL_GC',
  'ASSET_SYMBOL_ES',
  'ASSET_SYMBOL_YM',
  'ASSET_SYMBOL_NQ',
  'TWELVE_DATA_API_KEY',
  'FUTURES_API_KEY',
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
];

describe('ASSET_PROVIDER_DEFAULTS', () => {
  it('keeps Gold on Twelve Data and moves the index assets to Alpaca', () => {
    expect(ASSET_PROVIDER_DEFAULTS.GC).toEqual({ provider: 'twelvedata', symbol: 'XAU/USD' });
    expect(ASSET_PROVIDER_DEFAULTS.ES).toEqual({ provider: 'alpaca', symbol: 'SPY' });
    expect(ASSET_PROVIDER_DEFAULTS.YM).toEqual({ provider: 'alpaca', symbol: 'DIA' });
    expect(ASSET_PROVIDER_DEFAULTS.NQ).toEqual({ provider: 'alpaca', symbol: 'QQQ' });
  });

  it('covers every configured asset', () => {
    expect(CONFIGURED_ASSET_IDS).toEqual(['GC', 'ES', 'YM', 'NQ']);
  });

  // The regression this task is about: with no environment overrides at all, the
  // default provider per asset must be Gold -> Twelve Data and every index asset
  // -> Alpaca. Nasdaq must NOT resolve to Twelve Data.
  it('resolves the default provider per asset with no environment overrides', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const byId = Object.fromEntries(assetRequirements().map(r => [r.instrumentId, r.provider]));
    expect(byId).toEqual({
      GC: 'twelvedata',
      ES: 'alpaca',
      YM: 'alpaca',
      NQ: 'alpaca',
    });
    expect(assetProvider('NQ')).toBe('alpaca');
  });
});

describe('assetProviderConfig', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('returns the default for an asset, case-insensitively', () => {
    expect(assetProviderConfig('gc')).toEqual({ provider: 'twelvedata', symbol: 'XAU/USD' });
    expect(assetProvider('es')).toBe('alpaca');
    expect(assetSymbol('es')).toBe('SPY');
  });

  it('lets the environment move an asset to the other provider', () => {
    process.env.ASSET_PROVIDER_GC = 'alpaca';
    expect(assetProvider('GC')).toBe('alpaca');
  });

  it('lets the environment pin a symbol', () => {
    process.env.ASSET_SYMBOL_GC = 'GLD';
    expect(assetSymbol('GC')).toBe('GLD');
  });

  it('ignores an invalid provider override rather than guessing', () => {
    process.env.ASSET_PROVIDER_GC = 'nonsense';
    expect(assetProvider('GC')).toBe('twelvedata');
  });

  it('returns undefined for an unknown asset', () => {
    expect(assetProviderConfig('NOPE')).toBeUndefined();
  });
});

describe('display names', () => {
  it('names the assets as the card should, not by ticker', () => {
    expect(ASSET_DISPLAY_NAMES).toEqual({ GC: 'Gold', ES: 'S&P 500', YM: 'Dow', NQ: 'Nasdaq' });
    expect(assetDisplayName('NQ')).toBe('Nasdaq');
    expect(assetDisplayName('gc')).toBe('Gold');
  });

  it('falls back to the id for an unknown asset', () => {
    expect(assetDisplayName('ZZ')).toBe('ZZ');
  });
});

describe('providerCredentials', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('names the variables each provider needs, and reports the missing subset', () => {
    expect(PROVIDER_ENV_VARS.twelvedata).toEqual(['TWELVE_DATA_API_KEY']);
    expect(PROVIDER_ENV_VARS.alpaca).toEqual(['ALPACA_API_KEY', 'ALPACA_API_SECRET']);

    const alpaca = providerCredentials('alpaca');
    expect(alpaca.present).toBe(false);
    expect(alpaca.missing).toEqual(['ALPACA_API_KEY', 'ALPACA_API_SECRET']);
  });

  it('reports only the half that is missing', () => {
    process.env.ALPACA_API_KEY = 'id';
    const alpaca = providerCredentials('alpaca');
    expect(alpaca.present).toBe(false);
    expect(alpaca.missing).toEqual(['ALPACA_API_SECRET']);
  });

  it('honours the legacy Twelve Data key alias', () => {
    process.env.FUTURES_API_KEY = 'legacy';
    expect(providerCredentials('twelvedata').present).toBe(true);
  });
});

describe('assetRequirement', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('reports the resolved provider, symbol and missing variables for an asset', () => {
    const nasdaq = assetRequirement('NQ');
    expect(nasdaq).toMatchObject({
      instrumentId: 'NQ',
      name: 'Nasdaq',
      provider: 'alpaca',
      symbol: 'QQQ',
      credentialsPresent: false,
      requiredEnvVars: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
      missingEnvVars: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
    });
  });

  it('reports Gold against the Twelve Data variable', () => {
    const gold = assetRequirement('GC');
    expect(gold).toMatchObject({
      name: 'Gold',
      provider: 'twelvedata',
      symbol: 'XAU/USD',
      requiredEnvVars: ['TWELVE_DATA_API_KEY'],
      missingEnvVars: ['TWELVE_DATA_API_KEY'],
    });
  });

  it('reports credentials present once they are set', () => {
    process.env.ALPACA_API_KEY = 'id';
    process.env.ALPACA_API_SECRET = 'secret';
    const nasdaq = assetRequirement('NQ');
    expect(nasdaq?.credentialsPresent).toBe(true);
    expect(nasdaq?.missingEnvVars).toEqual([]);
  });

  it('returns undefined for an unknown asset', () => {
    expect(assetRequirement('NOPE')).toBeUndefined();
  });
});
