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

import type { Candle, ChangeBasis, Timeframe, TimeframeReading } from './types';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import { buildGauge, buildSummaryGauge, buildTechnicalGauge } from './scoring';
import { indicatorVotes, movingAverageVotes } from './votes';
import { analyzeMarketStructure } from './structure';
import { computeTechnicalMetrics } from './metrics';
import { candlesInCurrentSession } from './session';

const EMPTY_READING_BASE = {
  score: 0,
  label: 'NEUTRAL' as const,
  tally: { buy: 0, neutral: 0, sell: 0 },
  details: [],
};

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
  // The summary blends REAL order flow when a venue feed supplied one; with no
  // source it is the technical reading itself.
  const summary = buildSummaryGauge(technical, orderFlow?.gauge ?? null, config);

  return {
    timeframe,
    technical,
    summary,
    orderFlow,
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
