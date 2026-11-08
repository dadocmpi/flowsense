// ============================================
// ESTIMATED ORDER FLOW
// ============================================
// Some instruments have no real order-flow feed: a candle carries no aggressor
// side and no order book, and Twelve Data publishes neither. For those
// instruments this module derives an ESTIMATED order flow from the closed OHLCV
// candles alone, so the Order Flow panel has something honest to show.
//
// It is an ESTIMATE and it is labelled as one everywhere it surfaces. It is not
// a book, not a tape, and not an aggressor-side reading — it is the classic
// candle-level proxy: a close-location value in -1..+1 multiplied by an activity
// weight. A candle that closes on its high is treated as net buying pressure; one
// that closes on its low as net selling pressure.
//
// Everything here is PURE: no I/O, no clock, no React, so it is unit tested
// directly.
//
// STABILITY. The estimator reads CLOSED candles only. The caller must exclude the
// forming candle; the optional provisional layer is a separate, clearly labelled
// value and never feeds the main reading. The raw imbalance is smoothed with a
// short EMA, and the state word (Buying / Selling / Neutral) uses a neutral zone
// plus hysteresis, so the panel does not flicker on every tick.

import type {
  ActivityProxy,
  Candle,
  CandleFlow,
  CvdTrend,
  EstimatedFlowState,
  EstimatedOrderFlow,
} from './types';

// The data shapes live in core/types so the engine and the UI can speak them
// without importing this module; re-exported here for the estimator surface.
export type { ActivityProxy, CandleFlow, CvdTrend, EstimatedOrderFlow };
/** Buying / selling / neutral, from the smoothed imbalance through hysteresis. */
export type OrderFlowState = EstimatedFlowState;

export interface EstimatedOrderFlowConfig {
  /** Candles in the cumulative-delta window, for the head-line CVD. */
  cvdWindow: number;
  /** EMA length for the smoothed imbalance. */
  smoothing: number;
  /** Neutral zone: |imbalance| at or below this reads Neutral. */
  neutralZone: number;
  /** Consecutive candles past the zone before the state flips (hysteresis). */
  hysteresis: number;
  /** Window for the divergence read (price vs CVD swing). */
  divergenceWindow: number;
  /** ATR-length window used to judge "small range" for absorption. */
  absorptionRangeLookback: number;
  /** Range at or below this fraction of the average range counts as small. */
  absorptionRangeFactor: number;
  /** Weight at or above this fraction of the average weight counts as high. */
  absorptionWeightFactor: number;
}

export const DEFAULT_ESTIMATED_ORDER_FLOW_CONFIG: EstimatedOrderFlowConfig = {
  cvdWindow: 20,
  smoothing: 5,
  neutralZone: 15,
  hysteresis: 2,
  divergenceWindow: 20,
  absorptionRangeLookback: 14,
  absorptionRangeFactor: 0.5,
  absorptionWeightFactor: 1.0,
};

const EMPTY: EstimatedOrderFlow = {
  available: false,
  candleCount: 0,
  needed: DEFAULT_ESTIMATED_ORDER_FLOW_CONFIG.cvdWindow,
  proxy: 'range',
  volumeBased: false,
  buyPressure: 50,
  sellPressure: 50,
  imbalance: 0,
  smoothedImbalance: 0,
  cvd: 0,
  cvdSeries: [],
  state: 'NEUTRAL',
  cvdTrend: 'FLAT',
  divergence: null,
  absorption: false,
  candles: [],
};

/**
 * Which activity proxy a series can use.
 *
 * Twelve Data often returns empty or zero volume for XAU/USD, so volume is used
 * only when it is genuinely present; otherwise the candle range stands in as an
 * activity proxy. A live tick count can be supplied by the caller when a stream
 * is available, and it takes precedence because it is a real print count.
 */
export function detectActivityProxy(candles: Candle[], tickCount?: number): ActivityProxy {
  if (tickCount !== undefined && tickCount > 0) return 'ticks';
  const hasVolume = candles.some(candle => Number.isFinite(candle.volume) && candle.volume > 0);
  return hasVolume ? 'volume' : 'range';
}

/** Close-location value in -1..+1. A zero-range candle is neutral (CLV = 0). */
export function closeLocationValue(candle: Candle): number {
  const range = candle.high - candle.low;
  if (!Number.isFinite(range) || range <= 0) return 0;
  const clv = (candle.close - candle.low - (candle.high - candle.close)) / range;
  if (!Number.isFinite(clv)) return 0;
  return Math.max(-1, Math.min(1, clv));
}

/** The activity weight for one candle under the chosen proxy. */
export function candleWeight(candle: Candle, proxy: ActivityProxy, tickCount?: number): number {
  if (proxy === 'volume') {
    const volume = Number.isFinite(candle.volume) && candle.volume > 0 ? candle.volume : 0;
    return volume;
  }
  if (proxy === 'ticks') {
    return tickCount !== undefined && tickCount > 0 ? tickCount : 0;
  }
  // Range as an activity proxy. A zero-range candle carries no activity.
  const range = candle.high - candle.low;
  return Number.isFinite(range) && range > 0 ? range : 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Simple EMA over a series, seeded with the first value. */
function ema(values: number[], length: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (Math.max(1, length) + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

/**
 * The state word, from the smoothed imbalance, with a neutral zone and
 * hysteresis: a side is entered only after `hysteresis` consecutive candles
 * beyond the zone, and held until `hysteresis` consecutive candles beyond the
 * OPPOSITE zone. The caller passes the smoothed series so the walk is over the
 * same numbers the panel shows.
 */
export function classifyState(
  smoothed: number[],
  config: EstimatedOrderFlowConfig = DEFAULT_ESTIMATED_ORDER_FLOW_CONFIG
): OrderFlowState {
  let state: OrderFlowState = 'NEUTRAL';
  let streakSide: 'BUY' | 'SELL' | null = null;
  let streak = 0;
  const need = Math.max(1, config.hysteresis);

  for (const value of smoothed) {
    const side: 'BUY' | 'SELL' | null = value > config.neutralZone ? 'BUY' : value < -config.neutralZone ? 'SELL' : null;

    if (side === null) {
      // Back inside the neutral zone: cancel any partial streak, but hold the
      // committed state — the deadband is what stops the word flapping.
      streakSide = null;
      streak = 0;
      continue;
    }

    if (side === streakSide) {
      streak += 1;
    } else {
      streakSide = side;
      streak = 1;
    }

    if (streak >= need && state !== (side === 'BUY' ? 'BUYING' : 'SELLING')) {
      state = side === 'BUY' ? 'BUYING' : 'SELLING';
      streak = 0;
      streakSide = null;
    }
  }

  return state;
}

/**
 * A simple divergence: price makes a new high over the window while CVD does
 * not (bearish), or a new low while CVD does not (bullish).
 */
export function detectDivergence(
  closes: number[],
  cvdSeries: number[],
  window: number
): EstimatedOrderFlow['divergence'] {
  if (closes.length < 2 || cvdSeries.length < 2) return null;
  const start = Math.max(0, closes.length - window);
  const priceSlice = closes.slice(start);
  const cvdSlice = cvdSeries.slice(start);

  const currentPrice = priceSlice[priceSlice.length - 1];
  const currentCvd = cvdSlice[cvdSlice.length - 1];
  const priorPrice = Math.max(...priceSlice.slice(0, -1));
  const priorCvd = Math.max(...cvdSlice.slice(0, -1));

  if (currentPrice > priorPrice && currentCvd < priorCvd) return 'BEARISH';

  const priorPriceLow = Math.min(...priceSlice.slice(0, -1));
  const priorCvdLow = Math.min(...cvdSlice.slice(0, -1));
  if (currentPrice < priorPriceLow && currentCvd > priorCvdLow) return 'BULLISH';

  return null;
}

/**
 * Estimate order flow from CLOSED candles.
 *
 * The caller MUST pass closed candles only. `tickCount` is an optional live tick
 * count for the newest candle, used as the activity proxy when a stream exists;
 * it never changes a closed candle's contribution retroactively.
 */
export function estimateOrderFlow(
  closedCandles: Candle[],
  config: EstimatedOrderFlowConfig = DEFAULT_ESTIMATED_ORDER_FLOW_CONFIG,
  options: { tickCount?: number } = {}
): EstimatedOrderFlow {
  const window = Math.max(1, config.cvdWindow);
  if (closedCandles.length < window) {
    return {
      ...EMPTY,
      needed: window,
      candleCount: closedCandles.length,
      proxy: detectActivityProxy(closedCandles, options.tickCount),
      volumeBased: detectActivityProxy(closedCandles, options.tickCount) === 'volume',
    };
  }

  const proxy = detectActivityProxy(closedCandles, options.tickCount);
  const volumeBased = proxy === 'volume';
  const slice = closedCandles.slice(-window);

  // Range and weight averages over the lookback, for the absorption test. The
  // lookback reaches before the window so the very first candles still have a
  // baseline.
  const lookbackStart = Math.max(0, closedCandles.length - window - config.absorptionRangeLookback);
  const lookback = closedCandles.slice(lookbackStart);
  const averageRange = average(lookback.map(candle => Math.max(0, candle.high - candle.low)));
  const averageWeight = average(lookback.map(candle => candleWeight(candle, proxy, options.tickCount)));

  const candles: CandleFlow[] = slice.map(candle => {
    const clv = closeLocationValue(candle);
    const weight = candleWeight(candle, proxy, options.tickCount);
    const delta = clv * weight;
    const range = Math.max(0, candle.high - candle.low);
    const smallRange = averageRange > 0 && range <= averageRange * config.absorptionRangeFactor;
    const highWeight = averageWeight > 0 && weight >= averageWeight * config.absorptionWeightFactor;
    // Small range + high weight + a close near the open means activity was
    // absorbed without moving price — the classic absorption footprint.
    const absorption = smallRange && highWeight && Math.abs(clv) <= 0.15;
    return { datetime: candle.datetime, clv, weight, delta, absorption };
  });

  // The window imbalance is the activity-weighted mean close-location value, on
  // the same -100..+100 scale as everything else. buy + sell always = 100.
  const weightSum = candles.reduce((sum, candle) => sum + candle.weight, 0);
  const weightedClv = weightSum > 0 ? candles.reduce((sum, c) => sum + c.clv * c.weight, 0) / weightSum : 0;
  const imbalance = Math.max(-100, Math.min(100, weightedClv * 100));
  const buyPressure = (1 + Math.max(-1, Math.min(1, weightedClv))) * 50;
  const sellPressure = 100 - buyPressure;

  const cvdSeries: number[] = [];
  let running = 0;
  for (const candle of candles) {
    running += candle.delta;
    cvdSeries.push(running);
  }

  // Smooth the SAME per-candle imbalance the raw value averages, so the two are
  // directly comparable: raw is the weighted window mean, smoothed is the EMA.
  const clvSeries = candles.map(candle => candle.clv);
  const smoothedClv = ema(clvSeries, config.smoothing);
  const smoothedImbalance = Math.max(
    -100,
    Math.min(100, (smoothedClv[smoothedClv.length - 1] ?? 0) * 100)
  );
  const state = classifyState(smoothedClv.map(value => value * 100), config);

  const totalActivity = candles.reduce((sum, candle) => sum + Math.abs(candle.delta), 0);
  const cvdTrend = classifyCvdTrend(cvdSeries, totalActivity, config.neutralZone);
  const closes = slice.map(candle => candle.close);
  const divergence = detectDivergence(closes, cvdSeries, config.divergenceWindow);
  const absorption = candles.some(candle => candle.absorption);

  return {
    available: true,
    candleCount: closedCandles.length,
    needed: window,
    proxy,
    volumeBased,
    buyPressure,
    sellPressure,
    imbalance,
    smoothedImbalance,
    cvd: cvdSeries[cvdSeries.length - 1] ?? 0,
    cvdSeries,
    state,
    cvdTrend,
    divergence,
    absorption,
    candles,
  };
}

/** CVD direction over the window, using the neutral zone as the flat band. */
function classifyCvdTrend(cvdSeries: number[], totalActivity: number, neutralZone: number): CvdTrend {
  if (cvdSeries.length < 2 || totalActivity <= 0) return 'FLAT';
  const change = cvdSeries[cvdSeries.length - 1] - cvdSeries[0];
  // Normalise the net change against the window's own total activity, so the
  // flat band means the same thing whatever the instrument's size.
  const normalised = (change / totalActivity) * 100;
  if (normalised > neutralZone) return 'RISING';
  if (normalised < -neutralZone) return 'FALLING';
  return 'FLAT';
}

/**
 * The provisional (forming-candle) imbalance, for a clearly labelled preview.
 *
 * It is computed on its own and NEVER merged into the main reading: the main
 * numbers move on candle close only.
 */
export function provisionalImbalance(formingCandle: Candle, proxy: ActivityProxy): number {
  const clv = closeLocationValue(formingCandle);
  const weight = candleWeight(formingCandle, proxy);
  if (weight <= 0) return 0;
  return Math.max(-100, Math.min(100, clv * 100));
}

/** Map an estimated state onto the shared Vote vocabulary. */
export function stateToVote(state: OrderFlowState): 'BUY' | 'NEUTRAL' | 'SELL' {
  if (state === 'BUYING') return 'BUY';
  if (state === 'SELLING') return 'SELL';
  return 'NEUTRAL';
}
