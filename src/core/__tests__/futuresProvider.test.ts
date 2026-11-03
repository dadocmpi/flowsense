// ============================================
// FUTURES PROVIDER PROBE TESTS
// ============================================
// The probe tells the UI whether the server has a key. It must also say whether
// it reached the server at all: a dev server without the api/ functions is not
// the same as a deployment with no key, and the UI wording differs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFuturesCaches,
  futuresCreditState,
  futuresProvider,
  loadAlpacaBatch,
  probeFuturesProvider,
  resolvedSourceFor,
} from '../providers/futures';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('probeFuturesProvider', () => {
  beforeEach(() => {
    clearFuturesCaches();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports configured and reachable when the server has a key', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ configured: true, provider: 'twelvedata', websocket: false }));

    const result = await probeFuturesProvider();

    expect(result).toMatchObject({ configured: true, reachable: true });
    expect(futuresProvider.isConfigured()).toBe(true);
  });

  it('reports reachable but not configured when the server has no key', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ configured: false, note: 'TWELVE_DATA_API_KEY is not set' }));

    const result = await probeFuturesProvider();

    // The distinction that matters: we DID reach the server, so the UI says
    // "no data source configured" rather than "unreachable".
    expect(result).toMatchObject({ configured: false, reachable: true });
    expect(result.note).toMatch(/TWELVE_DATA_API_KEY/);
  });

  it('reports unreachable when the status route does not answer', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await probeFuturesProvider();

    expect(result).toMatchObject({ configured: false, reachable: false });
  });

  it('reports unreachable on a non-OK status rather than guessing', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({}, 500));

    const result = await probeFuturesProvider();

    expect(result).toMatchObject({ configured: false, reachable: false });
    expect(result.note).toMatch(/HTTP 500/);
  });

  it('keeps a server-known resolution for the provenance label', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        configured: true,
        instruments: [
          {
            instrumentId: 'ES',
            resolved: {
              symbol: 'SPY',
              vendorSymbol: 'SPY',
              kind: 'proxy',
              description: 'SPDR S&P 500 ETF',
            },
          },
        ],
      })
    );

    await probeFuturesProvider();

    expect(resolvedSourceFor('ES')?.kind).toBe('proxy');
    expect(resolvedSourceFor('ES')?.description).toBe('SPDR S&P 500 ETF');
  });

  it('records the credit meter state the status route reports', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        configured: true,
        credits: { limit: 8, used: 8, remaining: 0, resetAt: 1_700_000_060_000, exhausted: true, coldStart: false, reason: null },
      })
    );

    await probeFuturesProvider();

    expect(futuresCreditState()).toMatchObject({ limit: 8, used: 8, exhausted: true });
  });

  it('shares one in-flight status request between concurrent callers', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return jsonResponse({ configured: true });
    });

    await Promise.all([probeFuturesProvider(), probeFuturesProvider()]);

    // Two callers, one request: the status route costs no credits, but there is
    // no reason to ask twice.
    expect(calls).toBe(1);
  });
});

describe('loadAlpacaBatch', () => {
  beforeEach(() => {
    clearFuturesCaches();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for every Alpaca asset on one timeframe in a single request', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return jsonResponse({
        ok: true,
        provider: 'alpaca',
        timeframe: '15m',
        assets: {
          ES: { ok: true, candles: [{ datetime: '2024-06-10 13:30:00', open: 1, high: 2, low: 0, close: 1.5, volume: 10 }] },
          YM: { ok: true, candles: [{ datetime: '2024-06-10 13:30:00', open: 1, high: 2, low: 0, close: 1.5, volume: 10 }] },
        },
      });
    });

    const { byInstrument } = await loadAlpacaBatch('15m', 300);

    // ONE request for the whole timeframe, not one per asset.
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0], 'http://localhost').searchParams.get('assets')).toBe('1');
    expect(urls[0]).toContain('timeframe=15m');
    expect('candles' in byInstrument.ES).toBe(true);
    expect('candles' in byInstrument.YM).toBe(true);
  });

  it('reports a per-asset error without failing the others', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        ok: true,
        provider: 'alpaca',
        assets: {
          ES: { ok: true, candles: [{ datetime: '2024-06-10 13:30:00', open: 1, high: 2, low: 0, close: 1.5, volume: 10 }] },
          YM: { ok: false, error: { kind: 'SYMBOL_NOT_FOUND', message: 'No candles returned for DIA' } },
        },
      })
    );

    const { byInstrument } = await loadAlpacaBatch('15m', 300);

    // ES still arrives; YM carries its own error and never blocks ES.
    expect('candles' in byInstrument.ES).toBe(true);
    expect('error' in byInstrument.YM && byInstrument.YM.error.kind).toBe('SYMBOL_NOT_FOUND');
  });
});
