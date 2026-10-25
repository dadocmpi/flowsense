// ============================================
// COMPASS SCORING
// ============================================
// The one place where votes become a score and a score becomes a label.
//
// The scale is signed: -100 (strong sell) .. 0 (neutral) .. +100 (strong buy).
// The label is ALWAYS derived from the same score the gauge is drawn from, so
// a positive score can never read "Sell". This invariant is locked in by tests.

import type { GaugeReading, ScoreLabel, Vote, VoteDetail, VoteTally } from './types';
import type { CompassConfig } from '../config/compass';

/** +1 for a buy, -1 for a sell, 0 for neutral. */
export function voteValue(vote: Vote): number {
  switch (vote) {
    case 'BUY':
      return 1;
    case 'SELL':
      return -1;
    default:
      return 0;
  }
}

export function tallyVotes(details: VoteDetail[]): VoteTally {
  const tally: VoteTally = { buy: 0, neutral: 0, sell: 0 };
  for (const detail of details) {
    if (detail.vote === 'BUY') tally.buy += 1;
    else if (detail.vote === 'SELL') tally.sell += 1;
    else tally.neutral += 1;
  }
  return tally;
}

/**
 * Map a signed score onto the five labels. The mapping is deliberately
 * symmetric and monotonic, and it is the only definition of a label in the
 * codebase.
 */
export function labelFromScore(score: number, config: CompassConfig): ScoreLabel {
  const { strongBuy, buy, sell, strongSell } = config.thresholds;
  if (score >= strongBuy) return 'STRONG_BUY';
  if (score >= buy) return 'BUY';
  if (score <= strongSell) return 'STRONG_SELL';
  if (score <= sell) return 'SELL';
  return 'NEUTRAL';
}

/** Human wording for a label. */
export function labelText(label: ScoreLabel): string {
  switch (label) {
    case 'STRONG_BUY':
      return 'Strong buy';
    case 'BUY':
      return 'Buy';
    case 'SELL':
      return 'Sell';
    case 'STRONG_SELL':
      return 'Strong sell';
    default:
      return 'Neutral';
  }
}

export function isBullishLabel(label: ScoreLabel): boolean {
  return label === 'BUY' || label === 'STRONG_BUY';
}

export function isBearishLabel(label: ScoreLabel): boolean {
  return label === 'SELL' || label === 'STRONG_SELL';
}

/**
 * Weighted vote score, normalised to -100..+100.
 *
 * The denominator is the summed weight of every detail that actually produced
 * a directional vote, not the whole block: a block that only has half its
 * lines available should still be able to read strong, it just has fewer
 * votes behind it. When nothing voted directionally the score is 0 (neutral).
 */
export function scoreFromVotes(
  details: VoteDetail[],
  weights: Record<string, number>,
  fallbackWeight = 1
): number {
  let weightedSum = 0;
  let directionalWeight = 0;

  for (const detail of details) {
    const value = voteValue(detail.vote);
    if (value === 0) continue;
    const weight = weights[detail.name] ?? fallbackWeight;
    weightedSum += value * weight;
    directionalWeight += weight;
  }

  if (directionalWeight === 0) return 0;
  return clampScore((weightedSum / directionalWeight) * 100);
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(-100, Math.min(100, score));
}

/** Build a complete gauge reading from its votes. */
export function buildGauge(
  details: VoteDetail[],
  weights: Record<string, number>,
  config: CompassConfig
): GaugeReading {
  const score = scoreFromVotes(details, weights);
  return {
    score,
    label: labelFromScore(score, config),
    tally: tallyVotes(details),
    details,
  };
}

/**
 * The combined summary gauge: the two component gauges blended by the
 * configured weights. Blending happens on the signed scores, so a neutral MA
 * block cannot drag a strong indicator block to the opposite side.
 */
export function buildSummaryGauge(
  movingAverages: GaugeReading,
  indicators: GaugeReading,
  config: CompassConfig
): GaugeReading {
  const maWeight = config.gaugeBlend.movingAverages;
  const indWeight = config.gaugeBlend.indicators;
  const total = maWeight + indWeight;

  const score =
    total === 0
      ? 0
      : clampScore((movingAverages.score * maWeight + indicators.score * indWeight) / total);

  return {
    score,
    label: labelFromScore(score, config),
    tally: {
      buy: movingAverages.tally.buy + indicators.tally.buy,
      neutral: movingAverages.tally.neutral + indicators.tally.neutral,
      sell: movingAverages.tally.sell + indicators.tally.sell,
    },
    details: [...movingAverages.details, ...indicators.details],
  };
}

export interface ConfluenceResult {
  /** Weighted bias across every available timeframe, -100..+100. */
  bias: number;
  label: ScoreLabel;
  /** How many timeframes agree with the bias direction. */
  agreeing: number;
  /** How many timeframes produced a directional vote. */
  directional: number;
  /** How many timeframes were available at all. */
  available: number;
  /** 0-100: share of the weighted directional vote backing the bias. */
  agreement: number;
  /** The direction timeframes agree on, or null when they are split. */
  direction: 'BULLISH' | 'BEARISH' | null;
}

/**
 * Multi-timeframe confluence: each timeframe's signed score is weighted and
 * averaged. Agreement is measured on the weighted directional votes, so one
 * strong daily reading is not drowned out by four flat intraday ones.
 */
export function computeConfluence(
  readings: Array<{ timeframe: string; score: number; available: boolean }>,
  config: CompassConfig
): ConfluenceResult {
  let weightedSum = 0;
  let totalWeight = 0;
  let bullishWeight = 0;
  let bearishWeight = 0;
  let available = 0;
  let directional = 0;

  for (const reading of readings) {
    if (!reading.available) continue;
    available += 1;

    const weight = config.timeframeWeights[reading.timeframe as keyof typeof config.timeframeWeights] ?? 0;
    if (weight <= 0) continue;

    weightedSum += reading.score * weight;
    totalWeight += weight;

    if (reading.score > 0) {
      bullishWeight += weight;
      directional += 1;
    } else if (reading.score < 0) {
      bearishWeight += weight;
      directional += 1;
    }
  }

  const bias = totalWeight === 0 ? 0 : clampScore(weightedSum / totalWeight);
  const label = labelFromScore(bias, config);

  const sideWeight = bullishWeight + bearishWeight;
  const winningWeight = Math.max(bullishWeight, bearishWeight);
  const agreement = sideWeight === 0 ? 0 : Math.round((winningWeight / sideWeight) * 100);

  const direction: ConfluenceResult['direction'] =
    bullishWeight > bearishWeight ? 'BULLISH' : bearishWeight > bullishWeight ? 'BEARISH' : null;

  const agreeing = direction === 'BULLISH' ? bullishWeight : bearishWeight;
  const agreeingCount = direction === null ? 0 : Math.round((agreeing / Math.max(1, sideWeight)) * directional);

  return {
    bias,
    label,
    agreeing: agreeingCount,
    directional,
    available,
    agreement,
    direction,
  };
}

/** Needle angle in degrees: -90 (score -100) .. 0 (score 0) .. +90 (score +100). */
export function needleAngleFromScore(score: number): number {
  return (clampScore(score) / 100) * 90;
}

/**
 * Confidence in a reading: how far the score sits from neutral, damped by how
 * much of the block was actually available.
 */
export function confidenceFromGauge(gauge: GaugeReading, expectedVotes: number): number {
  const distance = Math.abs(gauge.score) / 100;
  const coverage = expectedVotes <= 0 ? 1 : Math.min(1, gauge.details.length / expectedVotes);
  return Math.round(Math.min(1, distance * coverage) * 100);
}
