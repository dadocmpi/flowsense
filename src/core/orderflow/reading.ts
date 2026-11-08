// ============================================
// REAL ORDER-FLOW READING (gauge + metrics)
// ============================================
// Builds the RIGHT compass reading from REAL venue data: the per-candle delta
// series derived from aggressive prints, and the resting-book imbalance.
//
// The Compass NEVER reads a live-ticking value. Every number here is computed
// from CLOSED candles: the forming candle is dropped, the imbalance is smoothed
// with a short EMA, and the Buying/Selling/Neutral word uses a neutral zone plus
// hysteresis (the threshold must hold for N candles). So the gauge moves on
// candle close, not on every print.
//
// Pure: same inputs, same outputs.

import type { CandleDelta, CvdPoint, RealOrderFlowMetrics } from './types';
import { candleDeltas, cvdSeries, volumeTotals, type MinuteBucket } from './aggregate';
import type { CompassConfig } from '../../config/compass';
import { clampScore, labelFromScore } from '../scoring';
import type { GaugeReading, Vote, VoteDetail } from '../types';

export interface OrderFlowReadingConfig {
  /** Levels of each side summed for the book imbalance. */
  imbalanceLevels: number;
  /** EMA length for the smoothed imbalance. */
  smoothing: number;
  /** |imbalance| at or below this reads Neutral. */
  neutralZone: number;
  /** Consecutive candles past the zone before the state flips. */
  hysteresis: number;
}

const DEFAULT_ORDER_FLOW_READING_CONFIG: OrderFlowReadingConfig = {
  imbalanceLevels: 10,
  smoothing: 5,
  neutralZone: 15,
  hysteresis: 2,
};

export type FlowState = 'BUYING' | 'SELLING' | 'NEUTRAL';

function ema(values: number[], length: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (Math.max(1, length) + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i += 1) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

/**
 * The state word from the smoothed per-candle imbalance, with a neutral zone and
 * hysteresis: a side is entered only after `hysteresis` consecutive candles
 * beyond the zone, and held until the opposite zone is met. This is what stops
 * the word flapping on a single noisy candle.
 */
export function classifyFlowState(
  smoothed: number[],
  config: OrderFlowReadingConfig = DEFAULT_ORDER_FLOW_READING_CONFIG
): FlowState {
  let state: FlowState = 'NEUTRAL';
  let streakSide: 'BUY' | 'SELL' | null = null;
  let streak = 0;
  const need = Math.max(1, config.hysteresis);

  for (const value of smoothed) {
    const side: 'BUY' | 'SELL' | null =
      value > config.neutralZone ? 'BUY' : value < -config.neutralZone ? 'SELL' : null;

    if (side === null) {
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

/** The per-candle buy-share imbalance on the -100..+100 scale. */
function candleImbalance(delta: CandleDelta): number {
  const total = delta.buyVolume + delta.sellVolume;
  if (total <= 0) return 0;
  return ((delta.buyVolume - delta.sellVolume) / total) * 100;
}

export interface OrderFlowReadingResult {
  gauge: GaugeReading;
  metrics: RealOrderFlowMetrics;
  state: FlowState;
  /** Smoothed imbalance, -100..+100. */
  smoothedImbalance: number;
  cvdSeries: CvdPoint[];
  /** Total aggressive volume over the closed window. */
  windowVolume: number;
  /** Closed candles used. */
  candleCount: number;
}

/**
 * Build the reading from closed candle deltas and the current book imbalance.
 *
 * `candleDeltas` MUST already exclude the forming candle. `bookImbalanceValue`
 * is the resting-book imbalance, or null when there is no book.
 */
export function buildOrderFlowReading(
  candleDeltas: CandleDelta[],
  bookImbalanceValue: number | null,
  config: CompassConfig,
  readingConfig: OrderFlowReadingConfig = DEFAULT_ORDER_FLOW_READING_CONFIG
): OrderFlowReadingResult {
  const imbalances = candleDeltas.map(candleImbalance);
  const smoothedSeries = ema(imbalances, readingConfig.smoothing);
  const smoothedImbalance = clampScore(smoothedSeries[smoothedSeries.length - 1] ?? 0);
  const state = classifyFlowState(smoothedSeries, readingConfig);

  const totals = volumeTotals(candleDeltas);
  const delta = totals.buy - totals.sell;
  const series = cvdSeries(candleDeltas);
  const cvd = series.length > 0 ? series[series.length - 1].cvd : null;

  const vote: Vote = state === 'BUYING' ? 'BUY' : state === 'SELLING' ? 'SELL' : 'NEUTRAL';
  const score = clampScore(smoothedImbalance);

  const details: VoteDetail[] = [
    {
      name: 'Aggressor delta (closed candles)',
      value: delta,
      display: `${delta >= 0 ? '+' : ''}${Math.round(delta)}`,
      vote,
      group: 'ORDER_FLOW',
      note: `Smoothed imbalance ${smoothedImbalance.toFixed(0)}`,
    },
  ];
  if (bookImbalanceValue !== null) {
    details.push({
      name: `Book imbalance (top ${readingConfig.imbalanceLevels})`,
      value: bookImbalanceValue,
      display: bookImbalanceValue.toFixed(2),
      vote: bookImbalanceValue > 0.1 ? 'BUY' : bookImbalanceValue < -0.1 ? 'SELL' : 'NEUTRAL',
      group: 'ORDER_FLOW',
      note: 'Resting bid vs ask size',
    });
  }

  return {
    gauge: {
      score,
      label: labelFromScore(score, config),
      tally: {
        buy: vote === 'BUY' ? 1 : 0,
        neutral: vote === 'NEUTRAL' ? 1 : 0,
        sell: vote === 'SELL' ? 1 : 0,
      },
      details,
    },
    metrics: {
      delta,
      cvd,
      imbalance: bookImbalanceValue,
      buyShare: totals.volume > 0 ? totals.buy / totals.volume : null,
      volume: totals.volume,
    },
    state,
    smoothedImbalance,
    cvdSeries: series,
    windowVolume: totals.volume,
    candleCount: candleDeltas.length,
  };
}

/**
 * Build a full `OrderFlowReading` from the live aggregator's minute buckets.
 *
 * Shared by the panel hook and the per-timeframe readings hook, so the Compass
 * and the panel can never disagree about what the flow reading is. The forming
 * candle is dropped by `candleDeltas`, so only closed candles reach the gauge.
 */
export function buildLiveOrderFlowReading(input: {
  minutes: MinuteBucket[];
  timeframeMinutes: number;
  resetAt: number;
  imbalance: number | null;
  venue: string;
  config: CompassConfig;
  maxCandles?: number;
}): OrderFlowReadingResult | null {
  const deltas = candleDeltas(
    input.minutes,
    input.timeframeMinutes,
    input.resetAt,
    input.maxCandles ?? 120
  );
  if (deltas.length === 0) return null;
  return buildOrderFlowReading(deltas, input.imbalance, input.config, {
    ...DEFAULT_ORDER_FLOW_READING_CONFIG,
    imbalanceLevels: input.config.orderFlow.imbalanceLevels,
    smoothing: input.config.orderFlow.smoothing,
    neutralZone: input.config.orderFlow.neutralZone,
    hysteresis: input.config.orderFlow.hysteresis,
  });
}
