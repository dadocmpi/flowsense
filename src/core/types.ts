// ============================================
// CORE TYPES — framework independent
// ============================================
// Everything in src/core is pure TypeScript with no React, DOM or network
// dependency, so the whole indicator / scoring / structure pipeline can be
// unit tested without a browser.

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

/** Ordered shortest -> longest. */
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

export interface TimeframeReading {
  timeframe: Timeframe;
  /** The two component gauges for this timeframe. */
  movingAverages: GaugeReading;
  indicators: GaugeReading;
  /** The combined gauge shown on screen. */
  summary: GaugeReading;
  /** Last close used for the reading. */
  price: number;
  /** Number of candles the reading was computed from. */
  candleCount: number;
  /** False when there were not enough candles to compute anything. */
  available: boolean;
}
