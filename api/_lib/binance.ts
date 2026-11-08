// ============================================
// BINANCE ORDER FLOW ADAPTER (server-side)
// ============================================
// A REAL order-flow source: the Binance public market-data API. It carries what
// Twelve Data's candle feed cannot — a resting bid/ask BOOK (the depth endpoint)
// and a TAPE with the aggressor side of every trade (aggTrades). From those two
// real payloads this module derives the order-flow reading: aggressor delta,
// window CVD, book imbalance and absorption.
//
// Nothing here is derived from candles and nothing is synthesised. If the venue
// cannot be reached the adapter throws, and the route reports an unavailable
// reading — never a stand-in.
//
// SYMBOL. Gold (GC) is read as PAXG/USDT (PAX Gold, 1 token = 1 troy ounce) on
// Binance spot. The symbol is configurable with BINANCE_SYMBOL_<ID>.
//
// BASE URL. Binance serves the same public API from several hosts, and some are
// geo-restricted. The hosts are tried in order and the first that answers is
// remembered, so a restricted primary host does not disable the feature. Set
// BINANCE_BASE_URL to pin one.
//
// Every request goes through the Binance request meter (api/_lib/binanceMeter.ts)
// and logs one line, so a call that skips the meter is impossible.

import type { GaugeReading, OrderFlowBook, Vote, VoteDetail } from '../../src/core/types.js';
import { DEFAULT_COMPASS_CONFIG } from '../../src/config/compass.js';
import { cvdSlope } from '../../src/core/orderflow.js';
import { assertBinanceRequest, binanceMeterSnapshot, markBinanceExhausted, recordBinanceRequest } from './binanceMeter.js';
import { CreditLimitError } from './rateMeter.js';
import type { OrderFlowReading } from './orderflow.js';

export type BinanceErrorKind = 'NOT_CONFIGURED' | 'GEO_BLOCKED' | 'RATE_LIMIT' | 'NETWORK' | 'UPSTREAM' | 'SYMBOL_NOT_FOUND';

export class BinanceError extends Error {
  kind: BinanceErrorKind;
  retryAfterMs?: number;

  constructor(kind: BinanceErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'BinanceError';
    this.kind = kind;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

/** The venue name shown in the provenance line. */
export const BINANCE_VENUE = 'Binance';

/** Hosts to try, in order, when BINANCE_BASE_URL is not set. */
const DEFAULT_BASE_URLS = [
  'https://data-api.binance.vision',
  'https://api.binance.us',
  'https://api.binance.com',
];

/** The shipped instrument -> symbol map. Only Gold has a Binance market today. */
const BINANCE_SYMBOLS: Record<string, string> = {
  GC: 'PAXGUSDT',
};

/** The Binance symbol for an instrument, or null when there is no market. */
export function binanceSymbolFor(instrumentId: string): string | null {
  const id = instrumentId.toUpperCase();
  const override = (process.env[`BINANCE_SYMBOL_${id}`] ?? '').trim();
  if (override.length > 0) return override.toUpperCase();
  return BINANCE_SYMBOLS[id] ?? null;
}

/** True when this instrument has a Binance market to read. */
export function binanceHasMarket(instrumentId: string): boolean {
  return binanceSymbolFor(instrumentId) !== null;
}

function baseUrls(): string[] {
  const pinned = (process.env.BINANCE_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return pinned.length > 0 ? [pinned, ...DEFAULT_BASE_URLS] : DEFAULT_BASE_URLS;
}

/** The host that last answered, so a restricted primary host is not retried. */
let workingBaseUrl: string | null = null;

function candidateBaseUrls(): string[] {
  const all = baseUrls();
  if (workingBaseUrl && all.includes(workingBaseUrl)) {
    return [workingBaseUrl, ...all.filter(url => url !== workingBaseUrl)];
  }
  return all;
}

/** Test seam: forget the remembered host. */
export function resetBinanceBase(): void {
  workingBaseUrl = null;
}

interface LogFields {
  endpoint: string;
  symbol: string;
  status: number | string;
  base?: string;
  note?: string;
}

function logRequest(fields: LogFields): void {
  const meter = binanceMeterSnapshot();
  const parts = [
    `[binance] ${new Date().toISOString()}`,
    `endpoint=${fields.endpoint}`,
    `symbol=${fields.symbol}`,
    `status=${fields.status}`,
    fields.base ? `base=${fields.base}` : null,
    `meterUsed=${meter.used}/${meter.limit}`,
    meter.exhausted ? 'meter=EXHAUSTED' : 'meter=OK',
    fields.note ? `note=${fields.note}` : null,
  ].filter((part): part is string => part !== null);
  console.log(parts.join(' '));
}

/**
 * One metered Binance GET, trying each host until one answers.
 *
 * The meter is consulted before the call and the response recorded after it, so
 * a call that would breach the minute is refused without spending anything.
 */
async function binanceGet<T>(path: string, symbol: string, signal?: AbortSignal): Promise<T> {
  const endpoint = path.split('?')[0].split('/').pop() ?? path;
  const bases = candidateBaseUrls();
  let lastError: BinanceError | null = null;

  for (const base of bases) {
    try {
      assertBinanceRequest(1);
    } catch (error) {
      if (error instanceof CreditLimitError) {
        logRequest({ endpoint, symbol, status: 'BLOCKED', base, note: error.message });
        throw new BinanceError('RATE_LIMIT', 'Binance request meter blocked the call', error.resetAt - Date.now());
      }
      throw error;
    }

    let response: Response;
    try {
      response = await fetch(`${base}${path}`, { signal, headers: { Accept: 'application/json' } });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      logRequest({ endpoint, symbol, status: 'NETWORK', base, note: 'unreachable' });
      lastError = new BinanceError('NETWORK', `Could not reach ${base}`);
      continue;
    }

    recordBinanceRequest({ credits: 1, endpoint, symbol });

    if (response.status === 451 || response.status === 403) {
      // Geo-restricted host: try the next one rather than failing the feature.
      logRequest({ endpoint, symbol, status: response.status, base, note: 'restricted' });
      lastError = new BinanceError('GEO_BLOCKED', `${base} is restricted in this region`);
      continue;
    }

    if (response.status === 429 || response.status === 418) {
      markBinanceExhausted(Date.now());
      logRequest({ endpoint, symbol, status: response.status, base, note: 'rate limited' });
      throw new BinanceError('RATE_LIMIT', 'Binance rate limit reached', 60_000);
    }

    if (!response.ok) {
      logRequest({ endpoint, symbol, status: response.status, base });
      throw new BinanceError('UPSTREAM', `Binance returned HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      logRequest({ endpoint, symbol, status: response.status, base, note: 'unreadable body' });
      throw new BinanceError('UPSTREAM', `Binance returned HTTP ${response.status} with an unreadable body`);
    }

    // A Binance error is a JSON object with a numeric `code`; a successful
    // payload is an array or an object without `code`.
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'code' in payload) {
      const code = Number((payload as { code: unknown }).code);
      const message = String((payload as { msg?: unknown }).msg ?? 'Binance returned an error');
      logRequest({ endpoint, symbol, status: response.status, base, note: message });
      if (code === -1121) throw new BinanceError('SYMBOL_NOT_FOUND', message);
      throw new BinanceError('UPSTREAM', message);
    }

    workingBaseUrl = base;
    logRequest({ endpoint, symbol, status: response.status, base });
    return payload as T;
  }

  throw lastError ?? new BinanceError('NETWORK', 'No Binance host could be reached');
}

export interface DepthPayload {
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

export interface AggTrade {
  p: string;
  q: string;
  m: boolean;
  /** Trade time, epoch ms. */
  T?: number;
}

/** Sum the quantity of the first `levels` book rows on one side. */
function sumLevels(levels: Array<[string, string]>, count: number): number {
  let total = 0;
  for (let i = 0; i < Math.min(count, levels.length); i += 1) {
    const qty = Number.parseFloat(levels[i][1]);
    if (Number.isFinite(qty)) total += qty;
  }
  return total;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** The raw order-flow numbers behind the gauge, all from real Binance payloads. */
export interface BinanceFlowMetrics {
  /** Aggressor buy minus aggressor sell quantity over the trade window. */
  delta: number;
  /** Net aggressor quantity over the window (the window CVD). */
  cvd: number;
  /** Resting book imbalance, -1 (all offers) .. +1 (all bids). */
  imbalance: number;
  /** 0..1: aggressive flow that did not move the price. */
  absorption: number;
  /** Trades read from the tape. */
  tradeCount: number;
  /** Buyer-aggressed quantity over the window. */
  buyVolume: number;
  /** Seller-aggressed quantity over the window. */
  sellVolume: number;
  /** Newest trade time in the window, or null. */
  lastTradeAt: number | null;
}

/** Compute the flow metrics from one depth snapshot and one aggTrades window. */
export function computeBinanceFlowMetrics(depth: DepthPayload, trades: AggTrade[], depthLevels = 20): BinanceFlowMetrics {
  const bidQty = sumLevels(depth.bids ?? [], depthLevels);
  const askQty = sumLevels(depth.asks ?? [], depthLevels);
  const bookTotal = bidQty + askQty;
  const imbalance = bookTotal > 0 ? (bidQty - askQty) / bookTotal : 0;

  let buyVolume = 0;
  let sellVolume = 0;
  let firstPrice: number | null = null;
  let lastPrice: number | null = null;
  let lastTradeAt: number | null = null;

  for (const trade of trades) {
    const qty = Number.parseFloat(trade.q);
    const price = Number.parseFloat(trade.p);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;
    // `m` true means the buyer was the maker, so the AGGRESSOR was the seller.
    if (trade.m) sellVolume += qty;
    else buyVolume += qty;
    if (firstPrice === null) firstPrice = price;
    lastPrice = price;
    const at = typeof trade.T === 'number' && Number.isFinite(trade.T) ? trade.T : null;
    if (at !== null && (lastTradeAt === null || at > lastTradeAt)) lastTradeAt = at;
  }

  const totalVolume = buyVolume + sellVolume;
  const delta = buyVolume - sellVolume;
  const cvd = delta;

  const averagePrice = firstPrice !== null && lastPrice !== null ? (firstPrice + lastPrice) / 2 : 0;
  const netFlowRatio = totalVolume > 0 ? Math.abs(delta) / totalVolume : 0;
  const priceMoveRatio =
    averagePrice > 0 && firstPrice !== null && lastPrice !== null ? Math.abs(lastPrice - firstPrice) / averagePrice : 0;
  // Absorption: price displacement per unit of net flow. Strong net flow that
  // barely moved the price was absorbed. With no meaningful net flow the reading
  // is zero rather than a guess.
  const absorption = netFlowRatio > 0.02 ? clamp(1 - priceMoveRatio / netFlowRatio, 0, 1) : 0;

  return { delta, cvd, imbalance, absorption, tradeCount: trades.length, buyVolume, sellVolume, lastTradeAt };
}

/** The resting book from a depth snapshot, for the Book Flow mode. */
export function bookFromDepth(depth: DepthPayload, levels = 20): OrderFlowBook {
  const toLevel = (row: [string, string]) => ({
    price: Number.parseFloat(row[0]),
    size: Number.parseFloat(row[1]),
  });
  const bids = (depth.bids ?? []).slice(0, levels).map(toLevel).filter(l => Number.isFinite(l.price) && Number.isFinite(l.size));
  const asks = (depth.asks ?? []).slice(0, levels).map(toLevel).filter(l => Number.isFinite(l.price) && Number.isFinite(l.size));
  const bidSize = bids.reduce((sum, level) => sum + level.size, 0);
  const askSize = asks.reduce((sum, level) => sum + level.size, 0);
  const total = bidSize + askSize;
  return { bids, asks, bidSize, askSize, imbalance: total > 0 ? (bidSize - askSize) / total : 0 };
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
export function buildBinanceGauge(metrics: BinanceFlowMetrics, totalVolume: number): GaugeReading {
  const flowBias = totalVolume > 0 ? metrics.delta / totalVolume : 0;
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

/** Total aggressor volume over a trade window, for the flow-bias denominator. */
function totalTradeVolume(trades: AggTrade[]): number {
  let total = 0;
  for (const trade of trades) {
    const qty = Number.parseFloat(trade.q);
    if (Number.isFinite(qty)) total += qty;
  }
  return total;
}

/**
 * A real order-flow reading for one instrument, or null when the instrument has
 * no Binance market. Throws a BinanceError when the venue cannot be read.
 */
export async function fetchBinanceOrderFlowReading(
  instrumentId: string,
  _timeframe: string,
  signal?: AbortSignal
): Promise<OrderFlowReading | null> {
  const symbol = binanceSymbolFor(instrumentId);
  if (!symbol) return null;

  const depth = await binanceGet<DepthPayload>(`/api/v3/depth?symbol=${symbol}&limit=100`, symbol, signal);
  const trades = await binanceGet<AggTrade[]>(`/api/v3/aggTrades?symbol=${symbol}&limit=1000`, symbol, signal);

  const metrics = computeBinanceFlowMetrics(depth, trades);
  const gauge = buildBinanceGauge(metrics, totalTradeVolume(trades));
  const totalVolume = metrics.buyVolume + metrics.sellVolume;
  const windowMs = trades.length >= 2 ? (metrics.lastTradeAt ?? 0) - firstTradeTime(trades) : 0;
  const cvdSeries = binanceCvdSeries(trades);

  return {
    gauge,
    metrics: {
      delta: metrics.delta,
      cvd: metrics.cvd,
      imbalance: metrics.imbalance,
      absorption: metrics.absorption,
    },
    source: `${BINANCE_VENUE} ${symbol}`,
    instrument: symbol,
    provider: 'binance',
    proxy: false,
    session: {
      buyVolume: metrics.buyVolume,
      sellVolume: metrics.sellVolume,
      delta: metrics.delta,
      imbalance: totalVolume > 0 ? metrics.delta / totalVolume : 0,
      buyShare: totalVolume > 0 ? metrics.buyVolume / totalVolume : 0.5,
      cvd: metrics.cvd,
      cvdSlope: cvdSlope(binanceCvdSeries(trades)),
      windowMs: Math.max(0, windowMs),
      tradeCount: metrics.tradeCount,
    },
    book: bookFromDepth(depth),
    sessionClosed: false,
    lastTradeAt: metrics.lastTradeAt,
    computedAt: Date.now(),
    cvdSeries,
  };
}

/** Bucketed cumulative volume delta over the tape, oldest first. */
function binanceCvdSeries(trades: AggTrade[], buckets = 24): Array<{ timestamp: number; cvd: number }> {
  const withTime = trades
    .map(trade => ({ trade, ms: typeof trade.T === 'number' ? trade.T : NaN }))
    .filter(entry => Number.isFinite(entry.ms))
    .sort((a, b) => a.ms - b.ms);
  if (withTime.length < 2) return [];

  const first = withTime[0].ms;
  const last = withTime[withTime.length - 1].ms;
  const step = Math.max(1, (last - first) / buckets);
  const samples: Array<{ timestamp: number; cvd: number }> = [];
  let running = 0;
  let bucketEnd = first + step;
  for (const { trade, ms } of withTime) {
    const qty = Number.parseFloat(trade.q);
    if (!Number.isFinite(qty)) continue;
    running += trade.m ? -qty : qty;
    while (ms >= bucketEnd) {
      samples.push({ timestamp: bucketEnd, cvd: running });
      bucketEnd += step;
    }
  }
  samples.push({ timestamp: last, cvd: running });
  return samples;
}

/** The oldest trade time in the window, for a window span. */
function firstTradeTime(trades: AggTrade[]): number {
  let first = Number.POSITIVE_INFINITY;
  for (const trade of trades) {
    if (Number.isFinite(trade.T) && (trade.T as number) < first) first = trade.T as number;
  }
  return Number.isFinite(first) ? first : 0;
}
