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
 * The raw numbers behind the order-book gauge, for that card's key figures.
 * Every field is nullable: a source that cannot supply one says so rather than
 * filling it with a zero.
 */
export interface OrderFlowMetrics {
  /** Best bid price. */
  bid: number | null;
  /** Best ask price. */
  ask: number | null;
  /** Resting size at the best bid. */
  bidSize: number | null;
  /** Resting size at the best ask. */
  askSize: number | null;
  /** (bid + ask) / 2. */
  mid: number | null;
  /** ask - bid, in price units. */
  spread: number | null;
  /** Spread as a percentage of the mid. */
  spreadPercent: number | null;
  /** Bid share of the two-sided book, 0..100. The pressure percentage shown. */
  bidSharePercent: number | null;
  /** Resting book imbalance, -1 (all offers) .. +1 (all bids). */
  imbalance: number | null;
  /** Traded volume over the vendor's reference window (the session). */
  volume: number | null;
}

/**
 * A real order-book reading, as returned by a configured source.
 *
 * It is never derived from candles and never synthesised: with no source the
 * reading is null and the card says so.
 */
export interface OrderFlowReading {
  gauge: GaugeReading;
  metrics: OrderFlowMetrics;
  /** Vendor-reported source label, for the provenance line. */
  source: string;
  /** Epoch ms the vendor stamped the quote with, or null. */
  at?: number | null;
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
   * RIGHT reading: the resting ORDER BOOK (size bid against size offered) and
   * the pressure percentage it produces. Null when no book source is configured
   * or the instrument's provider publishes no book — never a placeholder.
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
