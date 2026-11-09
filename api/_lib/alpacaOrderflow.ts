// ============================================
// ALPACA ORDER FLOW ADAPTER (server-side)
// ============================================
// A real order-flow source for the index assets (ES/SPY, YM/DIA, NQ/QQQ). It
// reads two real Alpaca payloads — the trade TAPE (/v2/stocks/trades) and the
// latest best bid/ask (/v2/stocks/quotes/latest) — and derives aggressor delta,
// window CVD, book imbalance and absorption.
//
// WHAT ALPACA DOES AND DOES NOT PUBLISH. This matters, because order flow must
// never be invented:
//   * the tape is real: every print with its price, size and exchange;
//   * a stock trade carries NO aggressor side, unlike a crypto aggTrade. Buy or
//     sell is therefore classified with the standard TICK RULE (a print above the
//     previous one is buyer-initiated; below is seller-initiated; unchanged
//     carries the previous side). That is an inference over real prints, and it
//     is disclosed, not a fabricated number;
//   * Alpaca offers NO depth beyond the top of book, so "book imbalance" is the
//     best bid SIZE against the best ask SIZE — a real one-level book, not a
//     multi-level depth ladder. The UI labels it "top of book", never "depth".
//   * the feed is pinned to IEX (see the candles path), so that best bid/ask is
//     IEX's own top of book, one exchange's quote — NOT the consolidated NBBO,
//     which would require the SIP feed. The UI says so; it never claims NBBO.
//
// Nothing here is derived from candles. If the venue cannot be reached the
// adapter throws and the route reports an unavailable reading — never a stand-in.
//
// Every request goes through the Alpaca request meter (api/_lib/alpacaMeter.ts)
// via fetchAlpacaTrades / fetchAlpacaLatestQuote, so a call that skips the meter
// is impossible.

import type { GaugeReading, Vote, VoteDetail } from '../../src/core/types.js';
import { DEFAULT_COMPASS_CONFIG } from '../../src/config/compass.js';
import { assetProviderConfig } from './assets.js';
import {
  fetchAlpacaLatestQuote,
  fetchAlpacaTrades,
  type AlpacaQuote,
  type AlpacaTrade,
} from './alpaca.js';
import type { OrderFlowReading } from './orderflow.js';

/** The venue name shown in the provenance line. */
export const ALPACA_VENUE = 'Alpaca';

/**
 * The feed the adapter reads. Pinned to IEX, exactly like the candles path, so
 * the tape and the top of book are IEX's — one exchange's prints and quote, not
 * the consolidated SIP tape. The source label states this, so no reading ever
 * looks like consolidated market volume.
 */
export const ALPACA_ORDERFLOW_FEED = 'IEX';

/** How many recent prints one reading reads from the tape. */
export const ALPACA_ORDERFLOW_TRADES = 1000;

/**
 * The Alpaca symbol to read for an instrument, or null when Alpaca does not
 * serve it. The mapping is the per-asset configuration in api/_lib/assets.ts, so
 * an asset moved off Alpaca has no order-flow market here either.
 */
export function alpacaFlowSymbolFor(instrumentId: string): string | null {
  const config = assetProviderConfig(instrumentId);
  if (!config || config.provider !== 'alpaca') return null;
  return config.symbol;
}

/** True when Alpaca has a market to read for this instrument. */
export function alpacaHasMarket(instrumentId: string): boolean {
  return alpacaFlowSymbolFor(instrumentId) !== null;
}

/** The raw order-flow numbers behind the gauge, all from real Alpaca payloads. */
export interface AlpacaFlowMetrics {
  /** Aggressor buy minus aggressor sell shares over the tape window. */
  delta: number;
  /** Net aggressor shares over the window (the window CVD). */
  cvd: number;
  /** Top-of-book imbalance (IEX best bid vs ask size), -1 .. +1. */
  imbalance: number;
  /** 0..1: aggressive flow that did not move the price. */
  absorption: number;
  /** Prints read from the tape. */
  tradeCount: number;
  /** Prints whose side the tick rule could classify (all but possibly the first). */
  classifiedTrades: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the flow metrics from a real tape window and a real best-bid/ask snapshot.
 *
 * The tape is read oldest-first. Each print is classified with the tick rule: a
 * rise is buyer-initiated, a fall is seller-initiated, and an unchanged price
 * carries the previous side. The very first print has no predecessor, so it is
 * classified against the quote mid when one is available, and otherwise counted
 * as unclassified rather than guessed.
 */
export function computeAlpacaFlowMetrics(trades: AlpacaTrade[], quote: AlpacaQuote | null): AlpacaFlowMetrics {
  let buyVolume = 0;
  let sellVolume = 0;
  let classifiedTrades = 0;

  let prevPrice: number | null = null;
  let prevSide: 'BUY' | 'SELL' | null = null;

  const hasBid = quote !== null && quote.bp > 0;
  const hasAsk = quote !== null && quote.ap > 0;
  const mid = hasBid && hasAsk ? (quote!.bp + quote!.ap) / 2 : null;

  for (const trade of trades) {
    const price = trade.p;
    const size = trade.s;
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) continue;

    let side: 'BUY' | 'SELL' | null;
    if (prevPrice === null) {
      // No predecessor: use the quote mid if we have it, else leave unclassified.
      side = mid !== null && price !== mid ? (price > mid ? 'BUY' : 'SELL') : null;
    } else if (price > prevPrice) {
      side = 'BUY';
    } else if (price < prevPrice) {
      side = 'SELL';
    } else {
      side = prevSide;
    }

    if (side === 'BUY') buyVolume += size;
    else if (side === 'SELL') sellVolume += size;
    if (side !== null) classifiedTrades += 1;

    prevPrice = price;
    if (side !== null) prevSide = side;
  }

  const bidSize = hasBid ? quote!.bs : 0;
  const askSize = hasAsk ? quote!.as : 0;
  const bookTotal = bidSize + askSize;
  const imbalance = bookTotal > 0 ? (bidSize - askSize) / bookTotal : 0;

  const totalVolume = buyVolume + sellVolume;
  const delta = buyVolume - sellVolume;
  const cvd = delta;

  const firstPrice = trades.length > 0 ? trades[0].p : null;
  const lastPrice = trades.length > 0 ? trades[trades.length - 1].p : null;
  const averagePrice = firstPrice !== null && lastPrice !== null ? (firstPrice + lastPrice) / 2 : 0;
  const netFlowRatio = totalVolume > 0 ? Math.abs(delta) / totalVolume : 0;
  const priceMoveRatio =
    averagePrice > 0 && firstPrice !== null && lastPrice !== null ? Math.abs(lastPrice - firstPrice) / averagePrice : 0;
  // Strong net flow that barely moved the price was absorbed. With no meaningful
  // net flow the reading is zero rather than a guess.
  const absorption = netFlowRatio > 0.02 ? clamp(1 - priceMoveRatio / netFlowRatio, 0, 1) : 0;

  return { delta, cvd, imbalance, absorption, tradeCount: trades.length, classifiedTrades };
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
export function buildAlpacaGauge(metrics: AlpacaFlowMetrics, totalVolume: number): GaugeReading {
  const flowBias = totalVolume > 0 ? metrics.delta / totalVolume : 0;
  // The tape carries more of the signal than the resting top of book, so it
  // weighs more. Same 60/40 split as the Binance venue, so the two venues read
  // on one scale.
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

/** Total traded shares over the tape window, for the flow-bias denominator. */
function totalTradeVolume(trades: AlpacaTrade[]): number {
  let total = 0;
  for (const trade of trades) {
    if (Number.isFinite(trade.s) && trade.s > 0) total += trade.s;
  }
  return total;
}

/**
 * A real order-flow reading for one instrument, or null when Alpaca has no
 * market for it. Throws an AlpacaError when the venue cannot be read.
 */
export async function fetchAlpacaOrderFlowReading(
  instrumentId: string,
  _timeframe: string,
  keyId: string,
  secretKey: string,
  signal?: AbortSignal
): Promise<OrderFlowReading | null> {
  const symbol = alpacaFlowSymbolFor(instrumentId);
  if (!symbol) return null;

  const [trades, quote] = await Promise.all([
    fetchAlpacaTrades({ symbol, limit: ALPACA_ORDERFLOW_TRADES, keyId, secretKey, signal }),
    fetchAlpacaLatestQuote({ symbol, keyId, secretKey, signal }),
  ]);

  // No prints and no quote is a real "nothing to read here", not an error: the
  // market is closed or the symbol is silent. The card says so.
  if (trades.length === 0 && quote === null) return null;

  const metrics = computeAlpacaFlowMetrics(trades, quote);
  const gauge = buildAlpacaGauge(metrics, totalTradeVolume(trades));

  return {
    gauge,
    metrics: {
      delta: metrics.delta,
      cvd: metrics.cvd,
      imbalance: metrics.imbalance,
      absorption: metrics.absorption,
    },
    source: `${ALPACA_VENUE} ${symbol} (${ALPACA_ORDERFLOW_FEED})`,
  };
}
