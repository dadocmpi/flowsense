// ============================================
// FUTURES PROVIDER PROBE TESTS
// ============================================
// The probe tells the UI whether the server has a key. It must also say whether
// it reached the server at all: a dev server without the api/ functions is not
// the same as a deployment with no key, and the UI wording differs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFuturesCaches,
  futuresProvider,
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
});
