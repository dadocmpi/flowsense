// ============================================
// PER-TIMEFRAME COMPASS ENGINE
// ============================================
// Given one candle series and a timeframe, produce the two component gauges and
// the summary. Pure: same input, same output, no clock and no network.

import type { Candle, Timeframe, TimeframeReading } from './types';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import { buildGauge, buildSummaryGauge } from './scoring';
import { indicatorVotes, movingAverageVotes } from './votes';

const EMPTY_READING_BASE = {
  score: 0,
  label: 'NEUTRAL' as const,
  tally: { buy: 0, neutral: 0, sell: 0 },
  details: [],
};

export function computeTimeframeReading(
  timeframe: Timeframe,
  candles: Candle[],
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): TimeframeReading {
  const price = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const available = candles.length >= config.minCandles;

  if (!available) {
    return {
      timeframe,
      movingAverages: { ...EMPTY_READING_BASE, details: [] },
      indicators: { ...EMPTY_READING_BASE, details: [] },
      summary: { ...EMPTY_READING_BASE, details: [] },
      price,
      candleCount: candles.length,
      available: false,
    };
  }

  const movingAverages = buildGauge(movingAverageVotes(candles, config), config.maWeights, config);
  const indicators = buildGauge(indicatorVotes(candles, config), config.indicatorWeights, config);
  const summary = buildSummaryGauge(movingAverages, indicators, config);

  return {
    timeframe,
    movingAverages,
    indicators,
    summary,
    price,
    candleCount: candles.length,
    available: true,
  };
}
