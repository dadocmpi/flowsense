// ============================================
// ORDER FLOW — PURE CLASSIFICATION AND IMBALANCE
// ============================================
// Everything a "buyers vs sellers" reading needs, with no I/O, no clock and no
// React, so it can be unit tested against hand-computed values.
//
// The one honest rule this module enforces: a trade is classified ONLY from real
// market data — the quote that was standing when it printed, or the tick rule
// (uptick = buy, downtick = sell). It never estimates an aggressor from a
// candle's shape, and a trade it cannot classify is dropped rather than guessed.
//
//   1. price >= ask  -> buyer aggressed   (a market buy lifted the offer)
//   2. price <= bid  -> seller aggressed  (a market sell hit the bid)
//   3. inside the spread -> tick rule: above the last price is a buy, below is
//      a sell, and an unchanged price carries the previous side forward
//   4. still undecided -> UNKNOWN, and the trade is not counted
//
// From the classified tape this module derives the window delta, the imbalance,
// the buy/sell share, the session cumulative volume delta (CVD) and its slope,
// and the plain-language dominance state and intensity tier.

import type { GaugeReading, Vote, VoteDetail } from './types.js';
import { clampScore, labelFromScore } from './scoring.js';
import type { CompassConfig } from '../config/compass.js';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass.js';

/** Which side the aggressor was on. */
export type TradeSide = 'BUY' | 'SELL';
/** Before a trade is classified, or when it cannot be. */
export type TradeSideOrUnknown = TradeSide | 'UNKNOWN';

/** The prevailing best bid/offer when a trade printed. Either may be unknown. */
export interface Quote {
  bid: number | null;
  ask: number | null;
}

/** A trade as it arrives from a venue, before classification. */
export interface ClassifiableTrade {
  price: number;
  size: number;
  /** Epoch ms the venue stamped the trade with. */
  timestamp: number;
}

/** A trade after classification: its side is known and its size counted. */
export interface ClassifiedTrade extends ClassifiableTrade {
  side: TradeSide;
}

/** How a trade's side was decided, for provenance and tests. */
export type ClassificationRule = 'QUOTE' | 'TICK' | 'ZERO_TICK' | 'UNKNOWN';

export interface ClassifyResult {
  side: TradeSideOrUnknown;
  rule: ClassificationRule;
}

export interface ClassifyInput {
  price: number;
  /** The quote standing when the trade printed, when known. */
  bid: number | null;
  ask: number | null;
  /** The previous trade's price, for the tick rule. */
  lastPrice: number | null;
  /** The previous trade's inferred side, for the zero-tick carry. */
  lastSide: TradeSideOrUnknown;
}

/**
 * Classify one trade as buyer- or seller-initiated.
 *
 * The quote is authoritative: a print at or above the ask is a buy, at or below
 * the bid is a sell. Inside the spread the tick rule applies. A zero tick (no
 * price change) carries the previous side forward, and with nothing to carry it
 * is UNKNOWN — never a guess.
 */
export function classifyTrade(input: ClassifyInput): ClassifyResult {
  const { price, bid, ask, lastPrice, lastSide } = input;
  if (!Number.isFinite(price)) return { side: 'UNKNOWN', rule: 'UNKNOWN' };

  if (ask !== null && Number.isFinite(ask) && price >= ask) return { side: 'BUY', rule: 'QUOTE' };
  if (bid !== null && Number.isFinite(bid) && price <= bid) return { side: 'SELL', rule: 'QUOTE' };

  if (lastPrice !== null && Number.isFinite(lastPrice)) {
    if (price > lastPrice) return { side: 'BUY', rule: 'TICK' };
    if (price < lastPrice) return { side: 'SELL', rule: 'TICK' };
  }

  if (lastSide !== 'UNKNOWN') return { side: lastSide, rule: 'ZERO_TICK' };
  return { side: 'UNKNOWN', rule: 'UNKNOWN' };
}

/** The numbers behind the strength bar, all from the classified tape. */
export interface FlowSnapshot {
  /** Buyer-aggressed size in the window. */
  buyVolume: number;
  /** Seller-aggressed size in the window. */
  sellVolume: number;
  /** buyVolume + sellVolume. */
  totalVolume: number;
  /** buyVolume - sellVolume. */
  delta: number;
  /** delta / totalVolume, in -1 (all sellers) .. +1 (all buyers). */
  imbalance: number;
  /** buyVolume / totalVolume, in 0..1. 0.5 when the window is empty. */
  buyShare: number;
  /** Trades counted in the window. */
  tradeCount: number;
  /** Session cumulative volume delta, over every trade seen. */
  cvd: number;
  /** The window the figures were measured over, ms. */
  windowMs: number;
  /** Newest trade time in the window, or null when it is empty. */
  lastTradeAt: number | null;
}

/**
 * A rolling, session-scoped order-flow accumulator.
 *
 * It is pure in the sense that matters here: it reads no clock and touches no
 * network — the caller passes the trade's own timestamp and the `now` used to
 * prune the window, so its output is a deterministic function of its inputs.
 */
export class FlowAccumulator {
  private trades: ClassifiedTrade[] = [];
  private lastPrice: number | null = null;
  private lastSide: TradeSideOrUnknown = 'UNKNOWN';
  private sessionCvd = 0;
  private seenTrades = 0;

  /**
   * Classify and record one trade. Returns the classified trade, or null when it
   * could not be classified (and so is not counted anywhere).
   *
   * The tick reference advances even for an unclassifiable trade, so the next
   * trade's uptick/downtick is measured against the real last price.
   */
  add(trade: ClassifiableTrade, quote: Quote = { bid: null, ask: null }): ClassifiedTrade | null {
    if (!Number.isFinite(trade.price) || !Number.isFinite(trade.size) || trade.size <= 0) return null;

    const { side } = classifyTrade({
      price: trade.price,
      bid: quote.bid,
      ask: quote.ask,
      lastPrice: this.lastPrice,
      lastSide: this.lastSide,
    });

    this.lastPrice = trade.price;
    this.seenTrades += 1;

    if (side === 'UNKNOWN') return null;
    this.lastSide = side;

    const classified: ClassifiedTrade = {
      price: trade.price,
      size: trade.size,
      timestamp: trade.timestamp,
      side,
    };
    this.trades.push(classified);
    this.sessionCvd += side === 'BUY' ? trade.size : -trade.size;
    return classified;
  }

  /** Drop trades older than the window, oldest first. */
  prune(now: number, windowMs: number): void {
    const cutoff = now - windowMs;
    let drop = 0;
    while (drop < this.trades.length && this.trades[drop].timestamp < cutoff) drop += 1;
    if (drop > 0) this.trades.splice(0, drop);
  }

  /** The window figures as of `now`. */
  snapshot(now: number, windowMs: number): FlowSnapshot {
    this.prune(now, windowMs);

    let buyVolume = 0;
    let sellVolume = 0;
    let lastTradeAt: number | null = null;
    for (const trade of this.trades) {
      if (trade.side === 'BUY') buyVolume += trade.size;
      else sellVolume += trade.size;
      if (lastTradeAt === null || trade.timestamp > lastTradeAt) lastTradeAt = trade.timestamp;
    }

    const totalVolume = buyVolume + sellVolume;
    const delta = buyVolume - sellVolume;
    const imbalance = totalVolume > 0 ? delta / totalVolume : 0;
    const buyShare = totalVolume > 0 ? buyVolume / totalVolume : 0.5;

    return {
      buyVolume,
      sellVolume,
      totalVolume,
      delta,
      imbalance,
      buyShare,
      tradeCount: this.trades.length,
      cvd: this.sessionCvd,
      windowMs,
      lastTradeAt,
    };
  }

  /** Session cumulative volume delta over every trade seen. */
  get cvd(): number {
    return this.sessionCvd;
  }

  /** Trades that arrived, classified or not. */
  get tradeCount(): number {
    return this.seenTrades;
  }

  clear(): void {
    this.trades = [];
    this.lastPrice = null;
    this.lastSide = 'UNKNOWN';
    this.sessionCvd = 0;
    this.seenTrades = 0;
  }
}

// ============================================
// DOMINANCE STATE AND INTENSITY
// ============================================

export type FlowState = 'BUYERS' | 'SELLERS' | 'BALANCED';
export type FlowIntensity = 'BALANCED' | 'WEAK' | 'MODERATE' | 'STRONG';

export interface FlowThresholds {
  /** |imbalance| below this is Balanced; a near-even tape is not a signal. */
  balanced: number;
  /** |imbalance| at or above this is at least Moderate. */
  moderate: number;
  /** |imbalance| at or above this is Strong. */
  strong: number;
}

/**
 * The dominance thresholds, taken from the compass config so there is ONE place
 * they are tuned. The flow block's `balanced`/`moderate`/`strong` are the same
 * numbers.
 */
export function flowThresholdsFromConfig(config: CompassConfig = DEFAULT_COMPASS_CONFIG): FlowThresholds {
  return {
    balanced: config.flow.balanced,
    moderate: config.flow.moderate,
    strong: config.flow.strong,
  };
}

/** The default thresholds, for callers that do not pass a config. */
export const DEFAULT_FLOW_THRESHOLDS: FlowThresholds = flowThresholdsFromConfig();

export interface FlowStateResult {
  state: FlowState;
  intensity: FlowIntensity;
  /** "Buyers dominating" / "Sellers dominating" / "Balanced". */
  label: string;
  /** "Weak" / "Moderate" / "Strong" / "Balanced". */
  intensityLabel: string;
}

/** Which side is dominating, and how strongly, from a -1..+1 imbalance. */
export function flowStateFromImbalance(
  imbalance: number,
  thresholds: FlowThresholds = DEFAULT_FLOW_THRESHOLDS
): FlowStateResult {
  const magnitude = Math.abs(imbalance);

  if (magnitude < thresholds.balanced) {
    return { state: 'BALANCED', intensity: 'BALANCED', label: 'Balanced', intensityLabel: 'Balanced' };
  }

  const state: FlowState = imbalance > 0 ? 'BUYERS' : 'SELLERS';
  let intensity: FlowIntensity;
  if (magnitude >= thresholds.strong) intensity = 'STRONG';
  else if (magnitude >= thresholds.moderate) intensity = 'MODERATE';
  else intensity = 'WEAK';

  return {
    state,
    intensity,
    label: state === 'BUYERS' ? 'Buyers dominating' : 'Sellers dominating',
    intensityLabel: intensity.charAt(0) + intensity.slice(1).toLowerCase(),
  };
}

// ============================================
// CVD SLOPE AND SHIFT DETECTION
// ============================================

export interface CvdSample {
  timestamp: number;
  cvd: number;
}

/** Least-squares slope of CVD over its samples, in units of CVD per second. */
export function cvdSlope(samples: CvdSample[]): number | null {
  if (samples.length < 2) return null;
  const t0 = samples[0].timestamp;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const sample of samples) {
    const x = (sample.timestamp - t0) / 1000;
    const y = sample.cvd;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const n = samples.length;
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * The state of the "dominance has flipped" tracker.
 *
 * A one-tick flip is noise, so an alert fires only once the NEW side has held
 * continuously for `holdMs`. `alerted` remembers the side already announced, so
 * a sustained move is announced exactly once rather than on every tick.
 */
export interface ShiftState {
  /** The side currently dominant, or null while the tape is balanced. */
  side: 'BUYERS' | 'SELLERS' | null;
  /** Epoch ms the current side first became dominant. */
  since: number;
  /** The side already announced, so it is not announced again while it holds. */
  alerted: 'BUYERS' | 'SELLERS' | null;
}

export interface ShiftDecision {
  state: ShiftState;
  /** The side that just took control and held, or null when there is no alert. */
  alert: 'BUYERS' | 'SELLERS' | null;
}

export const INITIAL_SHIFT_STATE: ShiftState = { side: null, since: 0, alerted: null };

/**
 * Advance the flip tracker with the latest dominance state.
 *
 * A balanced tape clears the pending side (there is nothing to announce), and a
 * side only alerts once it has held for `holdMs`.
 */
export function advanceShift(
  previous: ShiftState,
  state: FlowState,
  now: number,
  holdMs: number
): ShiftDecision {
  const side: 'BUYERS' | 'SELLERS' | null = state === 'BALANCED' ? null : state;

  if (side === null) {
    return { state: { side: null, since: now, alerted: null }, alert: null };
  }

  if (previous.side !== side) {
    // A new side has taken over; its hold clock starts now.
    return { state: { side, since: now, alerted: null }, alert: null };
  }

  if (previous.alerted === side || now - previous.since < holdMs) {
    return { state: previous, alert: null };
  }

  return { state: { side, since: previous.since, alerted: side }, alert: side };
}

// ============================================
// GAUGE FROM A FLOW SNAPSHOT
// ============================================

function voteFromSign(value: number): Vote {
  if (value > 0) return 'BUY';
  if (value < 0) return 'SELL';
  return 'NEUTRAL';
}

/**
 * The order-flow gauge, on the same -100..+100 scale as the other compasses.
 *
 * The score is the imbalance itself scaled to 100, so the needle and the
 * strength bar can never disagree. The label comes from `labelFromScore`, the
 * single definition of a label in the codebase.
 */
export function buildFlowGauge(
  snapshot: FlowSnapshot,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): GaugeReading {
  const score = clampScore(snapshot.imbalance * 100);

  const details: VoteDetail[] = [
    {
      name: 'Aggressor delta',
      value: snapshot.delta,
      display: `${snapshot.delta >= 0 ? '+' : ''}${Math.round(snapshot.delta)}`,
      vote: voteFromSign(snapshot.delta),
      group: 'ORDER_FLOW',
    },
    {
      name: 'Buy/sell imbalance',
      value: snapshot.imbalance,
      display: `${snapshot.imbalance >= 0 ? '+' : ''}${(snapshot.imbalance * 100).toFixed(1)}%`,
      vote: voteFromSign(snapshot.imbalance),
      group: 'ORDER_FLOW',
    },
  ];

  return {
    score,
    label: labelFromScore(score, config),
    tally: {
      buy: details.filter(detail => detail.vote === 'BUY').length,
      neutral: details.filter(detail => detail.vote === 'NEUTRAL').length,
      sell: details.filter(detail => detail.vote === 'SELL').length,
    },
    details,
  };
}

/** Book pressure from summed bid/ask size: -1 (all offers) .. +1 (all bids). */
export function bookImbalance(bidSize: number, askSize: number): number {
  const total = bidSize + askSize;
  if (total <= 0) return 0;
  return (bidSize - askSize) / total;
}
