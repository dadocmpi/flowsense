// ============================================
// PER-TIMEFRAME COMPASS ENGINE
// ============================================
// Given one candle series and a timeframe, produce the three compass readings,
// the market-structure read and the technical metrics. Pure: same input, same
// output, no clock and no network.
//
// The order-flow gauge is NOT computed here. A candle carries no aggressor side
// and no book, so order flow can only arrive from a provider; it is passed in,
// or it is null and the right-hand card says there is no source.

import type {
  Candle,
  ChangeBasis,
  EstimatedOrderFlowReading,
  GaugeReading,
  Timeframe,
  TimeframeReading,
  VoteDetail,
} from './types';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import { buildGauge, buildSummaryGauge, buildTechnicalGauge, labelFromScore } from './scoring';
import { indicatorVotes, movingAverageVotes } from './votes';
import { analyzeMarketStructure } from './structure';
import { computeTechnicalMetrics } from './metrics';
import { candlesInCurrentSession } from './session';
import { estimateOrderFlow, stateToVote, provisionalImbalance, DEFAULT_ESTIMATED_ORDER_FLOW_CONFIG } from './orderFlowEstimator';

const EMPTY_READING_BASE = {
  score: 0,
  label: 'NEUTRAL' as const,
  tally: { buy: 0, neutral: 0, sell: 0 },
  details: [],
};

/**
 * Build an ESTIMATED order-flow gauge from the candles, for an instrument with
 * no real source. The score is the smoothed imbalance on the shared -100..+100
 * scale; the label comes from `labelFromScore`, so it can never disagree with
 * the score. Returns null when the series is too short to estimate.
 *
 * The MAIN value is computed on CLOSED candles only: the newest candle of a live
 * series is the forming bar, so it is peeled off and read as a separate
 * provisional value that never touches the gauge, the Summary or the Compass.
 */
function buildEstimatedFlow(
  candles: Candle[],
  config: CompassConfig
): EstimatedOrderFlowReading | null {
  const forming = candles.length > 0 ? candles[candles.length - 1] : null;
  const closed = forming ? candles.slice(0, -1) : candles;

  const estimate = estimateOrderFlow(closed, {
    ...DEFAULT_ESTIMATED_ORDER_FLOW_CONFIG,
    cvdWindow: config.estimatedOrderFlow.cvdWindow,
    smoothing: config.estimatedOrderFlow.smoothing,
    neutralZone: config.estimatedOrderFlow.neutralZone,
    hysteresis: config.estimatedOrderFlow.hysteresis,
  });
  if (!estimate.available) return null;

  const score = Math.max(-100, Math.min(100, estimate.smoothedImbalance));
  const vote = stateToVote(estimate.state);
  const details: VoteDetail[] = [
    {
      name: 'Estimated delta (CLV x activity)',
      value: estimate.cvd,
      display: `${estimate.cvd >= 0 ? '+' : ''}${Math.round(estimate.cvd)}`,
      vote,
      group: 'ORDER_FLOW',
      note: `Activity proxy: ${estimate.proxy}`,
    },
  ];

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
    estimate,
    estimated: true,
    source: 'Estimated from candles',
    provisional: forming ? provisionalImbalance(forming, estimate.proxy) : null,
  };
}

/**
 * Price change since the session open when the loaded window reaches it,
 * otherwise over the whole loaded window. The basis is returned so the UI can
 * say which one it used rather than implying a session change it cannot know.
 */
function computeChange(
  candles: Candle[],
  config: CompassConfig
): { change: number | null; changePercent: number | null; basis: ChangeBasis | null } {
  if (candles.length < 2) return { change: null, changePercent: null, basis: null };

  const price = candles[candles.length - 1].close;
  const session = candlesInCurrentSession(candles, config.session);

  let basis: ChangeBasis = 'WINDOW';
  let reference = candles[0].open;

  // Two or more session candles means the window actually covers the session
  // open, so the change is a real session change.
  if (session.length >= 2) {
    basis = 'SESSION';
    reference = session[0].open;
  }

  if (!Number.isFinite(reference) || reference === 0) return { change: null, changePercent: null, basis: null };

  const change = price - reference;
  return { change, changePercent: (change / reference) * 100, basis };
}

export function computeTimeframeReading(
  timeframe: Timeframe,
  candles: Candle[],
  config: CompassConfig = DEFAULT_COMPASS_CONFIG,
  orderFlow: TimeframeReading['orderFlow'] = null
): TimeframeReading {
  const price = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const available = candles.length >= config.minCandles;
  const { change, changePercent, basis } = computeChange(candles, config);

  if (!available) {
    return {
      timeframe,
      technical: { ...EMPTY_READING_BASE, details: [] },
      summary: { ...EMPTY_READING_BASE, details: [] },
      orderFlow,
      estimatedFlow: null,
      structure: analyzeMarketStructure(candles),
      metrics: computeTechnicalMetrics(candles, config.session),
      price,
      change,
      changePercent,
      changeBasis: basis,
      candleCount: candles.length,
      available: false,
    };
  }

  const movingAverages = buildGauge(movingAverageVotes(candles, config), config.maWeights, config);
  const indicators = buildGauge(indicatorVotes(candles, config), config.indicatorWeights, config);
  const technical = buildTechnicalGauge(movingAverages, indicators, config);

  // An estimate is only produced when there is no REAL source: a real reading
  // always wins, and an estimate is never mixed with one.
  const estimatedFlow = orderFlow ? null : buildEstimatedFlow(candles, config);
  const summary = buildSummaryGauge(technical, orderFlow?.gauge ?? null, config, estimatedFlow?.gauge ?? null);

  return {
    timeframe,
    technical,
    summary,
    orderFlow,
    estimatedFlow,
    structure: analyzeMarketStructure(candles),
    metrics: computeTechnicalMetrics(candles, config.session),
    price,
    change,
    changePercent,
    changeBasis: basis,
    candleCount: candles.length,
    available: true,
  };
}
