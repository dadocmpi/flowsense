// ============================================
// GET /api/orderflow/reading ROUTE TESTS
// ============================================
// The route is the one place the browser asks for order flow, and it decides the
// venue PER ASSET. These tests drive the real handler with the vendor boundary
// (global fetch) stubbed, so the routing, the credentials, the adapter and the
// response shape all run together. The invariants:
//
//   * a probe with no instrument costs no vendor call and reports the venue
//   * every shipped asset reads Alpaca (tape + IEX top of book) with the key
//   * Gold reads the GLD ETF proxy, and the source label says it is a proxy
//   * with no Alpaca key the card is told "not configured", never given a number
//   * a venue that fails is reported as no reading, never a fabricated one

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './reading';
import { resetAlpacaMeter } from '../_lib/alpacaMeter';
import type { ApiRequest, ApiResponse } from '../_lib/futuresShared';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

function runHandler(query: Record<string, string>): Promise<Captured> {
  const captured: Captured = { status: 0, body: {} };
  const res: ApiResponse = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body as Record<string, unknown>;
    },
    setHeader() {
      /* no-op */
    },
    end() {
      /* no-op */
    },
  };
  const req: ApiRequest = { method: 'GET', query };
  return handler(req, res).then(() => captured);
}

const ENV_KEYS = [
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
  'ORDERFLOW_PROVIDER',
  'ORDERFLOW_PROVIDER_ES',
  'ORDERFLOW_SYMBOL_GC',
];

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

function setAlpacaCreds(): void {
  process.env.ALPACA_API_KEY = 'key-id';
  process.env.ALPACA_API_SECRET = 'secret-key';
}

/** The symbol an Alpaca trades/quotes URL names, e.g. "SPY" from `symbols=SPY`. */
function symbolOf(url: string): string {
  return new URL(url).searchParams.get('symbols') ?? '';
}

describe('GET /api/orderflow/reading', () => {
  beforeEach(() => {
    clearEnv();
    resetAlpacaMeter();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    clearEnv();
    vi.restoreAllMocks();
  });

  it('answers the probe with no vendor call and names the venue', async () => {
    setAlpacaCreds();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { status, body } = await runHandler({});

    expect(status).toBe(200);
    expect(body.configured).toBe(true);
    expect(body.provider).toBe('http');
    expect(body.venue).toBe('alpaca');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports the probe as not configured when no Alpaca key is present', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { status, body } = await runHandler({});

    expect(status).toBe(200);
    expect(body.configured).toBe(false);
    expect(body.provider).toBe('none');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads an index asset on Alpaca and returns a real reading', async () => {
    setAlpacaCreds();
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/v2/stocks/trades')) {
        return jsonResponse({
          trades: {
            SPY: [
              { t: '2024-06-10T13:30:01Z', p: 101, s: 2, x: 'V' },
              { t: '2024-06-10T13:30:02Z', p: 102, s: 1, x: 'V' },
            ],
          },
          next_page_token: null,
        });
      }
      return jsonResponse({ quotes: { SPY: { t: '2024-06-10T13:30:00Z', bp: 100, bs: 3, ap: 101, as: 1 } } });
    });

    const { status, body } = await runHandler({ instrument: 'ES', timeframe: '15m' });

    expect(status).toBe(200);
    expect(body.venue).toBe('alpaca');
    expect(body.label).toBe('Alpaca');
    const reading = body.reading as { metrics: { delta: number; imbalance: number }; source: string } | null;
    expect(reading).not.toBeNull();
    expect(reading!.metrics.delta).toBeCloseTo(3, 6); // two buyer-initiated prints
    expect(reading!.metrics.imbalance).toBeCloseTo(0.5, 6);
    expect(reading!.source).toContain('Alpaca');
    expect(reading!.source).toContain('SPY');
  });

  it('reads Gold through the GLD ETF proxy and labels it as a proxy', async () => {
    setAlpacaCreds();
    let sawSymbol = '';
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/v2/stocks/trades')) {
        sawSymbol = symbolOf(url);
        return jsonResponse({
          trades: { GLD: [{ t: '2024-06-10T13:30:01Z', p: 240, s: 5, x: 'V' }] },
          next_page_token: null,
        });
      }
      return jsonResponse({ quotes: { GLD: { t: '2024-06-10T13:30:00Z', bp: 239.9, bs: 10, ap: 240.1, as: 8 } } });
    });

    const { body } = await runHandler({ instrument: 'GC', timeframe: '15m' });

    expect(sawSymbol).toBe('GLD');
    const reading = body.reading as { source: string } | null;
    expect(reading).not.toBeNull();
    expect(reading!.source).toContain('GLD');
    expect(reading!.source).toContain('proxy');
  });

  it('tells the client an asset is not configured without an Alpaca key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { body } = await runHandler({ instrument: 'ES', timeframe: '15m' });

    expect(body.configured).toBe(false);
    expect(body.venue).toBe('alpaca');
    expect(body.reading).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a failing venue as no reading, never a fabricated one', async () => {
    setAlpacaCreds();
    vi.stubGlobal('fetch', async () => jsonResponse({ message: 'rate limit exceeded' }, 429));

    const { status, body } = await runHandler({ instrument: 'ES', timeframe: '15m' });

    expect(status).toBe(200);
    expect(body.reading).toBeNull();
    expect(typeof body.note).toBe('string');
  });

  it('never echoes the vendor raw error text in the note', async () => {
    setAlpacaCreds();
    vi.stubGlobal('fetch', async () =>
      jsonResponse({ message: 'internal request id 0xdeadbeef key=secret' }, 401)
    );

    const { body } = await runHandler({ instrument: 'ES', timeframe: '15m' });

    expect(body.reading).toBeNull();
    expect(body.note).not.toContain('0xdeadbeef');
    expect(body.note).not.toContain('key=secret');
    expect(body.note).toBe('The Alpaca credentials for order flow are not accepted.');
  });
});
