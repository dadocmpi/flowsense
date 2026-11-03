// ============================================
// PER-ASSET PROVIDER CONFIGURATION TESTS
// ============================================
// The one place that decides which provider serves each asset. Its invariants:
// Gold reads Twelve Data (spot XAU/USD), the index assets read Alpaca
// (SPY/DIA/QQQ), and any asset can be moved by configuration alone.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASSET_PROVIDER_DEFAULTS,
  assetProvider,
  assetProviderConfig,
  assetSymbol,
  CONFIGURED_ASSET_IDS,
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
