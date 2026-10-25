// ============================================
// CANDLE CACHE + SYMBOL RESOLUTION TESTS
// ============================================
// The resolver decides what the app reads. These tests exercise the real code
// path by stubbing global fetch at the HTTP boundary — the module under test is
// never mocked, so the parsing and fallback logic run for real.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearServerCaches, knownResolution, loadCandles } from '../candleCache';
import { TwelveDataError } from '../twelvedata';

/** One real-looking daily bar, in the vendor's own shape. */
function bar(datetime: string, close: string) {
  return { datetime, open: close, high: close, low: close, close, volume: '100' };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A vendor payload with real candles for one symbol. */
function okPayload(symbol: string, closes = ['100']): unknown {
  return {
    meta: { symbol, interval: '1day', exchange: 'NASDAQ', type: 'ETF' },
    values: closes.map((close, index) => bar(`2024-06-${String(10 + index).padStart(2, '0')}`, close)),
    status: 'ok',
  };
}

function errorPayload(message: string): unknown {
  return { status: 'error', code: 404, message };
}

describe('loadCandles symbol resolution', () => {
  beforeEach(() => {
    clearServerCaches();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('walks past an unentitled futures contract and settles on the proxy', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const symbol = new URL(url).searchParams.get('symbol') ?? '';
      calls.push(symbol);
      if (symbol === 'ES1!') return jsonResponse(errorPayload('not entitled to this symbol'));
      if (symbol === 'SPX') return jsonResponse(errorPayload('invalid symbol'));
      return jsonResponse(okPayload('SPY', ['520.25', '521.5']));
    });

    const result = await loadCandles({ instrumentId: 'ES', timeframe: '1D', limit: 300, apiKey: 'key' });

    // The futures contract and the index were tried, in order, before the ETF.
    expect(calls).toEqual(['ES1!', 'SPX', 'SPY']);
    expect(result.resolved.candidate.symbol).toBe('SPY');
    expect(result.resolved.candidate.kind).toBe('proxy');
    expect(result.resolved.tried.map(t => t.symbol)).toEqual(['ES1!', 'SPX']);
    expect(result.candles.map(c => c.close)).toEqual([520.25, 521.5]);
  });

  it('uses the real futures contract when the plan entitles it', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const symbol = new URL(url).searchParams.get('symbol') ?? '';
      calls.push(symbol);
      return jsonResponse(okPayload(symbol, ['2330.5']));
    });

    const result = await loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' });

    expect(calls).toEqual(['GC1!']);
    expect(result.resolved.candidate.kind).toBe('futures');
    expect(result.resolved.vendorSymbol).toBe('GC1!');
  });

  it('stops the walk on a rate limit instead of burning more candidates', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(new URL(url).searchParams.get('symbol') ?? '');
      return jsonResponse(errorPayload('You have run out of credits'));
    });

    await expect(loadCandles({ instrumentId: 'YM', timeframe: '1D', limit: 300, apiKey: 'key' })).rejects.toThrow(
      /credits/i
    );
    expect(calls).toEqual(['YM1!']);
  });

  it('reports an honest failure when no candidate returns data', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(errorPayload('invalid symbol')));

    await expect(loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' })).rejects.toBeInstanceOf(
      TwelveDataError
    );
    await expect(
      loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' })
    ).rejects.toThrow(/no symbol for GC/i);
  });

  it('does not blame the plan when every candidate failed for a vendor-side reason', async () => {
    // A bad key or a vendor outage is not an entitlement problem. Calling it one
    // would send the user off to change their subscription for nothing.
    vi.stubGlobal('fetch', async () => jsonResponse({ status: 'error', code: 401, message: 'apikey is incorrect' }));

    await expect(loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'bad' })).rejects.toMatchObject(
      { kind: 'UPSTREAM' }
    );
  });

  it('reports an entitlement problem when at least one candidate was actually refused', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(errorPayload('not entitled to this symbol')));

    await expect(loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' })).rejects.toMatchObject({
      kind: 'ENTITLEMENT',
    });
  });

  it('caches a resolved payload so a second call makes no vendor request', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      return jsonResponse(okPayload(new URL(url).searchParams.get('symbol') ?? '', ['2330.5']));
    });

    const first = await loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' });
    const second = await loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' });

    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.candles).toEqual(first.candles);
  });

  it('remembers the resolution so the status route can report it', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      jsonResponse(okPayload(new URL(url).searchParams.get('symbol') ?? '', ['2330.5']))
    );

    await loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' });
    const known = knownResolution('GC');

    expect(known?.candidate.symbol).toBe('GC1!');
    expect(known?.candidate.kind).toBe('futures');
  });

  it('reports a symbol that returns zero candles as tried, not as working', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const symbol = new URL(url).searchParams.get('symbol') ?? '';
      calls.push(symbol);
      // First candidate exists but has no bars at this interval.
      if (symbol === 'GC1!') return jsonResponse({ meta: { symbol }, values: [], status: 'ok' });
      return jsonResponse(okPayload('XAU/USD', ['2330.5']));
    });

    const result = await loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' });

    expect(calls).toEqual(['GC1!', 'XAU/USD']);
    expect(result.resolved.candidate.kind).toBe('proxy');
    expect(result.resolved.tried[0].reason).toMatch(/no candles/i);
  });
});
