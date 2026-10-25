// ============================================
// CORE TYPES — framework independent
// ============================================
// Everything in src/core is pure TypeScript with no React, DOM or network
// dependency, so the whole indicator / scoring / structure pipeline can be
// unit tested without a browser.

export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W';

/** Ordered shortest -> longest. */
export const TIMEFRAMES: Timeframe[] = ['5m', '15m', '30m', '1h', '4h', '1D', '1W'];

export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '1D': 1440,
  '1W': 10080,
};

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1D',
  '1W': '1W',
};

export interface Candle {
  /** UTC open time, ISO-ish "YYYY-MM-DD HH:MM:SS". */
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /**
   * Base-asset volume initiated by buyers (Binance kline field 9). Populated
   * only where the provider genuinely reports an aggressor split; undefined
   * means "not available", never "assume half".
   */
  takerBuyVolume?: number;
}

/** A single Buy / Neutral / Sell vote, whatever produced it. */
export type Vote = 'BUY' | 'NEUTRAL' | 'SELL';

export interface VoteDetail {
  name: string;
  /** Raw numeric value of the reading. */
  value: number;
  /** Display string for the value, already formatted. */
  display: string;
  vote: Vote;
  /** Optional extra context, e.g. the threshold that decided the vote. */
  note?: string;
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

export interface TimeframeReading {
  timeframe: Timeframe;
  /** The three Investing-style gauges for this timeframe. */
  movingAverages: GaugeReading;
  indicators: GaugeReading;
  summary: GaugeReading;
  structure: MarketStructure;
  metrics: TechnicalMetrics;
  /** Last close used for the reading. */
  price: number;
  /** Number of candles the reading was computed from. */
  candleCount: number;
  /** False when there were not enough candles to compute anything. */
  available: boolean;
}
