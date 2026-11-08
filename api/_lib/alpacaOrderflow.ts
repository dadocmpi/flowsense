// ============================================
// ALPACA ORDER FLOW ADAPTER (server-side)
// ============================================
// The order-flow source for the EQUITY-INDEX assets. Binance has no market for
// NQ/ES/YM, so the index order flow is read from the same venue that already
// serves their candles: Alpaca, through the liquid ETF proxies SPY / DIA / QQQ.
//
// What Alpaca's market data gives us, and what it does not:
//
//   * a real TAPE (/v2/stocks/trades) with a real traded size per print
//   * a real TOP-OF-BOOK QUOTE (/v2/stocks/quotes): best bid/ask and their sizes
//   * NO depth ladder — Alpaca publishes no multi-level book, so the "book"
//     pressure here is the two-sided best quote, not a depth book
//
// Each trade is classified as buyer- or seller-initiated by the QUOTE that was
// standing when it printed (price >= ask -> buy, price <= bid -> sell); inside
// the spread the tick rule applies. That classification lives in the pure
// src/core/orderflow.ts module and is unit tested there — this file only turns
// vendor payloads into the inputs it needs.
//
// The IEX feed is used by default. It is a single exchange, so the volume is a
// fraction of consolidated volume; the UI says so and never calls it
// consolidated. The feed is configurable (ALPACA_FEED=iex|sip).
//
// Nothing here is synthesised: an empty tape yields a zero-volume reading with
// an honest empty state, and an unreachable venue throws so the route can report
// it as unavailable rather than inventing a number.
//
// Every request goes through the shared Alpaca request meter
// (api/_lib/alpacaMeter.ts), so a call that skips the meter is impossible.

import {
  AlpacaError,
  classifyAlpacaError,
  logAlpacaRequest,
} from './alpaca.js';
import {
  alpacaMeter,
  markAlpacaExhausted,
  noteAlpacaCall,
  recordAlpacaRequest,
} from './alpacaMeter.js';
import { CreditLimitError } from './rateMeter.js';
import { buildFlowGauge, classifyTrade, cvdSlope } from '../../src/core/orderflow.js';
import { usEquitySessionState } from '../../src/core/marketSessions.js';
import type { OrderFlowBook, OrderFlowReading } from '../../src/core/types.js';

/** The venue name shown in the provenance line. */
export const ALPACA_ORDERFLOW_VENUE = 'Alpaca';

/** The Alpaca market-data base URL. */
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

/** The feed, from ALPACA_FEED. Defaults to the free IEX feed. */
export function alpacaFeed(): 'iex' | 'sip' {
  const raw = (process.env.ALPACA_FEED ?? 'iex').trim().toLowerCase();
  return raw === 'sip' ? 'sip' : 'iex';
}

/**
 * The Alpaca symbol used for each asset's order flow.
 *
 * The index assets are read through their liquid ETF proxies; Gold would be read
 * through GLD if it were routed to Alpaca (it defaults to Binance PAXG/USDT, a
 * real gold market). Overridable per asset with ORDERFLOW_SYMBOL_<ID>.
 */
export const ALPACA_ORDERFLOW_SYMBOLS: Record<string, string> = {
  GC: 'GLD',
  ES: 'SPY',
  YM: 'DIA',
  NQ: 'QQQ',
};

/** The Alpaca symbol for an instrument's order flow, or null when there is none. */
export function alpacaOrderFlowSymbolFor(instrumentId: string): string | null {
  const id = instrumentId.toUpperCase();
  const override = (process.env[`ORDERFLOW_SYMBOL_${id}`] ?? '').trim();
  if (override.length > 0) return override.toUpperCase();
  return ALPACA_ORDERFLOW_SYMBOLS[id] ?? null;
}

/** True when the two Alpaca credentials are present on the server. */
export function alpacaOrderFlowConfigured(): boolean {
  return alpacaKeyIdOrEmpty().length > 0 && alpacaSecretOrEmpty().length > 0;
}

export interface AlpacaTrade {
  t: string;
  p: number;
  s: number;
}

export interface AlpacaQuoteRow {
  t: string;
  bp: number;
  bs: number;
  ap: number;
  as: number;
}

export interface AlpacaTradesResponse {
  trades?: Record<string, AlpacaTrade[] | null> | null;
  next_page_token?: string | null;
  message?: string;
}

export interface AlpacaQuotesResponse {
  quotes?: Record<string, AlpacaQuoteRow[] | null> | null;
  next_page_token?: string | null;
  message?: string;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * One metered Alpaca GET for a single symbol's tape or quotes.
 *
 * The meter is consulted before the call and recorded after it, and one
 * `[alpaca]` line is logged per request — the same discipline the bars path
 * follows, so order-flow spend is visible in the same log.
 */
async function alpacaGet<T>(path: string, symbol: string, signal?: AbortSignal): Promise<T> {
  const endpoint = path.split('?')[0].split('/').pop() ?? path;

  try {
    alpacaMeter.assert(1);
  } catch (error) {
    if (error instanceof CreditLimitError) {
      logAlpacaRequest({
        endpoint,
        symbols: [symbol],
        status: 'BLOCKED',
        meter: alpacaMeter.snapshot(),
        note: error.message,
      });
      throw new AlpacaError('RATE_LIMIT', 'Alpaca rate limit reached', 429, Math.max(0, error.resetAt - Date.now()));
    }
    throw error;
  }

  let response: Response;
  try {
    noteAlpacaCall();
    response = await fetch(`${ALPACA_DATA_BASE}${path}`, {
      signal,
      headers: {
        Accept: 'application/json',
        'APCA-API-KEY-ID': alpacaKeyIdOrEmpty(),
        'APCA-API-SECRET-KEY': alpacaSecretOrEmpty(),
      },
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    logAlpacaRequest({ endpoint, symbols: [symbol], status: 'NETWORK', meter: alpacaMeter.snapshot() });
    throw new AlpacaError('NETWORK', 'Could not reach Alpaca');
  }

  const meter = recordAlpacaRequest({ endpoint, symbol, credits: 1 }, {});

  let payload: T & { message?: string };
  try {
    payload = (await response.json()) as T & { message?: string };
  } catch {
    logAlpacaRequest({
      endpoint,
      symbols: [symbol],
      status: response.status,
      meter,
      note: 'unreadable body',
    });
    throw new AlpacaError('UPSTREAM', `Alpaca returned HTTP ${response.status} with an unreadable body`, response.status);
  }

  if (!response.ok) {
    const message = payload.message ?? `Alpaca returned HTTP ${response.status}`;
    const kind = classifyAlpacaError(message, response.status);
    logAlpacaRequest({ endpoint, symbols: [symbol], status: response.status, meter, note: kind, message });
    if (kind === 'RATE_LIMIT') {
      const snapshot = markAlpacaExhausted();
      throw new AlpacaError('RATE_LIMIT', 'Alpaca rate limit reached', response.status, Math.max(0, snapshot.resetAt - Date.now()));
    }
    throw new AlpacaError(kind, message, response.status);
  }

  logAlpacaRequest({ endpoint, symbols: [symbol], status: response.status, meter });
  return payload;
}

// The credentials are read through futuresShared so there is ONE definition of
// where the Alpaca keys live. Imported lazily to avoid a cycle with orderflow.ts.
function alpacaKeyIdOrEmpty(): string {
  return (process.env.ALPACA_API_KEY_ID ?? process.env.ALPACA_API_KEY ?? '').trim();
}

function alpacaSecretOrEmpty(): string {
  return (process.env.ALPACA_API_SECRET_KEY ?? process.env.ALPACA_API_SECRET ?? '').trim();
}

/** How far back to reach for a tape when the market is closed (ms). */
const LOOKBACK_MS = 4 * 24 * 60 * 60 * 1000;
/** Trades and quotes to pull per request. */
const PAGE_LIMIT = 1000;

function timeMs(iso: string): number {
  const parsed = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** One classified trade, with the side already decided. */
export interface ClassifiedAlpacaTrade {
  price: number;
  size: number;
  timestamp: number;
  side: 'BUY' | 'SELL';
}

/**
 * Classify a tape against the quote timeline.
 *
 * Both lists must be ascending by time. For each trade the prevailing quote is
 * the latest quote printed at or before the trade; a trade before any quote is
 * classified by the tick rule alone.
 */
export function classifyAlpacaTape(
  trades: AlpacaTrade[],
  quotes: AlpacaQuoteRow[]
): ClassifiedAlpacaTrade[] {
  const sortedQuotes = [...quotes]
    .map(row => ({ ...row, ms: timeMs(row.t) }))
    .filter(row => Number.isFinite(row.ms))
    .sort((a, b) => a.ms - b.ms);

  const sortedTrades = [...trades]
    .map(row => ({ ...row, ms: timeMs(row.t) }))
    .filter(row => Number.isFinite(row.ms) && Number.isFinite(row.p) && Number.isFinite(row.s) && row.s > 0)
    .sort((a, b) => a.ms - b.ms);

  const classified: ClassifiedAlpacaTrade[] = [];
  let quoteIndex = 0;
  let currentBid: number | null = null;
  let currentAsk: number | null = null;
  let lastPrice: number | null = null;
  let lastSide: 'BUY' | 'SELL' | 'UNKNOWN' = 'UNKNOWN';

  for (const trade of sortedTrades) {
    while (quoteIndex < sortedQuotes.length && sortedQuotes[quoteIndex].ms <= trade.ms) {
      const quote = sortedQuotes[quoteIndex];
      if (Number.isFinite(quote.bp) && quote.bp > 0) currentBid = quote.bp;
      if (Number.isFinite(quote.ap) && quote.ap > 0) currentAsk = quote.ap;
      quoteIndex += 1;
    }

    const { side } = classifyTrade({
      price: trade.p,
      bid: currentBid,
      ask: currentAsk,
      lastPrice,
      lastSide,
    });

    lastPrice = trade.p;
    if (side === 'UNKNOWN') continue;
    lastSide = side;
    classified.push({ price: trade.p, size: trade.s, timestamp: trade.ms, side });
  }

  return classified;
}

/** Sum the window's buy and sell size, and the session CVD from the tape. */
export interface AlpacaTapeMetrics {
  buyVolume: number;
  sellVolume: number;
  delta: number;
  imbalance: number;
  buyShare: number;
  cvd: number;
  tradeCount: number;
  lastTradeAt: number | null;
}

export function summarizeTape(
  classified: ClassifiedAlpacaTrade[],
  now: number,
  windowMs: number
): AlpacaTapeMetrics {
  const cutoff = now - windowMs;
  let buyVolume = 0;
  let sellVolume = 0;
  let cvd = 0;
  let tradeCount = 0;
  let lastTradeAt: number | null = null;

  for (const trade of classified) {
    cvd += trade.side === 'BUY' ? trade.size : -trade.size;
    if (trade.timestamp < cutoff) continue;
    if (trade.side === 'BUY') buyVolume += trade.size;
    else sellVolume += trade.size;
    tradeCount += 1;
    if (lastTradeAt === null || trade.timestamp > lastTradeAt) lastTradeAt = trade.timestamp;
  }

  const totalVolume = buyVolume + sellVolume;
  const delta = buyVolume - sellVolume;
  return {
    buyVolume,
    sellVolume,
    delta,
    imbalance: totalVolume > 0 ? delta / totalVolume : 0,
    buyShare: totalVolume > 0 ? buyVolume / totalVolume : 0.5,
    cvd,
    tradeCount,
    lastTradeAt,
  };
}

/** The two-sided best quote as a book, when one is available. */
export function bookFromQuote(quote: AlpacaQuoteRow | null): OrderFlowBook | null {
  if (!quote) return null;
  const bidSize = Number.isFinite(quote.bs) ? quote.bs : 0;
  const askSize = Number.isFinite(quote.as) ? quote.as : 0;
  if (bidSize <= 0 && askSize <= 0) return null;
  const total = bidSize + askSize;
  const bids = Number.isFinite(quote.bp) && quote.bp > 0 ? [{ price: quote.bp, size: bidSize }] : [];
  const asks = Number.isFinite(quote.ap) && quote.ap > 0 ? [{ price: quote.ap, size: askSize }] : [];
  return {
    bids,
    asks,
    bidSize,
    askSize,
    imbalance: total > 0 ? (bidSize - askSize) / total : 0,
  };
}

/** The newest quote row, from a possibly-unsorted list. */
export function latestQuote(rows: AlpacaQuoteRow[]): AlpacaQuoteRow | null {
  let best: AlpacaQuoteRow | null = null;
  let bestMs = -Infinity;
  for (const row of rows) {
    const ms = timeMs(row.t);
    if (Number.isFinite(ms) && ms >= bestMs) {
      bestMs = ms;
      best = row;
    }
  }
  return best;
}

export interface AlpacaOrderFlowParams {
  symbol: string;
  /** The rolling window the strength bar is measured over (ms). */
  windowMs: number;
  /** Clock override, for tests. */
  now?: number;
  signal?: AbortSignal;
}

export interface AlpacaOrderFlowPayload {
  trades: AlpacaTrade[];
  quotes: AlpacaQuoteRow[];
}

/**
 * Read the real tape and quotes for one symbol.
 *
 * An explicit `start` reaches back across a closed session and a weekend, so the
 * last session's tape is returned when the market is shut.
 */
export async function fetchAlpacaTapeAndQuotes(
  symbol: string,
  now: number,
  signal?: AbortSignal
): Promise<AlpacaOrderFlowPayload> {
  const feed = alpacaFeed();
  const start = new Date(now - LOOKBACK_MS).toISOString();

  const tradesQuery = new URLSearchParams({
    symbols: symbol,
    limit: String(PAGE_LIMIT),
    feed,
    sort: 'desc',
    start,
  });
  const quotesQuery = new URLSearchParams({
    symbols: symbol,
    limit: String(PAGE_LIMIT),
    feed,
    sort: 'desc',
    start,
  });

  const tradesPayload = await alpacaGet<AlpacaTradesResponse>(
    `/v2/stocks/trades?${tradesQuery.toString()}`,
    symbol,
    signal
  );
  const quotesPayload = await alpacaGet<AlpacaQuotesResponse>(
    `/v2/stocks/quotes?${quotesQuery.toString()}`,
    symbol,
    signal
  );

  const trades = tradesPayload.trades?.[symbol] ?? [];
  const quotes = quotesPayload.quotes?.[symbol] ?? [];
  return { trades: trades ?? [], quotes: quotes ?? [] };
}

/** CVD samples for the slope, one per fixed bucket of the session tape. */
function cvdSamples(classified: ClassifiedAlpacaTrade[], buckets = 24): { timestamp: number; cvd: number }[] {
  if (classified.length < 2) return [];
  const first = classified[0].timestamp;
  const last = classified[classified.length - 1].timestamp;
  const span = Math.max(1, last - first);
  const step = span / buckets;

  const samples: { timestamp: number; cvd: number }[] = [];
  let running = 0;
  let bucketEnd = first + step;
  for (const trade of classified) {
    running += trade.side === 'BUY' ? trade.size : -trade.size;
    while (trade.timestamp >= bucketEnd) {
      samples.push({ timestamp: bucketEnd, cvd: running });
      bucketEnd += step;
    }
  }
  samples.push({ timestamp: last, cvd: running });
  return samples;
}

export interface BuildAlpacaReadingParams {
  symbol: string;
  windowMs: number;
  now?: number;
  signal?: AbortSignal;
}

/**
 * Build the full order-flow reading for an Alpaca-proxied asset.
 *
 * When the market is closed the window is anchored to the LAST trade rather than
 * to the wall clock, so the reading is the last session's final one instead of
 * an empty window — and it is flagged `sessionClosed` so the UI can say so.
 */
export async function buildAlpacaOrderFlowReading(
  params: BuildAlpacaReadingParams
): Promise<OrderFlowReading> {
  const now = params.now ?? Date.now();
  const feed = alpacaFeed();
  const { trades, quotes } = await fetchAlpacaTapeAndQuotes(params.symbol, now, params.signal);
  const classified = classifyAlpacaTape(trades, quotes);

  const sessionOpen = usEquitySessionState(now).open;
  const lastTradeAt = classified.length > 0 ? classified[classified.length - 1].timestamp : null;
  const anchor = sessionOpen || lastTradeAt === null ? now : lastTradeAt;

  const metrics = summarizeTape(classified, anchor, params.windowMs);
  const book = bookFromQuote(latestQuote(quotes));
  const samples = cvdSamples(classified);

  const snapshot = {
    buyVolume: metrics.buyVolume,
    sellVolume: metrics.sellVolume,
    totalVolume: metrics.buyVolume + metrics.sellVolume,
    delta: metrics.delta,
    imbalance: metrics.imbalance,
    buyShare: metrics.buyShare,
    tradeCount: metrics.tradeCount,
    cvd: metrics.cvd,
    windowMs: params.windowMs,
    lastTradeAt: metrics.lastTradeAt,
  };
  const gauge = buildFlowGauge(snapshot);

  const reading: OrderFlowReading = {
    gauge,
    metrics: {
      delta: metrics.delta,
      cvd: metrics.cvd,
      imbalance: metrics.imbalance,
      // Absorption is not derivable from a quote-based tape without a price
      // displacement model; report it as unavailable rather than guess.
      absorption: null,
    },
    source: `${ALPACA_ORDERFLOW_VENUE} ${feed.toUpperCase()} · ${params.symbol}`,
    instrument: params.symbol,
    provider: 'alpaca',
    feed,
    proxy: true,
    session: {
      buyVolume: metrics.buyVolume,
      sellVolume: metrics.sellVolume,
      delta: metrics.delta,
      imbalance: metrics.imbalance,
      buyShare: metrics.buyShare,
      cvd: metrics.cvd,
      cvdSlope: cvdSlope(samples),
      windowMs: params.windowMs,
      tradeCount: metrics.tradeCount,
    },
    book,
    sessionClosed: !sessionOpen,
    lastTradeAt,
    computedAt: now,
    cvdSeries: samples,
  };

  return reading;
}
