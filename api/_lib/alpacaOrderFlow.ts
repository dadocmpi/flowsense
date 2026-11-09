// ============================================
// ALPACA ORDER FLOW ADAPTER (server-side)
// ============================================
// The real order-flow source for the index assets (S&P 500, Dow, Nasdaq) and
// Gold. Alpaca's market-data API carries the two things the compass needs: a
// TAPE of every trade and the real top-of-book QUOTE. Both are read with the
// same server-side credentials the candle feed already uses, and every request
// runs through the shared Alpaca request meter (api/_lib/alpacaMeter.ts), so a
// venue's problem can never take the page down and no call skips the meter.
//
// THE AGGRESSOR SIDE. Alpaca's trade payload has no aggressor flag (fields are
// c, i, p, s, t, u, x, z). The aggressor is therefore INFERRED from two real
// signals, never invented:
//
//   - the tick rule: a trade above the previous trade price was a buy, below it
//     a sell (the standard exchange convention);
//   - the quote rule (Lee-Ready): a trade at or above the real ask is a buy, at
//     or below the real bid is a sell. It breaks a flat-tick tie.
//
// Nothing here is derived from candles and nothing is synthesised. A trade that
// cannot be classified carries the previous side rather than a made-up one. If
// the venue cannot be reached the adapter throws, and the route reports an
// unavailable reading — never a stand-in.
//
// SYMBOL. The index assets are read through their liquid ETF proxies, the SAME
// symbol the candle feed uses: SPY (S&P 500), DIA (Dow), QQQ (Nasdaq). Gold has
// no equity listing of its own, so it is read through GLD, the SPDR Gold Shares
// ETF. The symbol is configurable with ALPACA_ORDERFLOW_SYMBOL_<ID>.
//
// Every request goes through the Alpaca meter and logs one `[alpaca]` line, so a
// call that skips the meter is impossible.

import type { GaugeReading, Vote, VoteDetail } from '../../src/core/types.js';
import { DEFAULT_COMPASS_CONFIG } from '../../src/config/compass.js';
import {
  alpacaMeter,
  markAlpacaExhausted,
  noteAlpacaCall,
  recordAlpacaRequest,
} from './alpacaMeter.js';
import { AlpacaError, classifyAlpacaError, logAlpacaRequest } from './alpaca.js';
import { CreditLimitError } from './rateMeter.js';
import type { OrderFlowReading } from './orderflow.js';

/** The venue name shown in the provenance line. */
export const ALPACA_VENUE = 'Alpaca';

/** The Alpaca data host. */
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

/**
 * The shipped instrument -> symbol map.
 *
 * The index assets read their ETF proxy, the same symbol the candle feed uses.
 * Gold is read through GLD (SPDR Gold Shares), a real, liquid gold market that
 * trades on the US equity session — the honest Alpaca source for Gold.
 */
const ALPACA_ORDERFLOW_SYMBOLS: Record<string, string> = {
  GC: 'GLD',
  ES: 'SPY',
  YM: 'DIA',
  NQ: 'QQQ',
};

/** The Alpaca symbol for an instrument, or null when there is no market. */
export function alpacaOrderFlowSymbolFor(instrumentId: string): string | null {
  const id = instrumentId.toUpperCase();
  const override = (process.env[`ALPACA_ORDERFLOW_SYMBOL_${id}`] ?? '').trim();
  if (override.length > 0) return override.toUpperCase();
  return ALPACA_ORDERFLOW_SYMBOLS[id] ?? null;
}

/** True when this instrument has an Alpaca market to read. */
export function alpacaOrderFlowHasMarket(instrumentId: string): boolean {
  return alpacaOrderFlowSymbolFor(instrumentId) !== null;
}

/** How many trades to read from the tape, and the trade window that implies. */
export const ALPACA_TRADES_LIMIT = 1000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * One metered Alpaca GET.
 *
 * The meter is consulted before the call and the response recorded after it, so
 * a call that would breach the minute is refused without spending anything. The
 * error is classified in our own terms (AUTH, SUBSCRIPTION, RATE_LIMIT, ...) so
 * the route never surfaces the vendor's raw text.
 */
async function alpacaGet<T>(params: {
  path: string;
  symbol: string;
  endpoint: string;
  keyId: string;
  secretKey: string;
  signal?: AbortSignal;
  baseUrl?: string;
}): Promise<T> {
  const { path, symbol, endpoint, keyId, secretKey, signal, baseUrl } = params;

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

  const base = (baseUrl ?? ALPACA_DATA_BASE).replace(/\/+$/, '');

  let response: Response;
  try {
    noteAlpacaCall();
    response = await fetch(`${base}${path}`, {
      signal,
      headers: {
        Accept: 'application/json',
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    logAlpacaRequest({ endpoint, symbols: [symbol], status: 'NETWORK', meter: alpacaMeter.snapshot() });
    throw new AlpacaError('NETWORK', 'Could not reach Alpaca');
  }

  const meter = recordAlpacaRequest({ endpoint, symbol, credits: 1 }, {});

  let payload: T & { message?: string; code?: number };
  try {
    payload = (await response.json()) as T & { message?: string; code?: number };
  } catch {
    logAlpacaRequest({
      endpoint,
      symbols: [symbol],
      status: response.status,
      meter,
      note: 'unreadable body',
      message: `HTTP ${response.status} returned an unreadable body`,
    });
    throw new AlpacaError('UPSTREAM', `Alpaca returned HTTP ${response.status} with an unreadable body`, response.status);
  }

  if (!response.ok) {
    const message = payload.message ?? `Alpaca returned HTTP ${response.status}`;
    const kind = classifyAlpacaError(message, response.status);
    logAlpacaRequest({
      endpoint,
      symbols: [symbol],
      status: response.status,
      meter,
      note: kind,
      message,
    });
    if (kind === 'RATE_LIMIT') {
      const snapshot = markAlpacaExhausted();
      throw new AlpacaError('RATE_LIMIT', 'Alpaca rate limit reached', response.status, Math.max(0, snapshot.resetAt - Date.now()));
    }
    throw new AlpacaError(kind, message, response.status);
  }

  logAlpacaRequest({ endpoint, symbols: [symbol], status: response.status, meter });
  return payload as T;
}

export interface AlpacaTrade {
  p: number;
  s: number;
  t: string;
  x?: string;
  c?: string[];
  i?: number;
  u?: string;
  z?: string;
}

export interface AlpacaQuote {
  bp: number;
  bs: number;
  ap: number;
  as: number;
  t: string;
  bx?: string;
  ax?: string;
  z?: string;
}

export interface AlpacaTradesResponse {
  trades?: Record<string, AlpacaTrade[] | null> | null;
  next_page_token?: string | null;
}

export interface AlpacaQuotesResponse {
  quotes?: Record<string, AlpacaQuote[] | null> | null;
  next_page_token?: string | null;
}

/** Trades for one symbol, oldest-first, with unusable rows dropped. */
export function parseAlpacaTrades(payload: AlpacaTradesResponse, symbol: string): AlpacaTrade[] {
  const list = payload.trades?.[symbol];
  if (!Array.isArray(list)) return [];
  return list
    .filter(trade => Number.isFinite(trade.p) && trade.p > 0 && Number.isFinite(trade.s) && trade.s > 0)
    .sort((a, b) => String(a.t).localeCompare(String(b.t)));
}

/** The most recent usable quote for one symbol, or null. */
export function parseAlpacaQuote(payload: AlpacaQuotesResponse, symbol: string): AlpacaQuote | null {
  const list = payload.quotes?.[symbol];
  if (!Array.isArray(list) || list.length === 0) return null;
  // Pick the newest quote by timestamp rather than trusting the sort order.
  const usable = list
    .filter(q => Number.isFinite(q.bp) && Number.isFinite(q.ap) && (q.bp > 0 || q.ap > 0))
    .sort((a, b) => String(b.t).localeCompare(String(a.t)));
  return usable[0] ?? null;
}

/** The raw order-flow numbers behind the gauge, all from real Alpaca payloads. */
export interface AlpacaFlowMetrics {
  /** Aggressor buy minus aggressor sell shares over the trade window. */
  delta: number;
  /** Net aggressor quantity over the window (the window CVD). */
  cvd: number;
  /** Top-of-book imbalance, -1 (all offers) .. +1 (all bids). */
  imbalance: number;
  /** 0..1: aggressive flow that did not move the price. */
  absorption: number;
  /** Trades read from the tape. */
  tradeCount: number;
  /** Total shares traded over the window, for the flow-bias denominator. */
  totalVolume: number;
}

/**
 * Classify one trade's aggressor side from the tick rule, with the real
 * top-of-book quote breaking a flat-tick tie (the Lee-Ready convention).
 *
 * Returns the side, or null when neither signal can decide — the caller then
 * carries the previous side rather than inventing one.
 */
function classifyAggressor(
  price: number,
  prevPrice: number | null,
  quote: AlpacaQuote | null
): 'BUY' | 'SELL' | null {
  if (prevPrice !== null) {
    if (price > prevPrice) return 'BUY';
    if (price < prevPrice) return 'SELL';
  }
  // Flat tick (or the first trade): the real quote decides.
  if (quote) {
    if (quote.ap > 0 && price >= quote.ap) return 'BUY';
    if (quote.bp > 0 && price <= quote.bp) return 'SELL';
  }
  return null;
}

/**
 * Compute the flow metrics from one real quote and one real trade window.
 *
 * The aggressor side is inferred (tick rule + quote rule) because Alpaca does
 * not publish it; a trade neither rule can place carries the previous side. The
 * imbalance is the real top-of-book bid size against ask size.
 */
export function computeAlpacaFlowMetrics(quote: AlpacaQuote | null, trades: AlpacaTrade[]): AlpacaFlowMetrics {
  const bidSize = quote && Number.isFinite(quote.bs) ? Math.max(0, quote.bs) : 0;
  const askSize = quote && Number.isFinite(quote.as) ? Math.max(0, quote.as) : 0;
  const bookTotal = bidSize + askSize;
  const imbalance = bookTotal > 0 ? (bidSize - askSize) / bookTotal : 0;

  let buyVolume = 0;
  let sellVolume = 0;
  let prevPrice: number | null = null;
  let lastSide: 'BUY' | 'SELL' | null = null;
  let firstPrice: number | null = null;
  let lastPrice: number | null = null;

  for (const trade of trades) {
    const price = trade.p;
    const qty = trade.s;
    if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;

    const side: 'BUY' | 'SELL' | null = classifyAggressor(price, prevPrice, quote) ?? lastSide;
    if (side === 'BUY') buyVolume += qty;
    else if (side === 'SELL') sellVolume += qty;
    if (side) lastSide = side;

    if (firstPrice === null) firstPrice = price;
    lastPrice = price;
    prevPrice = price;
  }

  const totalVolume = buyVolume + sellVolume;
  const delta = buyVolume - sellVolume;

  const averagePrice = firstPrice !== null && lastPrice !== null ? (firstPrice + lastPrice) / 2 : 0;
  const netFlowRatio = totalVolume > 0 ? Math.abs(delta) / totalVolume : 0;
  const priceMoveRatio =
    averagePrice > 0 && firstPrice !== null && lastPrice !== null ? Math.abs(lastPrice - firstPrice) / averagePrice : 0;
  // Absorption: price displacement per unit of net flow. Strong net flow that
  // barely moved the price was absorbed. With no meaningful net flow the reading
  // is zero rather than a guess.
  const absorption = netFlowRatio > 0.02 ? clamp(1 - priceMoveRatio / netFlowRatio, 0, 1) : 0;

  return { delta, cvd: delta, imbalance, absorption, tradeCount: trades.length, totalVolume };
}

function voteFromSign(value: number): Vote {
  if (value > 0) return 'BUY';
  if (value < 0) return 'SELL';
  return 'NEUTRAL';
}

/** The score -> label mapping, identical to src/core/scoring.labelFromScore. */
function labelFor(score: number): GaugeReading['label'] {
  const { strongBuy, buy, sell, strongSell } = DEFAULT_COMPASS_CONFIG.thresholds;
  if (score >= strongBuy) return 'STRONG_BUY';
  if (score >= buy) return 'BUY';
  if (score <= strongSell) return 'STRONG_SELL';
  if (score <= sell) return 'SELL';
  return 'NEUTRAL';
}

/** Build the -100..+100 order-flow gauge from the tape delta and the book. */
export function buildAlpacaGauge(metrics: AlpacaFlowMetrics): GaugeReading {
  const flowBias = metrics.totalVolume > 0 ? metrics.delta / metrics.totalVolume : 0;
  // The tape carries more of the signal than the resting book, so it weighs more.
  const score = clamp(100 * (0.6 * flowBias + 0.4 * metrics.imbalance), -100, 100);

  const details: VoteDetail[] = [
    {
      name: 'Aggressor delta',
      value: metrics.delta,
      display: `${metrics.delta >= 0 ? '+' : ''}${Math.round(metrics.delta)}`,
      vote: voteFromSign(metrics.delta),
      group: 'ORDER_FLOW',
    },
    {
      name: 'Book imbalance',
      value: metrics.imbalance,
      display: metrics.imbalance.toFixed(2),
      vote: voteFromSign(metrics.imbalance),
      group: 'ORDER_FLOW',
    },
  ];

  return {
    score,
    label: labelFor(score),
    tally: {
      buy: details.filter(d => d.vote === 'BUY').length,
      neutral: details.filter(d => d.vote === 'NEUTRAL').length,
      sell: details.filter(d => d.vote === 'SELL').length,
    },
    details,
  };
}

export interface FetchAlpacaOrderFlowParams {
  instrumentId: string;
  keyId: string;
  secretKey: string;
  signal?: AbortSignal;
  /** Base URL override, for tests. */
  baseUrl?: string;
}

/**
 * A real order-flow reading for one instrument, or null when the instrument has
 * no Alpaca market. Throws an AlpacaError when the venue cannot be read.
 *
 * Two metered requests: the tape (trades) and the top-of-book quote. Both go
 * through the shared Alpaca meter.
 */
export async function fetchAlpacaOrderFlowReading(
  params: FetchAlpacaOrderFlowParams
): Promise<OrderFlowReading | null> {
  const symbol = alpacaOrderFlowSymbolFor(params.instrumentId);
  if (!symbol) return null;

  const common = {
    symbol,
    keyId: params.keyId,
    secretKey: params.secretKey,
    signal: params.signal,
    baseUrl: params.baseUrl,
  };

  const tradesPayload = await alpacaGet<AlpacaTradesResponse>({
    ...common,
    endpoint: 'stocks_trades',
    path: `/v2/stocks/trades?symbols=${symbol}&limit=${ALPACA_TRADES_LIMIT}&feed=iex&sort=desc`,
  });
  const quotePayload = await alpacaGet<AlpacaQuotesResponse>({
    ...common,
    endpoint: 'stocks_quotes',
    path: `/v2/stocks/quotes?symbols=${symbol}&limit=1&feed=iex&sort=desc`,
  });

  const trades = parseAlpacaTrades(tradesPayload, symbol);
  const quote = parseAlpacaQuote(quotePayload, symbol);

  // No tape for this instrument is an honest "no reading" rather than a zero.
  if (trades.length === 0) return null;

  const metrics = computeAlpacaFlowMetrics(quote, trades);
  const gauge = buildAlpacaGauge(metrics);

  return {
    gauge,
    metrics: {
      delta: metrics.delta,
      cvd: metrics.cvd,
      imbalance: metrics.imbalance,
      absorption: metrics.absorption,
    },
    source: `${ALPACA_VENUE} ${symbol}`,
  };
}
