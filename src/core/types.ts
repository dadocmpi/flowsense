// ============================================
// CORE TYPES — framework independent
// ============================================
// Everything in src/core is pure TypeScript with no React, DOM or network
// dependency, so the whole indicator / scoring / structure pipeline can be
// unit tested without a browser.

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

/** Ordered shortest -> longest. These are the buttons the UI offers. */
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D'];

export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '1D': 1440,
};

/** Display labels. The internal keys stay stable; only the wording changes. */
export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': 'M1',
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': '1H',
  '4h': '4H',
  '1D': '1D',
};

export interface Candle {
  /** UTC open time, ISO-ish "YYYY-MM-DD HH:MM:SS". */
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A single Buy / Neutral / Sell vote, whatever produced it. */
export type Vote = 'BUY' | 'NEUTRAL' | 'SELL';

/**
 * Which block a vote belongs to. The merged table uses this to lay the moving
 * averages and the oscillators out side by side; the order-flow block lives on
 * its own compass card and never appears in that table.
 */
export type VoteGroup = 'MA' | 'OSCILLATOR' | 'ORDER_FLOW';

export interface VoteDetail {
  name: string;
  /** Raw numeric value of the reading. */
  value: number;
  /** Display string for the value, already formatted. */
  display: string;
  vote: Vote;
  /** Optional extra context, e.g. the threshold that decided the vote. */
  note?: string;
  /** Which block produced this vote. */
  group?: VoteGroup;
}

export interface VoteTally {
  buy: number;
  neutral: number;
  sell: number;
}

export type ScoreLabel = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';

export interface GaugeReading {
  /** -100 (strong sell) .. +100 (strong buy). */
  score: number;
  label: ScoreLabel;
  tally: VoteTally;
  details: VoteDetail[];
}

export interface MarketStructure {
  swingHigh: number | null;
  swingLow: number | null;
  /** Last break of structure direction. */
  lastBos: 'BULLISH' | 'BEARISH' | null;
  /** Last change of character direction. */
  lastChoch: 'BULLISH' | 'BEARISH' | null;
  /** Where price sits in the last swing range. */
  zone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' | 'UNKNOWN';
  /** 0-100, position within the range (0 = at the low, 100 = at the high). */
  rangePosition: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
}

export interface TechnicalMetrics {
  atr: number | null;
  vwap: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  pointOfControl: number | null;
  /** Candle volume at the point of control. */
  pointOfControlVolume: number | null;
  /** Number of candles in the measured session. */
  sessionCandles: number;
  /** Open time of the session the metrics were measured over. */
  sessionStart: number | null;
}

/** What the change figure on the Summary card is measured from. */
export type ChangeBasis = 'SESSION' | 'WINDOW';

/**
 * The raw numbers behind the order-flow gauge, for that card's key figures.
 * Every field is nullable: a source that cannot supply one says so rather than
 * filling it with a zero.
 */
export interface OrderFlowMetrics {
  /** Net aggressive buy minus sell volume over the window. */
  delta: number | null;
  /** Cumulative volume delta over the window. */
  cvd: number | null;
  /** Resting book imbalance, -1 (all offers) .. +1 (all bids). */
  imbalance: number | null;
  /** 0..1: how much aggressive flow was absorbed without moving price. */
  absorption: number | null;
}

/**
 * A real order-flow reading, as returned by a configured source.
 *
 * It is never derived from candles and never synthesised: with no source the
 * reading is null and the card says so.
 *
 * The optional fields carry the richer "buyers vs sellers" detail the strength
 * bar and the data-quality footer need. They are optional so a lean adapter can
 * still answer with the core shape alone.
 */
export interface OrderFlowReading {
  gauge: GaugeReading;
  metrics: OrderFlowMetrics;
  /** Vendor-reported source label, for the provenance line. */
  source: string;
  /** The instrument the venue actually read, e.g. "QQQ" — a proxy for the index. */
  instrument?: string;
  /** Which provider served it, e.g. "alpaca" or "binance". */
  provider?: string;
  /** The market-data feed, e.g. "iex". Alpaca only. */
  feed?: string;
  /** True when the instrument is a proxy for the asset the user selected. */
  proxy?: boolean;
  /** The rolling window the session figures were measured over. */
  session?: OrderFlowSession | null;
  /** The resting book, when the venue publishes one. */
  book?: OrderFlowBook | null;
  /** True when the market is closed and this is the last session's reading. */
  sessionClosed?: boolean;
  /** Epoch ms of the last trade behind the reading, or null. */
  lastTradeAt?: number | null;
  /** Epoch ms the reading was computed. */
  computedAt?: number;
}

/** One resting book level. */
export interface OrderFlowBookLevel {
  price: number;
  size: number;
}

/** A resting bid/ask book, and the pressure it implies. */
export interface OrderFlowBook {
  bids: OrderFlowBookLevel[];
  asks: OrderFlowBookLevel[];
  /** Total resting bid size across the levels carried. */
  bidSize: number;
  /** Total resting ask size across the levels carried. */
  askSize: number;
  /** -1 (all offers) .. +1 (all bids). */
  imbalance: number;
}

/** The rolling-window tape figures behind the strength bar. */
export interface OrderFlowSession {
  /** Buyer-aggressed size in the window. */
  buyVolume: number;
  /** Seller-aggressed size in the window. */
  sellVolume: number;
  /** buyVolume - sellVolume. */
  delta: number;
  /** delta / (buyVolume + sellVolume), -1..+1. */
  imbalance: number;
  /** buyVolume / (buyVolume + sellVolume), 0..1. 0.5 when empty. */
  buyShare: number;
  /** Session cumulative volume delta. */
  cvd: number;
  /** CVD slope over the session, in CVD units per second, or null. */
  cvdSlope: number | null;
  /** The window these figures cover, ms. */
  windowMs: number;
  /** Classified trades counted in the window. */
  tradeCount: number;
}

export interface TimeframeReading {
  timeframe: Timeframe;
  /**
   * LEFT compass: one gauge over the moving averages AND the oscillators,
   * computed locally from the candles.
   */
  technical: GaugeReading;
  /**
   * CENTER compass: the technical gauge blended with the order-flow gauge into
   * one overall bias. With no order-flow source configured it is the technical
   * reading itself, and the UI says so.
   */
  summary: GaugeReading;
  /**
   * RIGHT compass: order flow (delta / CVD, book imbalance, absorption). Null
   * when no order-flow source is configured — never a placeholder reading.
   */
  orderFlow: OrderFlowReading | null;
  structure: MarketStructure;
  metrics: TechnicalMetrics;
  /** Last close used for the reading. */
  price: number;
  /** Price change since the session open, or over the loaded window. */
  change: number | null;
  changePercent: number | null;
  /** Which of the two the change was measured from. */
  changeBasis: ChangeBasis | null;
  /** Number of candles the reading was computed from. */
  candleCount: number;
  /** False when there were not enough candles to compute anything. */
  available: boolean;
}
