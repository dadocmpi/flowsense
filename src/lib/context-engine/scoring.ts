// ============================================================================
// CONTEXTUAL SCORING ENGINE
// ============================================================================
// Replaces "buy count vs sell count" with weighted, multi-factor scoring.
// Detects correlated signals (e.g. multiple EMAs) and avoids double-counting.

import { AnalysisFactor, CategoryWeights, DEFAULT_WEIGHTS, ZoneDirection } from './types';

export interface ScoringInput {
  // Market structure
  ltfTrend: ZoneDirection;
  mtfTrend: ZoneDirection;
  htfTrend: ZoneDirection;

  // Institutional zone
  nearestZoneDirection: ZoneDirection | null;
  nearestZoneConfluence: number;
  priceInZone: boolean;
  priceApproachingZone: boolean;

  // Order flow
  volumeDelta: number;
  buyerDominance: number;     // 0..1
  orderFlowBias: ZoneDirection;

  // Order book
  orderBookImbalance: number; // -1..+1 (positive = more bids)
  orderBookAvailable: boolean;

  // Volume
  relativeVolume: number;     // 1.0 = average
  volumeAvailable: boolean;

  // Structural EMA (a single category - all EMAs together)
  priceVsEMAStack: ZoneDirection; // bullish if price > all, bearish if below all, mixed otherwise
  ema200Bias: ZoneDirection;      // primary structural EMA

  // Oscillators
  rsi: number;                 // 0..100
  rsiExtreme: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  macdHistogram: number;      // signed
  macdBias: ZoneDirection;
  momentum: number;           // signed
  momentumBias: ZoneDirection;
}

export interface ScoringResult {
  factors: AnalysisFactor[];
  contextScore: number;       // -100..+100
  confidenceScore: number;    // 0..100
  directionalBias: ZoneDirection;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
}

/**
 * Compute the contextual score from all inputs.
 * Each category contributes at most ONE factor (no double-counting of correlated signals).
 */
export function computeContextScore(
  input: ScoringInput,
  weights: CategoryWeights = DEFAULT_WEIGHTS,
  timestamp: number = Date.now()
): ScoringResult {
  const factors: AnalysisFactor[] = [];

  // ---- MARKET STRUCTURE (single composite factor) ----
  // HTF dominates. LTF can amplify but not override.
  const structureNet = htfDominantScore(input.htfTrend, input.mtfTrend, input.ltfTrend);
  if (input.htfTrend !== 'NEUTRAL') {
    factors.push({
      id: 'structure-composite',
      category: 'MARKET_STRUCTURE',
      label: `Structure (HTF ${input.htfTrend})`,
      description: `HTF ${input.htfTrend} / MTF ${input.mtfTrend} / LTF ${input.ltfTrend}`,
      weight: structureNet * weights.MARKET_STRUCTURE,
      polarity: structureNet > 0 ? 'POSITIVE' : structureNet < 0 ? 'NEGATIVE' : 'NEUTRAL',
      timeframe: 'HTF',
      timestamp,
      source: 'structure.composite',
    });
  }

  // ---- INSTITUTIONAL ZONE ----
  // Only counts if we have a relevant zone near price.
  if (input.nearestZoneDirection) {
    const zoneFactor = computeZoneFactor(input);
    factors.push({
      id: 'institutional-zone',
      category: 'INSTITUTIONAL_ZONE',
      label: `Zone ${input.nearestZoneDirection} (confluence: ${input.nearestZoneConfluence})`,
      description: input.priceInZone
        ? 'Price is inside the institutional zone'
        : input.priceApproachingZone
          ? 'Price is approaching the institutional zone'
          : 'Zone exists but price is not near it',
      weight: zoneFactor * weights.INSTITUTIONAL_ZONE,
      polarity: zoneFactor > 0 ? 'POSITIVE' : zoneFactor < 0 ? 'NEGATIVE' : 'NEUTRAL',
      timestamp,
      source: 'zone.nearest',
    });
  }

  // ---- ORDER FLOW ----
  if (input.volumeDelta !== 0 || input.buyerDominance !== 0.5) {
    const flowFactor = computeOrderFlowFactor(input);
    factors.push({
      id: 'orderflow-composite',
      category: 'ORDER_FLOW',
      label: `Order Flow ${input.orderFlowBias}`,
      description: `Delta: ${input.volumeDelta.toFixed(0)}, Buyer dominance: ${(input.buyerDominance * 100).toFixed(0)}%`,
      weight: flowFactor * weights.ORDER_FLOW,
      polarity: flowFactor > 0 ? 'POSITIVE' : flowFactor < 0 ? 'NEGATIVE' : 'NEUTRAL',
      timestamp,
      source: 'orderflow.composite',
    });
  }

  // ---- ORDER BOOK ----
  if (input.orderBookAvailable) {
    const bookFactor = input.orderBookImbalance;
    factors.push({
      id: 'orderbook-imbalance',
      category: 'ORDER_BOOK',
      label: `Order Book Imbalance ${bookFactor > 0 ? 'BID' : 'ASK'}`,
      description: `Imbalance: ${(bookFactor * 100).toFixed(0)}%`,
      weight: bookFactor * weights.ORDER_BOOK,
      polarity: bookFactor > 0 ? 'POSITIVE' : bookFactor < 0 ? 'NEGATIVE' : 'NEUTRAL',
      timestamp,
      source: 'orderbook.imbalance',
    });
  }

  // ---- VOLUME ----
  if (input.volumeAvailable) {
    const volFactor = computeVolumeFactor(input.relativeVolume);
    factors.push({
      id: 'volume-relative',
      category: 'VOLUME',
      label: `Relative Volume ${input.relativeVolume.toFixed(2)}x`,
      description: input.relativeVolume > 1.5 ? 'Above average volume confirms move' : input.relativeVolume < 0.5 ? 'Below average volume - weak conviction' : 'Average volume',
      weight: volFactor * weights.VOLUME,
      polarity: volFactor > 0 ? 'POSITIVE' : volFactor < 0 ? 'NEGATIVE' : 'NEUTRAL',
      timestamp,
      source: 'volume.relative',
    });
  }

  // ---- STRUCTURAL EMA (single category - prevents 4x counting) ----
  if (input.priceVsEMAStack !== 'NEUTRAL') {
    const emaFactor = input.priceVsEMAStack === 'BULLISH' ? 1 : -1;
    factors.push({
      id: 'ema-stack',
      category: 'STRUCTURAL_EMA',
      label: `EMA Stack ${input.priceVsEMAStack}`,
      description: `Price ${input.priceVsEMAStack} EMA stack, EMA200 bias: ${input.ema200Bias}`,
      weight: emaFactor * weights.STRUCTURAL_EMA,
      polarity: emaFactor > 0 ? 'POSITIVE' : 'NEGATIVE',
      timestamp,
      source: 'ema.stack',
    });
  }

  // ---- RSI ----
  if (input.rsi > 0) {
    const rsiFactor = computeRSIFactor(input.rsi);
    factors.push({
      id: 'rsi',
      category: 'RSI',
      label: `RSI ${input.rsi.toFixed(0)} (${input.rsiExtreme})`,
      description: rsiFactor > 0 ? 'RSI supports directional bias' : rsiFactor < 0 ? 'RSI warns of reversal' : 'RSI neutral',
      weight: rsiFactor * weights.RSI,
      polarity: rsiFactor > 0 ? 'POSITIVE' : rsiFactor < 0 ? 'NEGATIVE' : 'NEUTRAL',
      timestamp,
      source: 'rsi.14',
    });
  }

  // ---- MACD ----
  factors.push({
    id: 'macd',
    category: 'MACD',
    label: `MACD ${input.macdBias}`,
    description: `Histogram: ${input.macdHistogram.toFixed(2)}`,
    weight: (input.macdBias === 'BULLISH' ? 1 : input.macdBias === 'BEARISH' ? -1 : 0) * weights.MACD,
    polarity: input.macdBias === 'BULLISH' ? 'POSITIVE' : input.macdBias === 'BEARISH' ? 'NEGATIVE' : 'NEUTRAL',
    timestamp,
    source: 'macd.12-26',
  });

  // ---- MOMENTUM ----
  factors.push({
    id: 'momentum',
    category: 'MOMENTUM',
    label: `Momentum ${input.momentumBias}`,
    description: `Momentum: ${input.momentum.toFixed(2)}`,
    weight: (input.momentumBias === 'BULLISH' ? 1 : input.momentumBias === 'BEARISH' ? -1 : 0) * weights.MOMENTUM,
    polarity: input.momentumBias === 'BULLISH' ? 'POSITIVE' : input.momentumBias === 'BEARISH' ? 'NEGATIVE' : 'NEUTRAL',
    timestamp,
    source: 'momentum.10',
  });

  // ---- COMPUTE FINAL SCORE ----
  // Context score: signed sum of all factor weights, normalized to -100..+100
  const rawScore = factors.reduce((s, f) => s + f.weight, 0);
  const totalPossibleWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const contextScore = Math.max(-100, Math.min(100, (rawScore / totalPossibleWeight) * 100));

  // Confidence: based on the number of meaningful factors and their agreement
  const positiveCount = factors.filter(f => f.polarity === 'POSITIVE').length;
  const negativeCount = factors.filter(f => f.polarity === 'NEGATIVE').length;
  const neutralCount = factors.filter(f => f.polarity === 'NEUTRAL').length;
  const totalFactors = factors.length;
  const dominantCount = Math.max(positiveCount, negativeCount);
  const agreement = totalFactors > 0 ? dominantCount / totalFactors : 0;
  const confidenceScore = Math.round(agreement * 100);

  // Directional bias
  let directionalBias: ZoneDirection = 'NEUTRAL';
  if (Math.abs(contextScore) < 5) directionalBias = 'NEUTRAL';
  else if (contextScore > 0) directionalBias = 'BULLISH';
  else directionalBias = 'BEARISH';

  return {
    factors,
    contextScore: Math.round(contextScore),
    confidenceScore,
    directionalBias,
    positiveCount,
    negativeCount,
    neutralCount,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function htfDominantScore(htf: ZoneDirection, mtf: ZoneDirection, ltf: ZoneDirection): number {
  // HTF gets 0.6, MTF 0.3, LTF 0.1 of the structure contribution
  const score = (dirToScore(htf) * 0.6) + (dirToScore(mtf) * 0.3) + (dirToScore(ltf) * 0.1);
  return Math.max(-1, Math.min(1, score));
}

function dirToScore(d: ZoneDirection): number {
  if (d === 'BULLISH') return 1;
  if (d === 'BEARISH') return -1;
  return 0;
}

function computeZoneFactor(input: ScoringInput): number {
  if (!input.nearestZoneDirection) return 0;

  // Zone direction maps to base score
  const base = dirToScore(input.nearestZoneDirection);

  // Confluence amplifies: more sources = more relevant
  const confluenceBoost = Math.min(1.5, 1 + (input.nearestZoneConfluence - 1) * 0.15);

  // Location modifier: only counts strongly if price is in or near the zone
  let locationMod = 0.1; // baseline if zone exists but price is far
  if (input.priceInZone) locationMod = 1.0;
  else if (input.priceApproachingZone) locationMod = 0.6;

  return base * confluenceBoost * locationMod;
}

function computeOrderFlowFactor(input: ScoringInput): number {
  // Combine delta sign and buyer dominance
  const deltaNorm = Math.tanh(input.volumeDelta / 1000); // squashes large values
  const buyerNorm = (input.buyerDominance - 0.5) * 2;     // -1..+1
  return (deltaNorm * 0.6) + (buyerNorm * 0.4);
}

function computeVolumeFactor(relativeVolume: number): number {
  // High volume confirms moves (positive when there's a clear directional bias)
  // Low volume weakens conviction
  if (relativeVolume > 1.5) return 0.5;
  if (relativeVolume > 1.0) return 0.2;
  if (relativeVolume < 0.5) return -0.3;
  return 0;
}

function computeRSIFactor(rsi: number): number {
  // Overbought/Oversold are warnings, not signals
  if (rsi > 75) return -0.3;  // Overbought - warn against long
  if (rsi > 65) return 0.2;   // Bullish momentum
  if (rsi < 25) return 0.3;   // Oversold - potential reversal up
  if (rsi < 35) return -0.2;  // Bearish momentum
  return 0;                   // Neutral
}