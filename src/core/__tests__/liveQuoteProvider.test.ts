// ============================================
// LIVE QUOTE PROVIDER TESTS
// ============================================
// The live price must never be invented. The shipped poll adapter returns a
// quote only when the route answers with a real candle, and reports null on a
// failure so the caller keeps the last real price. These also pin the interface
// a streaming adapter would slot into.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeLiveQuoteProvider,
  DEFAULT_LIVE_POLL_INTERVAL_MS,
  livePollIntervalMs,
  liveQuoteProviderFor,
  pollingLiveQuoteProvider,
  registerLiveQuoteProvider,
  resetLivePollIntervalMs,
  setLivePollIntervalMs,
} from '../providers/live';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const REQUEST = { instrumentId: 'GC', timeframe: '1m' as const };

describe('polling live quote provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the newest close as a polled quote', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        ok: true,
        candles: [
          { time: '2024-06-10T12:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
          { time: '2024-06-10T12:01:00Z', open: 1.5, high: 2, low: 1, close: 1.8, volume: 12 },
        ],
      })
    );

    const quote = await pollingLiveQuoteProvider.getQuote(REQUEST);
    expect(quote).not.toBeNull();
    expect(quote!.price).toBe(1.8);
    expect(quote!.mode).toBe('POLL');
    expect(quote!.candle?.close).toBe(1.8);
  });

  it('returns null rather than inventing a price when the route fails', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ ok: false, error: { kind: 'RATE_LIMIT' } }));
    await expect(pollingLiveQuoteProvider.getQuote(REQUEST)).resolves.toBeNull();
  });

  it('returns null when there are no candles', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ ok: true, candles: [] }));
    await expect(pollingLiveQuoteProvider.getQuote(REQUEST)).resolves.toBeNull();
  });

  it('returns null on a network failure instead of throwing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network down');
    });
    await expect(pollingLiveQuoteProvider.getQuote(REQUEST)).resolves.toBeNull();
  });
});

describe('live quote provider selection', () => {
  afterEach(() => {
    resetLivePollIntervalMs();
  });

  it('is the poll adapter by default, with no stream registered', () => {
    expect(activeLiveQuoteProvider().id).toBe('poll');
    expect(liveQuoteProviderFor('poll').id).toBe('poll');
  });

  it('lets a streaming adapter be registered and selected later', () => {
    const stream = {
      id: 'stream' as const,
      label: 'WebSocket',
      isConfigured: () => true,
      intervalMs: () => 1_000,
      getQuote: async () => null,
    };
    registerLiveQuoteProvider(stream);
    expect(activeLiveQuoteProvider().id).toBe('stream');
  });

  it('uses the default cadence until the server reports one', () => {
    resetLivePollIntervalMs();
    expect(livePollIntervalMs()).toBe(DEFAULT_LIVE_POLL_INTERVAL_MS);
    setLivePollIntervalMs(15_000);
    expect(livePollIntervalMs()).toBe(15_000);
    // A malformed value leaves the default in place.
    setLivePollIntervalMs(Number.NaN);
    expect(livePollIntervalMs()).toBe(15_000);
  });
});
