// ============================================
// ORDER-FLOW DATA SHAPES (framework independent)
// ============================================
// Real order flow from a public venue feed: a resting bid/ask book and a tape
// of aggressive prints. A candle carries neither an aggressor side nor a book,
// so none of this is ever derived from candles — it arrives from the venue.
//
// Everything here is plain data with no React, DOM or network dependency, so the
// parsers and the aggregation can be unit tested without a browser.

/** One price level of the book. */
export interface BookLevel {
  price: number;
  size: number;
}

/**
 * A partial-depth snapshot: the top N levels, best first. No local
 * reconstruction is needed — the venue publishes the whole top of book.
 */
export interface BookSnapshot {
  /** Epoch ms the venue stamped the update. */
  exchangeTime: number;
  /** Epoch ms we received it. */
  receivedAt: number;
  /** Bids, best (highest price) first. */
  bids: BookLevel[];
  /** Asks, best (lowest price) first. */
  asks: BookLevel[];
  /** Venue sequence number, for staleness ordering. */
  updateId: number;
}

/** Which side took liquidity on a print. */
export type AggressorSide = 'BUY' | 'SELL';

/**
 * One aggressive print from the tape.
 *
 * `buyerIsMaker` is the venue's `m` flag: when the BUYER is the maker, the
 * aggressor was the SELLER (a market sell hit a resting bid). `side` is that
 * fact resolved once, so no caller has to re-derive it.
 */
export interface TradePrint {
  /** Venue trade id. */
  id: number;
  /** Epoch ms of the trade. */
  time: number;
  price: number;
  qty: number;
  buyerIsMaker: boolean;
  side: AggressorSide;
}

/** The best bid/ask, with sizes, from the book ticker stream. */
export interface BookTicker {
  exchangeTime: number;
  receivedAt: number;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
}

export type ParsedFlowMessage =
  | { kind: 'DEPTH'; snapshot: BookSnapshot }
  | { kind: 'TRADE'; print: TradePrint }
  | { kind: 'BOOK_TICKER'; ticker: BookTicker }
  | { kind: 'UNKNOWN' };

/** Connection/health of the venue feed, for the header and the panel. */
export type FeedStatus =
  | 'DISABLED'
  | 'CONNECTING'
  | 'LIVE'
  | 'RECONNECTING'
  | 'DOWN'
  | 'UNAVAILABLE';

export interface FeedHealth {
  status: FeedStatus;
  /** Plain reason when not LIVE, e.g. "geo-blocked (HTTP 451)". */
  reason: string | null;
  /** Epoch ms of the newest message of any kind. */
  lastMessageAt: number | null;
  lastBookAt: number | null;
  lastTradeAt: number | null;
  /** receivedAt - exchangeTime for the newest message, ms. */
  latencyMs: number | null;
  /** Consecutive reconnect attempts; 0 while connected. */
  reconnectAttempt: number;
  /** Epoch ms the current socket opened, or null. */
  connectedSince: number | null;
  /** Epoch ms the feed went quiet, when it is stale. */
  staleSince: number | null;
  /** Total messages ingested this session. */
  messageCount: number;
  /** The venue label, e.g. "Binance USDT-M XAUUSDT PERP". */
  venue: string;
}

/** Aggressor volume for one candle bucket. */
export interface CandleDelta {
  /** Epoch ms of the bucket open. */
  bucketStart: number;
  buyVolume: number;
  sellVolume: number;
  /** buyVolume - sellVolume. */
  delta: number;
  /** Number of prints in the bucket. */
  trades: number;
}

/** One point of the cumulative-delta series. */
export interface CvdPoint {
  bucketStart: number;
  /** Running sum of delta from the reset boundary. */
  cvd: number;
  /** This bucket's own delta. */
  delta: number;
}

/** Real order-flow metrics for one timeframe. Nulls mean "not available". */
export interface RealOrderFlowMetrics {
  /** Net aggressive volume over the window (buy - sell). */
  delta: number | null;
  /** Cumulative delta since the UTC reset. */
  cvd: number | null;
  /** Resting book imbalance, -1 (all offers) .. +1 (all bids). */
  imbalance: number | null;
  /** Aggressive buy share of window volume, 0..1. */
  buyShare: number | null;
  /** Total aggressive volume over the window. */
  volume: number | null;
}
