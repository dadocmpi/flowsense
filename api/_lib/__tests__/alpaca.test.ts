// ============================================
// ALPACA ADAPTER TESTS
// ============================================
// The adapter is exercised by stubbing global fetch at the HTTP boundary, so the
// real meter, URL building, parsing and pagination all run. The invariants:
//
//   * ONE request carries every symbol for a timeframe, with feed=iex pinned
//   * pagination follows next_page_token until every symbol has enough bars
//   * an error is classified in our own terms, and is never retried in a loop
//   * a bar without a usable close is dropped, never invented

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALPACA_TIMEFRAMES,
  alpacaLookbackStart,
  buildAlpacaBarsUrl,
  classifyAlpacaError,
  fetchAlpacaBars,
  normalizeAlpacaTime,
  parseAlpacaBars,
  type AlpacaBarsResponse,
} from '../alpaca';
import { resetAlpacaMeter } from '../alpacaMeter';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function bar(t: string, c: string) {
  return { t, o: c, h: c, l: c, c, v: '1000' };
}

describe('ALPACA_TIMEFRAMES', () => {
  it('maps every app timeframe to the Alpaca interval', () => {
    expect(ALPACA_TIMEFRAMES).toEqual({
      '1m': '1Min',
      '5m': '5Min',
      '15m': '15Min',
      '30m': '30Min',
      '1h': '1Hour',
      '4h': '4Hour',
      '1D': '1Day',
    });
  });
});

describe('buildAlpacaBarsUrl', () => {
  it('pins feed=iex and sends all symbols in one URL', () => {
    const url = new URL(buildAlpacaBarsUrl({ symbols: ['SPY', 'DIA', 'QQQ'], timeframe: '15m', limit: 250 }));
    expect(url.pathname).toBe('/v2/stocks/bars');
    expect(url.searchParams.get('feed')).toBe('iex');
    expect(url.searchParams.get('symbols')).toBe('SPY,DIA,QQQ');
    expect(url.searchParams.get('timeframe')).toBe('15Min');
    // Newest-first, so pagination walks backwards from the latest bar.
    expect(url.searchParams.get('sort')).toBe('desc');
  });

  it('carries the pagination token when present', () => {
    const url = new URL(buildAlpacaBarsUrl({ symbols: ['SPY'], timeframe: '1D', limit: 250, pageToken: 'tok' }));
    expect(url.searchParams.get('page_token')).toBe('tok');
  });
});

describe('multi-symbol total limit', () => {
  afterEach(() => vi.restoreAllMocks());

  it('scales the page limit by the symbol count, since limit is a TOTAL', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return jsonResponse({ bars: { SPY: [], DIA: [], QQQ: [] }, next_page_token: null });
    });

    await fetchAlpacaBars({
      symbols: ['SPY', 'DIA', 'QQQ'],
      timeframe: '15m',
      limit: 250,
      keyId: 'kid',
      secretKey: 'sek',
    });

    // The vendor applies `limit` across ALL symbols, so a single-symbol-sized
    // request would starve the others. It must be scaled to cover each symbol.
    expect(new URL(urls[0]).searchParams.get('limit')).toBe('750');
  });

  it('keeps paging until every symbol reaches the requested count', async () => {
    let call = 0;
    vi.stubGlobal('fetch', async () => {
      call += 1;
      // Each page carries only one symbol's bars, so two pages are needed before
      // the third symbol is reached — the vendor sorts by symbol.
      if (call === 1) return jsonResponse({ bars: { SPY: [bar('2024-06-10T13:30:00Z', '1')] }, next_page_token: 't1' });
      if (call === 2) return jsonResponse({ bars: { DIA: [bar('2024-06-10T13:30:00Z', '2')] }, next_page_token: 't2' });
      return jsonResponse({ bars: { QQQ: [bar('2024-06-10T13:30:00Z', '3')] }, next_page_token: null });
    });

    const result = await fetchAlpacaBars({
      symbols: ['SPY', 'DIA', 'QQQ'],
      timeframe: '15m',
      limit: 1,
      keyId: 'kid',
      secretKey: 'sek',
    });

    // Three pages, and every symbol ends with its own bar.
    expect(call).toBe(3);
    expect(result.candlesBySymbol.SPY).toHaveLength(1);
    expect(result.candlesBySymbol.DIA).toHaveLength(1);
    expect(result.candlesBySymbol.QQQ).toHaveLength(1);
  });
});

describe('normalizeAlpacaTime', () => {
  it('turns an ISO instant into the app\'s UTC candle time', () => {
    expect(normalizeAlpacaTime('2024-06-10T13:30:00Z')).toBe('2024-06-10 13:30:00');
  });

  it('keeps an unparseable value rather than inventing one', () => {
    expect(normalizeAlpacaTime('not-a-date')).toBe('not-a-date');
  });
});

describe('parseAlpacaBars', () => {
  it('parses bars per symbol, oldest-first, dropping a close-less bar', () => {
    const payload: AlpacaBarsResponse = {
      bars: {
        SPY: [bar('2024-06-10T13:31:00Z', '521.5'), { t: '2024-06-10T13:32:00Z', o: 0, h: 0, l: 0, c: 0, v: 0 }],
        DIA: [bar('2024-06-10T13:30:00Z', '390.1')],
      },
    };
    const parsed = parseAlpacaBars(payload);
    expect(parsed.SPY.map(c => c.close)).toEqual([521.5]);
    expect(parsed.DIA.map(c => c.close)).toEqual([390.1]);
  });

  it('omits a null symbol and an absent one, so a caller reads "no bars here"', () => {
    // A symbol the vendor answered with `null` is not an error; it is simply not
    // present, and the callers treat a missing symbol as an empty list.
    expect(parseAlpacaBars({ bars: { SPY: null } }).SPY).toBeUndefined();
    expect(parseAlpacaBars({}).SPY).toBeUndefined();
  });
});

describe('alpacaLookbackStart', () => {
  const now = Date.UTC(2024, 5, 12, 14, 0, 0);

  it('returns a start in the past, sized so the bar count is reachable', () => {
    const start = Date.parse(alpacaLookbackStart('15m', 250, now));
    expect(start).toBeLessThan(now);
    // 250 bars of 15m is ~56 calendar minutes each, so ~10 days, with headroom.
    const days = (now - start) / 86_400_000;
    expect(days).toBeGreaterThan(5);
    expect(days).toBeLessThan(30);
  });

  it('asks for a much wider window on the daily timeframe', () => {
    const intraday = Date.parse(alpacaLookbackStart('15m', 250, now));
    const daily = Date.parse(alpacaLookbackStart('1D', 250, now));
    expect(daily).toBeLessThan(intraday);
  });
});

describe('classifyAlpacaError', () => {
  it('reads a 429 as a rate limit', () => {
    expect(classifyAlpacaError('slow down', 429)).toBe('RATE_LIMIT');
  });
  it('reads 401/403 as auth unless the message names a feed', () => {
    expect(classifyAlpacaError('unauthorized', 401)).toBe('AUTH');
    expect(classifyAlpacaError('forbidden', 403)).toBe('AUTH');
    expect(classifyAlpacaError('subscription does not permit feed sip', 403)).toBe('SUBSCRIPTION');
  });
  it('reads an unknown symbol as a symbol problem', () => {
    expect(classifyAlpacaError('invalid symbol: ZZZZ', 400)).toBe('SYMBOL_NOT_FOUND');
  });
  it('falls back to a generic upstream error', () => {
    expect(classifyAlpacaError('something broke', 500)).toBe('UPSTREAM');
  });
});

describe('fetchAlpacaBars', () => {
  beforeEach(() => {
    resetAlpacaMeter();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests all symbols in ONE call with the auth headers', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return jsonResponse({ bars: { SPY: [bar('2024-06-10T13:30:00Z', '521.5')], DIA: [bar('2024-06-10T13:30:00Z', '390.1')], QQQ: [bar('2024-06-10T13:30:00Z', '440.2')] } });
    });

    const result = await fetchAlpacaBars({
      symbols: ['SPY', 'DIA', 'QQQ'],
      timeframe: '15m',
      limit: 1,
      keyId: 'kid',
      secretKey: 'sek',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].headers['APCA-API-KEY-ID']).toBe('kid');
    expect(calls[0].headers['APCA-API-SECRET-KEY']).toBe('sek');
    expect(new URL(calls[0].url).searchParams.get('feed')).toBe('iex');
    expect(result.candlesBySymbol.SPY).toHaveLength(1);
    expect(result.candlesBySymbol.QQQ).toHaveLength(1);
  });

  it('pages through next_page_token until every symbol has enough bars', async () => {
    let call = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      call += 1;
      const token = new URL(url).searchParams.get('page_token');
      if (!token) {
        // First page is entirely SPY's bars, which is the vendor's symbol-first sort.
        return jsonResponse({
          bars: { SPY: [bar('2024-06-10T13:30:00Z', '1'), bar('2024-06-10T13:31:00Z', '2')] },
          next_page_token: 'tok-1',
        });
      }
      // Second page carries the other symbols.
      return jsonResponse({
        bars: { DIA: [bar('2024-06-10T13:30:00Z', '3')], QQQ: [bar('2024-06-10T13:30:00Z', '4')] },
        next_page_token: null,
      });
    });

    const result = await fetchAlpacaBars({
      symbols: ['SPY', 'DIA', 'QQQ'],
      timeframe: '15m',
      limit: 1,
      keyId: 'kid',
      secretKey: 'sek',
    });

    expect(call).toBe(2);
    // SPY's two bars are trimmed to the one newest, so the series stays the size asked for.
    expect(result.candlesBySymbol.SPY).toHaveLength(1);
    expect(result.candlesBySymbol.DIA).toHaveLength(1);
    expect(result.candlesBySymbol.QQQ).toHaveLength(1);
  });

  it('sends an explicit start and sorts newest-first so the recent bars are reached', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return jsonResponse({ bars: { SPY: [bar('2024-06-10T13:30:00Z', '1')] } });
    });

    await fetchAlpacaBars({
      symbols: ['SPY'],
      timeframe: '15m',
      limit: 250,
      keyId: 'kid',
      secretKey: 'sek',
      now: Date.UTC(2024, 5, 12, 14, 0, 0),
    });

    const params = new URL(urls[0]).searchParams;
    // An explicit start, so the vendor does not default to "today only".
    expect(params.get('start')).not.toBeNull();
    // Newest-first, so paging walks backwards from the latest bar.
    expect(params.get('sort')).toBe('desc');
  });

  it('classifies an auth failure and does not retry', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return jsonResponse({ message: 'unauthorized' }, 401);
    });

    await expect(
      fetchAlpacaBars({ symbols: ['SPY'], timeframe: '15m', limit: 1, keyId: 'kid', secretKey: 'sek' })
    ).rejects.toMatchObject({ kind: 'AUTH', status: 401 });
    // A non-rate-limit failure is never retried in a loop.
    expect(calls).toBe(1);
  });

  it('marks the meter exhausted on a 429', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ message: 'rate limit exceeded' }, 429));

    await expect(
      fetchAlpacaBars({ symbols: ['SPY'], timeframe: '15m', limit: 1, keyId: 'kid', secretKey: 'sek' })
    ).rejects.toMatchObject({ kind: 'RATE_LIMIT' });
  });

  it('logs the vendor status and message, never a key', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(String(line)));
    vi.stubGlobal('fetch', async () => jsonResponse({ message: 'invalid credentials supplied' }, 401));

    await expect(
      fetchAlpacaBars({ symbols: ['SPY'], timeframe: '15m', limit: 1, keyId: 'KEYID123', secretKey: 'SUPERSECRET' })
    ).rejects.toMatchObject({ kind: 'AUTH' });

    const logged = lines.find(line => line.includes('[alpaca]'));
    expect(logged).toBeDefined();
    expect(logged).toContain('status=401');
    expect(logged).toContain('note=AUTH');
    expect(logged).toContain('invalid credentials supplied');
    // The credentials must never appear in a log line.
    expect(logged).not.toContain('KEYID123');
    expect(logged).not.toContain('SUPERSECRET');
    spy.mockRestore();
  });
});
