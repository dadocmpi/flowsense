// ============================================
// CANDLE CACHE TESTS
// ============================================
// These tests exercise the real code path by stubbing global fetch at the HTTP
// boundary — the module under test is never mocked, so the meter, the parsing
// and the cache all run for real.
//
// The invariant they protect: one request costs at most one vendor call. There is
// no candidate walk, no retry, and a small poll request reuses the payload a big
// request already paid for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearServerCaches, knownResolution, loadCandles } from '../candleCache';
import { TwelveDataError } from '../twelvedata';
import { meterSnapshot, resetCreditMeter } from '../creditMeter';

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

describe('loadCandles', () => {
  beforeEach(() => {
    clearServerCaches();
    resetCreditMeter();
    vi.restoreAllMocks();
    delete process.env.TWELVE_DATA_SYMBOL_GC;
    delete process.env.TWELVE_DATA_SYMBOL_ES;
    delete process.env.TWELVE_DATA_SYMBOL_YM;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TWELVE_DATA_SYMBOL_GC;
    delete process.env.TWELVE_DATA_SYMBOL_ES;
    delete process.env.TWELVE_DATA_SYMBOL_YM;
  });

  it('requests the one configured symbol and never probes another', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(new URL(url).searchParams.get('symbol') ?? '');
      return jsonResponse(okPayload('ES1!', ['520.25', '521.5']));
    });

    const result = await loadCandles({ instrumentId: 'ES', timeframe: '1D', limit: 300, apiKey: 'key' });

    expect(calls).toEqual(['ES1!']);
    expect(result.resolved.candidate.symbol).toBe('ES1!');
    expect(result.resolved.candidate.kind).toBe('futures');
    expect(result.candles.map(c => c.close)).toEqual([520.25, 521.5]);
  });

  it('returns an error for a failing symbol instead of trying another', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(new URL(url).searchParams.get('symbol') ?? '');
      return jsonResponse(errorPayload('not entitled to this symbol'));
    });

    await expect(loadCandles({ instrumentId: 'GC', timeframe: '1D', limit: 300, apiKey: 'key' })).rejects.toMatchObject({
      kind: 'ENTITLEMENT',
    });
    // Exactly one attempt: no fallback candidate was tried.
    expect(calls).toEqual(['GC1!']);
  });

  it('stops on a rate limit and reports the retry window', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(new URL(url).searchParams.get('symbol') ?? '');
      return jsonResponse(errorPayload('You have run out of API credits for the current minute. 13 API credits were used, with the current limit being 8.'));
    });

    const error = await loadCandles({ instrumentId: 'YM', timeframe: '1D', limit: 300, apiKey: 'key' }).catch(e => e);

    expect(error).toBeInstanceOf(TwelveDataError);
    expect((error as TwelveDataError).kind).toBe('RATE_LIMIT');
    expect((error as TwelveDataError).retryAfterMs).toBeGreaterThan(0);
    expect(calls).toEqual(['YM1!']);
  });

  it('caches a payload so a second call makes no vendor request', async () => {
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

  it('serves a small poll request from a large cached payload without a second call', async () => {
    let calls = 0;
    const closes = ['100', '101', '102', '103', '104'];
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      return jsonResponse(okPayload(new URL(url).searchParams.get('symbol') ?? '', closes));
    });

    const full = await loadCandles({ instrumentId: 'GC', timeframe: '1m', limit: 1000, apiKey: 'key' });
    const poll = await loadCandles({ instrumentId: 'GC', timeframe: '1m', limit: 2, apiKey: 'key' });

    // The poll is a slice of the payload the full load paid for.
    expect(calls).toBe(1);
    expect(full.candles).toHaveLength(5);
    expect(poll.cached).toBe(true);
    expect(poll.candles.map(c => c.close)).toEqual([103, 104]);
  });

  it('reports the configured symbol before any request has been made', () => {
    const known = knownResolution('GC');
    expect(known?.candidate.symbol).toBe('GC1!');
    expect(known?.candidate.kind).toBe('futures');
  });

  it('reports an environment override in the resolution', () => {
    process.env.TWELVE_DATA_SYMBOL_ES = 'SPY';
    const known = knownResolution('ES');
    expect(known?.candidate.symbol).toBe('SPY');
    expect(known?.candidate.kind).toBe('proxy');
  });

  it('reports an unmapped instrument as no resolution', () => {
    expect(knownResolution('NOPE')).toBeUndefined();
  });

  it('costs one credit per asset for a full load of the default timeframe', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      return jsonResponse(okPayload(new URL(url).searchParams.get('symbol') ?? '', ['100']));
    });

    // The default timeframe, one load per asset: three assets, three credits.
    for (const instrumentId of ['GC', 'ES', 'YM']) {
      await loadCandles({ instrumentId, timeframe: '15m', limit: 300, apiKey: 'key' });
    }

    expect(calls).toBe(3);
    expect(meterSnapshot().used).toBe(3);
  });

  it('serves a repeat load from cache, so a reload costs nothing', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls += 1;
      return jsonResponse(okPayload(new URL(url).searchParams.get('symbol') ?? '', ['100']));
    });

    await loadCandles({ instrumentId: 'GC', timeframe: '15m', limit: 300, apiKey: 'key' });
    await loadCandles({ instrumentId: 'GC', timeframe: '15m', limit: 300, apiKey: 'key' });

    expect(calls).toBe(1);
    expect(meterSnapshot().used).toBe(1);
  });
});
