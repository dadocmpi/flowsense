// ============================================
// ALPACA CANDLE CACHE TESTS
// ============================================
// Exercises the real code path by stubbing fetch at the HTTP boundary. The
// invariant: a full load of every Alpaca asset for one timeframe is ONE vendor
// request, and a repeat load is served from cache.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alpacaAssets,
  clearAlpacaCache,
  knownAlpacaResolution,
  loadAlpacaCandles,
  loadAlpacaCandlesBatch,
} from '../alpacaCache';
import { resetAlpacaMeter } from '../alpacaMeter';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function bar(t: string, c: string) {
  return { t, o: c, h: c, l: c, c, v: '1000' };
}

const ENV_KEYS = ['ASSET_PROVIDER_GC', 'ASSET_PROVIDER_ES', 'ASSET_SYMBOL_ES'];

describe('alpacaAssets', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('lists the Alpaca-backed assets with their symbols', () => {
    expect(alpacaAssets()).toEqual([
      { instrumentId: 'ES', symbol: 'SPY' },
      { instrumentId: 'YM', symbol: 'DIA' },
      { instrumentId: 'NQ', symbol: 'QQQ' },
    ]);
  });

  it('picks up a configuration move', () => {
    process.env.ASSET_PROVIDER_GC = 'alpaca';
    expect(alpacaAssets().map(a => a.instrumentId)).toContain('GC');
  });
});

describe('knownAlpacaResolution', () => {
  it('reports the configured symbol without a vendor call', () => {
    expect(knownAlpacaResolution('ES')?.symbol).toBe('SPY');
    expect(knownAlpacaResolution('GC')).toBeUndefined();
  });
});

describe('loadAlpacaCandlesBatch', () => {
  beforeEach(() => {
    clearAlpacaCache();
    resetAlpacaMeter();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('loads every Alpaca asset for a timeframe in ONE request', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      const symbols = (new URL(url).searchParams.get('symbols') ?? '').split(',');
      const bars: Record<string, unknown[]> = {};
      for (const symbol of symbols) bars[symbol] = [bar('2024-06-10T13:30:00Z', '100')];
      return jsonResponse({ bars });
    });

    const result = await loadAlpacaCandlesBatch({ timeframe: '15m', limit: 250, keyId: 'kid', secretKey: 'sek' });

    expect(calls).toBe(1);
    expect(result.cached).toBe(false);
    expect(Object.keys(result.byInstrument).sort()).toEqual(['ES', 'NQ', 'YM']);
  });

  it('serves a repeat batch from cache without a second request', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      const symbols = (new URL(url).searchParams.get('symbols') ?? '').split(',');
      const bars: Record<string, unknown[]> = {};
      for (const symbol of symbols) bars[symbol] = [bar('2024-06-10T13:30:00Z', '100')];
      return jsonResponse({ bars });
    });

    await loadAlpacaCandlesBatch({ timeframe: '15m', limit: 250, keyId: 'kid', secretKey: 'sek' });
    const second = await loadAlpacaCandlesBatch({ timeframe: '15m', limit: 250, keyId: 'kid', secretKey: 'sek' });

    expect(calls).toBe(1);
    expect(second.cached).toBe(true);
  });
});

describe('loadAlpacaCandles', () => {
  beforeEach(() => {
    clearAlpacaCache();
    resetAlpacaMeter();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('is served from a batch payload that already paid for the symbol', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      const symbols = (new URL(url).searchParams.get('symbols') ?? '').split(',');
      const bars: Record<string, unknown[]> = {};
      for (const symbol of symbols) bars[symbol] = [bar('2024-06-10T13:30:00Z', '100'), bar('2024-06-10T13:31:00Z', '101')];
      return jsonResponse({ bars });
    });

    await loadAlpacaCandlesBatch({ timeframe: '15m', limit: 250, keyId: 'kid', secretKey: 'sek' });
    const single = await loadAlpacaCandles({ instrumentId: 'ES', timeframe: '15m', limit: 1, keyId: 'kid', secretKey: 'sek' });

    expect(calls).toBe(1);
    expect(single.cached).toBe(true);
    // A small request is a slice of the payload already paid for.
    expect(single.candles.map(c => c.close)).toEqual([101]);
  });

  it('refuses an asset that is not an Alpaca asset', async () => {
    await expect(
      loadAlpacaCandles({ instrumentId: 'GC', timeframe: '15m', limit: 250, keyId: 'kid', secretKey: 'sek' })
    ).rejects.toMatchObject({ kind: 'SYMBOL_NOT_FOUND' });
  });
});
