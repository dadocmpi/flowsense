// ============================================
// ALPACA ORDER-FLOW ADAPTER TESTS
// ============================================
// The Alpaca adapter turns a raw tape + quote timeline into the classified
// buy/sell volume the strength bar draws. It must classify with the prevailing
// quote, fall back to the tick rule inside the spread, and — crucially — when the
// market is CLOSED, anchor the rolling window to the LAST trade rather than the
// wall clock, so the panel shows the last session's final reading instead of an
// empty window.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alpacaFeed,
  alpacaOrderFlowConfigured,
  alpacaOrderFlowSymbolFor,
  bookFromQuote,
  buildAlpacaOrderFlowReading,
  classifyAlpacaTape,
  latestQuote,
  summarizeTape,
  type AlpacaQuoteRow,
  type AlpacaTrade,
} from '../alpacaOrderflow';
import { resetAlpacaMeter } from '../alpacaMeter';

const KEY_ENV = ['ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY', 'ALPACA_API_KEY', 'ALPACA_API_SECRET'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const name of KEY_ENV) saved[name] = process.env[name];
  resetAlpacaMeter();
});
afterEach(() => {
  for (const name of KEY_ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** ISO string a given number of seconds after a fixed epoch. */
const T0 = Date.parse('2026-11-06T15:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

describe('classifyAlpacaTape', () => {
  it('classifies a print at the ask as a buyer aggressor and at the bid as a seller', () => {
    const quotes: AlpacaQuoteRow[] = [{ t: at(0), bp: 100, bs: 500, ap: 101, as: 500 }];
    const trades: AlpacaTrade[] = [
      { t: at(1), p: 101, s: 10 }, // at the ask -> BUY
      { t: at(2), p: 100, s: 4 }, // at the bid -> SELL
    ];

    const classified = classifyAlpacaTape(trades, quotes);
    expect(classified.map(trade => trade.side)).toEqual(['BUY', 'SELL']);
    expect(classified.map(trade => trade.size)).toEqual([10, 4]);
  });

  it('uses the prevailing quote, not the latest one, for each trade', () => {
    const quotes: AlpacaQuoteRow[] = [
      { t: at(0), bp: 100, bs: 500, ap: 101, as: 500 },
      { t: at(10), bp: 200, bs: 500, ap: 201, as: 500 },
    ];
    const trades: AlpacaTrade[] = [
      { t: at(5), p: 101, s: 7 }, // quote at t=0 is in force -> BUY
      { t: at(15), p: 200, s: 3 }, // quote at t=10 is in force -> SELL
    ];

    expect(classifyAlpacaTape(trades, quotes).map(trade => trade.side)).toEqual(['BUY', 'SELL']);
  });

  it('falls back to the tick rule inside the spread', () => {
    const quotes: AlpacaQuoteRow[] = [{ t: at(0), bp: 100, bs: 500, ap: 102, as: 500 }];
    const trades: AlpacaTrade[] = [
      { t: at(1), p: 101, s: 5 }, // inside the spread, no prior price -> UNKNOWN, dropped
      { t: at(2), p: 101.5, s: 5 }, // uptick -> BUY
      { t: at(3), p: 101, s: 5 }, // downtick -> SELL
    ];

    const classified = classifyAlpacaTape(trades, quotes);
    expect(classified.map(trade => trade.side)).toEqual(['BUY', 'SELL']);
  });

  it('drops non-positive sizes and unparseable rows rather than guessing', () => {
    const quotes: AlpacaQuoteRow[] = [{ t: at(0), bp: 100, bs: 1, ap: 101, as: 1 }];
    const trades: AlpacaTrade[] = [
      { t: at(1), p: 101, s: 0 },
      { t: 'not-a-date', p: 101, s: 5 },
      { t: at(3), p: 101, s: 2 },
    ];

    const classified = classifyAlpacaTape(trades, quotes);
    expect(classified).toHaveLength(1);
    expect(classified[0].size).toBe(2);
  });
});

describe('summarizeTape', () => {
  const classified = classifyAlpacaTape(
    [
      { t: at(0), p: 101, s: 30 },
      { t: at(1), p: 100, s: 10 },
    ],
    [{ t: at(-1), bp: 100, bs: 1, ap: 101, as: 1 }]
  );

  it('sums buy/sell size, delta, imbalance and buy share over the window', () => {
    const metrics = summarizeTape(classified, T0 + 2000, 60_000);
    expect(metrics.buyVolume).toBe(30);
    expect(metrics.sellVolume).toBe(10);
    expect(metrics.delta).toBe(20);
    expect(metrics.imbalance).toBeCloseTo(0.5, 10);
    expect(metrics.buyShare).toBeCloseTo(0.75, 10);
    expect(metrics.tradeCount).toBe(2);
  });

  it('keeps the session CVD across the whole tape even when the window is empty', () => {
    // Window ends well after the last trade, so the window is empty but the CVD
    // still reflects the whole session.
    const metrics = summarizeTape(classified, T0 + 10 * 60_000, 60_000);
    expect(metrics.buyVolume).toBe(0);
    expect(metrics.sellVolume).toBe(0);
    expect(metrics.tradeCount).toBe(0);
    expect(metrics.cvd).toBe(20);
  });

  it('reports an empty window honestly (0.5 buy share, zero imbalance)', () => {
    const metrics = summarizeTape([], T0, 60_000);
    expect(metrics.imbalance).toBe(0);
    expect(metrics.buyShare).toBe(0.5);
    expect(metrics.cvd).toBe(0);
    expect(metrics.lastTradeAt).toBeNull();
  });

  it('anchoring the window to the last trade yields the last session reading when closed', () => {
    // A closed market: the adapter anchors `now` to the last trade, so the window
    // still covers the session's tape instead of collapsing to empty.
    const lastTradeAt = classified[classified.length - 1].timestamp;
    const metrics = summarizeTape(classified, lastTradeAt, 60_000);
    expect(metrics.tradeCount).toBe(2);
    expect(metrics.buyVolume).toBe(30);
  });
});

describe('bookFromQuote', () => {
  it('builds a two-sided quote bar from the top of book', () => {
    const book = bookFromQuote({ t: at(0), bp: 100, bs: 800, ap: 101, as: 200 });
    expect(book).not.toBeNull();
    expect(book!.bidSize).toBe(800);
    expect(book!.askSize).toBe(200);
    expect(book!.imbalance).toBeCloseTo(0.6, 10);
  });

  it('is null when the quote carries no size, rather than a fabricated book', () => {
    expect(bookFromQuote({ t: at(0), bp: 100, bs: 0, ap: 101, as: 0 })).toBeNull();
    expect(bookFromQuote(null)).toBeNull();
  });
});

describe('latestQuote', () => {
  it('returns the newest quote from an unsorted list', () => {
    const rows: AlpacaQuoteRow[] = [
      { t: at(0), bp: 100, bs: 1, ap: 101, as: 1 },
      { t: at(20), bp: 105, bs: 1, ap: 106, as: 1 },
      { t: at(10), bp: 102, bs: 1, ap: 103, as: 1 },
    ];
    expect(latestQuote(rows)!.bp).toBe(105);
  });

  it('is null for an empty list', () => {
    expect(latestQuote([])).toBeNull();
  });
});

describe('configuration', () => {
  it('reads the feed from ALPACA_FEED, defaulting to the free IEX feed', () => {
    delete process.env.ALPACA_FEED;
    expect(alpacaFeed()).toBe('iex');
    process.env.ALPACA_FEED = 'sip';
    expect(alpacaFeed()).toBe('sip');
    process.env.ALPACA_FEED = 'nonsense';
    expect(alpacaFeed()).toBe('iex');
    delete process.env.ALPACA_FEED;
  });

  it('maps each index asset to its ETF proxy and Gold to GLD', () => {
    expect(alpacaOrderFlowSymbolFor('ES')).toBe('SPY');
    expect(alpacaOrderFlowSymbolFor('YM')).toBe('DIA');
    expect(alpacaOrderFlowSymbolFor('NQ')).toBe('QQQ');
    expect(alpacaOrderFlowSymbolFor('GC')).toBe('GLD');
    expect(alpacaOrderFlowSymbolFor('ZZ')).toBeNull();
  });

  it('honours a per-asset symbol override', () => {
    process.env.ORDERFLOW_SYMBOL_NQ = 'qqq';
    try {
      expect(alpacaOrderFlowSymbolFor('NQ')).toBe('QQQ');
    } finally {
      delete process.env.ORDERFLOW_SYMBOL_NQ;
    }
  });

  it('is not configured until both credentials are present', () => {
    delete process.env.ALPACA_API_KEY_ID;
    delete process.env.ALPACA_API_SECRET_KEY;
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_API_SECRET;
    expect(alpacaOrderFlowConfigured()).toBe(false);
    process.env.ALPACA_API_KEY_ID = 'id';
    expect(alpacaOrderFlowConfigured()).toBe(false);
    process.env.ALPACA_API_SECRET_KEY = 'secret';
    expect(alpacaOrderFlowConfigured()).toBe(true);
  });
});

/** One stubbed Alpaca response for a path, chosen by which endpoint it is. */
function stubAlpaca(trades: AlpacaTrade[], quotes: AlpacaQuoteRow[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/trades') ? { trades: { QQQ: trades } } : { quotes: { QQQ: quotes } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    })
  );
}

describe('buildAlpacaOrderFlowReading', () => {
  beforeEach(() => {
    process.env.ALPACA_API_KEY_ID = 'id';
    process.env.ALPACA_API_SECRET_KEY = 'secret';
    delete process.env.ALPACA_FEED;
  });

  it('builds a real reading from the tape and flags a closed session', async () => {
    // Sunday: the US equity session is closed.
    const now = Date.parse('2026-11-08T15:00:00.000Z');
    stubAlpaca(
      [
        { t: '2026-11-06T19:00:00Z', p: 101, s: 30 },
        { t: '2026-11-06T19:00:01Z', p: 100, s: 10 },
      ],
      [{ t: '2026-11-06T18:59:59Z', bp: 100, bs: 700, ap: 101, as: 300 }]
    );

    const reading = await buildAlpacaOrderFlowReading({ symbol: 'QQQ', windowMs: 60_000, now });

    expect(reading.provider).toBe('alpaca');
    expect(reading.instrument).toBe('QQQ');
    expect(reading.feed).toBe('iex');
    expect(reading.proxy).toBe(true);
    expect(reading.sessionClosed).toBe(true);
    expect(reading.session!.buyVolume).toBe(30);
    expect(reading.session!.sellVolume).toBe(10);
    expect(reading.session!.delta).toBe(20);
    expect(reading.metrics.absorption).toBeNull();
    expect(reading.gauge.label).toBe('BUY');
    expect(reading.book!.bidSize).toBe(700);
    expect(reading.book!.askSize).toBe(300);
    // Anchored to the last trade, so the closed-session window still holds the tape.
    expect(reading.lastTradeAt).toBe(Date.parse('2026-11-06T19:00:01Z'));
  });
});
