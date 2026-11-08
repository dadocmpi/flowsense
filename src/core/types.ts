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
 */
export interface OrderFlowReading {
  gauge: GaugeReading;
  metrics: OrderFlowMetrics;
  /** Vendor-reported source label, for the provenance line. */
  source: string;
}

// ============================================
// ESTIMATED ORDER FLOW
// ============================================
// For an instrument whose provider publishes no book or tape (Twelve Data /
// XAU-USD), the Order Flow panel shows an ESTIMATE derived from candles. These
// are the data shapes; the pure maths lives in core/orderFlowEstimator.

/** Which activity proxy a series is using, when volume is not usable. */
export type ActivityProxy = 'volume' | 'range' | 'ticks';

/** Buying / selling / neutral, from the smoothed imbalance through hysteresis. */
export type EstimatedFlowState = 'BUYING' | 'SELLING' | 'NEUTRAL';

/** CVD direction over the window. */
export type CvdTrend = 'RISING' | 'FALLING' | 'FLAT';

/** One closed candle's contribution to the estimate. */
export interface CandleFlow {
  datetime: string;
  /** Close-location value, -1 (closed on the low) .. +1 (closed on the high). */
  clv: number;
  /** The activity weight used for this candle. */
  weight: number;
  /** clv * weight: positive is buying pressure, negative selling. */
  delta: number;
  /** True when this candle looks like absorption. */
  absorption: boolean;
}

/** The full estimated order-flow reading for one timeframe. */
export interface EstimatedOrderFlow {
  /** False when there are not yet enough closed candles for a reading. */
  available: boolean;
  /** Closed candles used (never includes the forming candle). */
  candleCount: number;
  /** Candles still needed before a reading is possible. */
  needed: number;
  /** Which activity proxy was used. */
  proxy: ActivityProxy;
  /** True when volume was present and non-zero, so `proxy === 'volume'`. */
  volumeBased: boolean;
  /** Buy pressure as a percentage of total activity, 0..100. */
  buyPressure: number;
  /** Sell pressure as a percentage, 0..100. Always buy + sell = 100. */
  sellPressure: number;
  /** Raw (unsmoothed) imbalance over the window, -100..+100. */
  imbalance: number;
  /** Smoothed imbalance, -100..+100. The head-line number. */
  smoothedImbalance: number;
  /** Cumulative delta over the window. */
  cvd: number;
  /** Cumulative delta series over the window, oldest first. */
  cvdSeries: number[];
  /** Where the smoothed imbalance has put the state. */
  state: EstimatedFlowState;
  /** CVD direction over the window. */
  cvdTrend: CvdTrend;
  /** Price makes a new high but CVD does not (bearish), or the reverse. */
  divergence: 'BEARISH' | 'BULLISH' | null;
  /** True when a small-range, high-weight, near-zero-CLV candle is present. */
  absorption: boolean;
  /** Per-candle contributions over the window, oldest first. */
  candles: CandleFlow[];
}

/**
 * An estimated order-flow reading, carried alongside the real one. `estimated`
 * is always true, so the UI can badge it and never mistake it for a real source.
 */
export interface EstimatedOrderFlowReading {
  gauge: GaugeReading;
  estimate: EstimatedOrderFlow;
  /** Always true; present so a consumer cannot confuse it with a real reading. */
  estimated: true;
  source: string;
  /**
   * The FORMING candle's imbalance, shown in a separate provisional layer. It
   * never feeds the main estimate or the Compass: the main numbers move on
   * candle close only. Null when there is no forming candle to read.
   */
  provisional: number | null;
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
  /**
   * An ESTIMATED order flow derived from the candles, for an instrument whose
   * provider has no real source. Null when a real source is present, or when the
   * series is too short to estimate. Always labelled as an estimate in the UI.
   */
  estimatedFlow: EstimatedOrderFlowReading | null;
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
