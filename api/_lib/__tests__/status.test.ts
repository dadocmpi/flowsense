// ============================================
// STATUS ROUTE TESTS
// ============================================
// /api/futures/status is what the client's asset card reads to explain a missing
// source. These tests lock in the regression this task is about: with no
// environment overrides, Gold resolves to Twelve Data and every index asset —
// including Nasdaq — resolves to Alpaca, and each asset carries its OWN provider
// and the exact credential variable it is missing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import handler from '../../futures/status';
import { clearServerCaches } from '../candleCache';
import { clearAlpacaCache } from '../alpacaCache';
import { resetCreditMeter } from '../creditMeter';
import { resetAlpacaMeter } from '../alpacaMeter';

function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
    },
    setHeader() {
      /* no-op */
    },
    end() {
      /* no-op */
    },
  };
  return { res, captured };
}

interface StatusBody {
  configured: boolean;
  note: string;
  instruments: Array<{
    instrumentId: string;
    name: string;
    provider: string;
    symbol: string;
    credentialsPresent: boolean;
    requiredEnvVars: string[];
    missingEnvVars: string[];
  }>;
  providers: {
    twelvedata: { configured: boolean; missingEnvVars: string[] };
    alpaca: { configured: boolean; missingEnvVars: string[] };
  };
}

const ENV_KEYS = [
  'TWELVE_DATA_API_KEY',
  'FUTURES_API_KEY',
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
  'ASSET_PROVIDER_GC',
  'ASSET_PROVIDER_ES',
  'ASSET_PROVIDER_YM',
  'ASSET_PROVIDER_NQ',
  'ASSET_SYMBOL_GC',
  'ASSET_SYMBOL_ES',
  'ASSET_SYMBOL_YM',
  'ASSET_SYMBOL_NQ',
  'FUTURES_PROVIDER',
];

describe('GET /api/futures/status', () => {
  beforeEach(() => {
    clearServerCaches();
    clearAlpacaCache();
    resetCreditMeter();
    resetAlpacaMeter();
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  function get(): StatusBody {
    const { res, captured } = makeRes();
    handler({ method: 'GET', query: {} }, res);
    return captured.body as StatusBody;
  }

  it('resolves Gold to Twelve Data and every index asset to Alpaca by default', () => {
    const body = get();
    const byId = Object.fromEntries(body.instruments.map(i => [i.instrumentId, i]));

    expect(byId.GC.provider).toBe('twelvedata');
    expect(byId.GC.symbol).toBe('XAU/USD');
    expect(byId.ES.provider).toBe('alpaca');
    expect(byId.ES.symbol).toBe('SPY');
    expect(byId.YM.provider).toBe('alpaca');
    expect(byId.YM.symbol).toBe('DIA');
    expect(byId.NQ.provider).toBe('alpaca');
    expect(byId.NQ.symbol).toBe('QQQ');
  });

  it('does not resolve Nasdaq to Twelve Data', () => {
    const nasdaq = get().instruments.find(i => i.instrumentId === 'NQ')!;
    expect(nasdaq.provider).not.toBe('twelvedata');
  });

  it('names each asset as the card should, not by ticker', () => {
    const body = get();
    const byId = Object.fromEntries(body.instruments.map(i => [i.instrumentId, i.name]));
    expect(byId).toEqual({ GC: 'Gold', ES: 'S&P 500', YM: 'Dow', NQ: 'Nasdaq' });
  });

  it('reports, per asset, exactly which credential variable is missing', () => {
    const body = get();
    const byId = Object.fromEntries(body.instruments.map(i => [i.instrumentId, i]));

    expect(byId.GC.missingEnvVars).toEqual(['TWELVE_DATA_API_KEY']);
    expect(byId.NQ.missingEnvVars).toEqual(['ALPACA_API_KEY', 'ALPACA_API_SECRET']);
    expect(byId.NQ.credentialsPresent).toBe(false);
    // Each asset's variables belong to ITS provider, never another's.
    expect(byId.NQ.requiredEnvVars).not.toContain('TWELVE_DATA_API_KEY');
    expect(byId.GC.requiredEnvVars).not.toContain('ALPACA_API_KEY');
  });

  it('reports Nasdaq credentials present once the Alpaca pair is set', () => {
    process.env.ALPACA_API_KEY = 'id';
    process.env.ALPACA_API_SECRET = 'secret';
    const body = get();
    const nasdaq = body.instruments.find(i => i.instrumentId === 'NQ')!;
    expect(nasdaq.credentialsPresent).toBe(true);
    expect(nasdaq.missingEnvVars).toEqual([]);
    expect(body.providers.alpaca.configured).toBe(true);
  });

  it('never includes a credential value, only names', () => {
    process.env.TWELVE_DATA_API_KEY = 'super-secret-twelve';
    process.env.ALPACA_API_KEY = 'super-secret-alpaca-id';
    process.env.ALPACA_API_SECRET = 'super-secret-alpaca-secret';
    const serialized = JSON.stringify(get());
    expect(serialized).not.toContain('super-secret');
  });
});
