// ============================================
// SERVER ORDER BOOK ADAPTER TESTS
// ============================================
// The shipped adapter reads the resting book from Alpaca's snapshot endpoint,
// because that is the asset's own provider and the only one in this build that
// publishes a bid/ask book. These tests lock in the honest behaviours:
//
//   * no Alpaca credentials -> not configured -> no book
//   * an instrument whose provider has no book (Gold) -> null, never a fake one
//   * a configured Alpaca -> the real book, read through the request meter

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowLabel,
  resolveOrderFlowVendor,
} from '../orderflow';
import { alpacaCallsThisMinute, resetAlpacaMeter } from '../alpacaMeter';

const ENV_KEYS = ['ORDERFLOW_PROVIDER', 'ALPACA_API_KEY', 'ALPACA_API_SECRET'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SPY_SNAPSHOT = {
  SPY: {
    latestQuote: { bp: 512.34, ap: 512.36, bs: 800, as: 200, t: '2024-01-02T15:00:00.123456789Z' },
    dailyBar: { v: 42_000_000 },
  },
};

describe('resolveOrderFlowVendor', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('is none when nothing is set', () => {
    expect(resolveOrderFlowVendor()).toBe('none');
  });

  it('is alpaca by default once Alpaca is configured', () => {
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    expect(resolveOrderFlowVendor()).toBe('alpaca');
  });

  it('is none when explicitly switched off, even with credentials', () => {
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(resolveOrderFlowVendor()).toBe('none');
  });
});

describe('orderFlowConfigured', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('is false with no credentials', () => {
    expect(orderFlowConfigured()).toBe(false);
    expect(orderFlowLabel()).toBe('None');
    expect(orderFlowApiKey()).toBeNull();
  });

  it('is true only with both Alpaca credentials', () => {
    process.env.ALPACA_API_KEY = 'key';
    expect(orderFlowConfigured()).toBe(false);
    process.env.ALPACA_API_SECRET = 'secret';
    expect(orderFlowConfigured()).toBe(true);
    expect(orderFlowApiKey()).toBe('secret');
    expect(orderFlowLabel()).toBe('Alpaca (IEX)');
  });
});

describe('fetchOrderFlowReading', () => {
  beforeEach(() => {
    resetAlpacaMeter();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetAlpacaMeter();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('reads the real book for an Alpaca-backed instrument', async () => {
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    vi.stubGlobal('fetch', async () => jsonResponse(SPY_SNAPSHOT));

    const book = await fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: 'secret' });

    expect(book).not.toBeNull();
    expect(book).toMatchObject({
      bid: 512.34,
      ask: 512.36,
      bidSize: 800,
      askSize: 200,
      volume: 42_000_000,
    });
    expect(book?.at).toBe(Date.parse('2024-01-02T15:00:00.123Z'));
    expect(book?.source).toContain('SPY');
  });

  it('returns no book for Gold, whose provider publishes no book', async () => {
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOrderFlowReading({ instrumentId: 'GC', timeframe: '15m', apiKey: 'secret' })).resolves.toBeNull();
    // No vendor call is made for an instrument with no book source.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns no book for a one-sided or empty quote rather than a zero', async () => {
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    vi.stubGlobal('fetch', async () =>
      jsonResponse({ SPY: { latestQuote: { bp: 512.34, bs: 800, t: '2024-01-02T15:00:00Z' } } })
    );

    await expect(fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: 'secret' })).resolves.toBeNull();
  });

  it('counts the snapshot call against the Alpaca request meter', async () => {
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    vi.stubGlobal('fetch', async () => jsonResponse(SPY_SNAPSHOT));

    await fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: 'secret' });

    // The meter is shared with the candle calls; one snapshot is one request.
    expect(alpacaCallsThisMinute()).toBe(1);
  });
});
