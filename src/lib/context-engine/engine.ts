// ============================================================================
// MARKET CONTEXT ENGINE - MAIN ORCHESTRATOR
// ============================================================================
// Combines all sub-engines into a unified MarketContext output.
// This is the central decision architecture of the application.

import {
  MarketContext,
  MarketState,
  ZoneDirection,
  CategoryWeights,
  DEFAULT_WEIGHTS,
  AnalysisFactor,
  ConflictReport,
  DataQuality,
} from './types';

import { buildMarketStructure, findSwings, structureTrendToBias } from './structure';
import { detectAllZones, Candle } from './zones';
import { clusterZones, rankConfluenceZones, updateZoneStatuses, ClusterConfig, DEFAULT_CLUSTER_CONFIG } from './clustering';
import { computeContextScore, ScoringInput } from './scoring';
import { determineMarketState, detectConflicts } from './stateMachine';
import { assessDataQuality, DataQualityInput } from './dataQuality';

// Technical indicator helpers (kept local to engine)
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export interface ContextEngineInput {
  symbol: string;
  currentPrice: number;
  /** Recent candle history (most recent last). */
  candles: Candle[];
  /** Order book imbalance: positive = more bids, range -1..+1. Null if unavailable. */
  orderBookImbalance: number | null;
  /** Trade tape: signed volume (buy - sell). Null if unavailable. */
  volumeDelta: number | null;
  /** Buyer dominance from tape: 0..1. Null if unavailable. */
  buyerDominance: number | null;
  /** Order book available. */
  hasOrderBook: boolean;
  /** Trade tape available. */
  hasTape: boolean;
  /** Number of recent trades in tape. */
  tapeTradeCount: number;
  /** Number of order book levels available. */
  orderBookLevels: number;
  /** Last update timestamps. */
  lastTickerUpdate: number;
  lastTapeUpdate: number;
  lastDepthUpdate: number;
  /** Previous engine state (for transitions). */
  previousState?: MarketState;
  /** Optional weight overrides. */
  weights?: CategoryWeights;
  /** Optional cluster config overrides. */
  clusterConfig?: ClusterConfig;
}

export interface ContextEngineResult {
  context: MarketContext;
  zones: ReturnType<typeof clusterZones>;
}

/**
 * Build the full Market Context for a given moment.
 * This is the single entry point that the UI should call.
 */
export function buildMarketContext(input: ContextEngineInput): ContextEngineResult {
  const weights = input.weights || DEFAULT_WEIGHTS;
  const clusterConfig = input.clusterConfig || DEFAULT_CLUSTER_CONFIG;
  const now = Date.now();
  const closes = input.candles.map(c => c.close);
  const volumes = input.candles.map(c => c.volume);

  // ---- 1. STRUCTURE ----
  const ltfStructure = closes.length >= 20 ? buildMarketStructure(closes, 'LTF') : null;
  const swings = closes.length >= 20 ? findSwings(closes, 3, 1) : { highs: [], lows: [] };

  // For HTF/MTF, we approximate by sampling - in production this would use higher-TF candles
  // Here we use the same data with reduced sample size as a placeholder
  const htfCloses = closes.length >= 60 ? sampleCloses(closes, Math.floor(closes.length / 3)) : [];
  const mtfCloses = closes.length >= 30 ? sampleCloses(closes, Math.floor(closes.length / 1.5)) : closes;
  const htfStructure = htfCloses.length >= 20 ? buildMarketStructure(htfCloses, 'HTF') : null;
  const mtfStructure = mtfCloses.length >= 20 ? buildMarketStructure(mtfCloses, 'MTF') : null;

  const htfTrend: ZoneDirection = htfStructure ? htfStructure.trend as ZoneDirection : 'NEUTRAL';
  const mtfTrend: ZoneDirection = mtfStructure ? mtfStructure.trend as ZoneDirection : 'NEUTRAL';
  const ltfTrend: ZoneDirection = ltfStructure ? ltfStructure.trend as ZoneDirection : 'NEUTRAL';

  // ---- 2. ZONES ----
  const rawZones = detectAllZones(input.candles, undefined, swings);
  const clustered = clusterZones(rawZones, clusterConfig);
  const ranked = rankConfluenceZones(clustered, input.currentPrice, clusterConfig);
  const withStatus = updateZoneStatuses(ranked, input.currentPrice);

  const nearestZone = withStatus[0] || null;
  const priceInZone = nearestZone ? input.currentPrice >= nearestZone.low && input.currentPrice <= nearestZone.high : false;
  const priceApproachingZone = nearestZone ? Math.abs(nearestZone.distanceToPrice) <= clusterConfig.approachingDistance && !priceInZone : false;

  // ---- 3. DATA QUALITY ----
  const dqInput: DataQualityInput = {
    hasOrderBook: input.hasOrderBook,
    hasTape: input.hasTape,
    hasVolume: volumes.length > 0 && volumes.some(v => v > 0),
    hasStructure: ltfStructure !== null,
    hasZones: rawZones.length > 0,
    lastTickerUpdate: input.lastTickerUpdate,
    lastTapeUpdate: input.lastTapeUpdate,
    lastDepthUpdate: input.lastDepthUpdate,
    now,
    tapeTradeCount: input.tapeTradeCount,
    orderBookLevels: input.orderBookLevels,
  };
  const dataQuality = assessDataQuality(dqInput);

  // ---- 4. INDICATORS ----
  const rsi = closes.length >= 15 ? calculateRSI(closes, 14) : 50;
  const ema10 = closes.length >= 10 ? calculateEMA(closes, 10) : 0;
  const ema20 = closes.length >= 20 ? calculateEMA(closes, 20) : 0;
  const ema50 = closes.length >= 50 ? calculateEMA(closes, 50) : 0;
  const ema200 = closes.length >= 200 ? calculateEMA(closes, 200) : 0;

  // EMA stack direction: bullish only if price is above ALL key EMAs
  let emaStackDir: ZoneDirection = 'NEUTRAL';
  if (ema10 > 0 && ema20 > 0 && ema50 > 0) {
    const aboveAll = input.currentPrice > ema10 && input.currentPrice > ema20 && input.currentPrice > ema50;
    const belowAll = input.currentPrice < ema10 && input.currentPrice < ema20 && input.currentPrice < ema50;
    if (aboveAll) emaStackDir = 'BULLISH';
    else if (belowAll) emaStackDir = 'BEARISH';
  }
  const ema200Dir: ZoneDirection = ema200 > 0 ? (input.currentPrice > ema200 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';

  // MACD
  const ema12 = closes.length >= 12 ? calculateEMA(closes, 12) : 0;
  const ema26 = closes.length >= 26 ? calculateEMA(closes, 26) : 0;
  const macdHist = ema12 - ema26;
  const macdDir: ZoneDirection = Math.abs(macdHist) < 0.01 ? 'NEUTRAL' : macdHist > 0 ? 'BULLISH' : 'BEARISH';

  // Momentum (10-period ROC)
  const momentum = closes.length >= 11 ? input.currentPrice - closes[closes.length - 11] : 0;
  const momentumDir: ZoneDirection = Math.abs(momentum) < 0.01 ? 'NEUTRAL' : momentum > 0 ? 'BULLISH' : 'BEARISH';

  // RSI extreme
  const rsiExtreme: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' =
    rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL';

  // Order flow bias
  const orderFlowBias: ZoneDirection =
    input.volumeDelta === null ? 'NEUTRAL' :
    input.volumeDelta > 0 ? 'BULLISH' :
    input.volumeDelta < 0 ? 'BEARISH' : 'NEUTRAL';

  // Relative volume
  const avgVol = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const lastVol = volumes[volumes.length - 1] || 0;
  const relativeVolume = avgVol > 0 ? lastVol / avgVol : 1.0;

  // ---- 5. SCORING ----
  const scoringInput: ScoringInput = {
    ltfTrend,
    mtfTrend,
    htfTrend,
    nearestZoneDirection: nearestZone ? nearestZone.direction : null,
    nearestZoneConfluence: nearestZone ? nearestZone.confluenceCount : 0,
    priceInZone,
    priceApproachingZone,
    volumeDelta: input.volumeDelta ?? 0,
    buyerDominance: input.buyerDominance ?? 0.5,
    orderFlowBias,
    orderBookImbalance: input.orderBookImbalance ?? 0,
    orderBookAvailable: input.hasOrderBook,
    relativeVolume,
    volumeAvailable: avgVol > 0,
    priceVsEMAStack: emaStackDir,
    ema200Bias: ema200Dir,
    rsi,
    rsiExtreme,
    macdHistogram: macdHist,
    macdBias: macdDir,
    momentum,
    momentumBias: momentumDir,
  };

  const scoring = computeContextScore(scoringInput, weights, now);

  // ---- 6. STATE MACHINE ----
  const stateResult = determineMarketState({
    currentPrice: input.currentPrice,
    zones: withStatus,
    contextScore: scoring.contextScore,
    confidenceScore: scoring.confidenceScore,
    dataQualityScore: dataQuality.score,
    previousState: input.previousState || 'WAITING',
    approachingDistance: clusterConfig.approachingDistance,
  });

  // ---- 7. CONFLICTS ----
  const conflicts = detectConflicts(
    {
      symbol: input.symbol,
      price: input.currentPrice,
      timestamp: now,
      state: stateResult.state,
      stateMessage: stateResult.stateMessage,
      directionalBias: scoring.directionalBias,
      contextScore: scoring.contextScore,
      confidenceScore: scoring.confidenceScore,
      dataQuality,
      structure: { ltf: ltfStructure, mtf: mtfStructure, htf: htfStructure },
      nearestZone,
      activeZones: withStatus,
      positiveFactors: scoring.factors.filter(f => f.polarity === 'POSITIVE'),
      negativeFactors: scoring.factors.filter(f => f.polarity === 'NEGATIVE'),
      neutralFactors: scoring.factors.filter(f => f.polarity === 'NEUTRAL'),
      conflicts: [],
      dataAvailability: {
        hasZones: rawZones.length > 0,
        hasOrderBook: input.hasOrderBook,
        hasTape: input.hasTape,
        hasVolume: avgVol > 0,
        hasStructure: ltfStructure !== null,
      },
    },
    scoring.factors
  );

  // Adjust confidence by data quality
  const adjustedConfidence = Math.round(scoring.confidenceScore * dataQuality.score);

  // ---- 8. ASSEMBLE ----
  const context: MarketContext = {
    symbol: input.symbol,
    price: input.currentPrice,
    timestamp: now,
    state: stateResult.state,
    stateMessage: stateResult.stateMessage,
    directionalBias: scoring.directionalBias,
    contextScore: scoring.contextScore,
    confidenceScore: adjustedConfidence,
    dataQuality,
    structure: { ltf: ltfStructure, mtf: mtfStructure, htf: htfStructure },
    nearestZone,
    activeZones: withStatus,
    positiveFactors: scoring.factors.filter(f => f.polarity === 'POSITIVE'),
    negativeFactors: scoring.factors.filter(f => f.polarity === 'NEGATIVE'),
    neutralFactors: scoring.factors.filter(f => f.polarity === 'NEUTRAL'),
    conflicts,
    dataAvailability: {
      hasZones: rawZones.length > 0,
      hasOrderBook: input.hasOrderBook,
      hasTape: input.hasTape,
      hasVolume: avgVol > 0,
      hasStructure: ltfStructure !== null,
    },
  };

  return { context, zones: withStatus };
}

/**
 * Downsample a price series for higher-timeframe approximation.
 * In production, this would be replaced by actual higher-TF candle data.
 */
function sampleCloses(closes: number[], targetLength: number): number[] {
  if (closes.length <= targetLength) return closes;
  const bucketSize = Math.floor(closes.length / targetLength);
  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const start = i * bucketSize;
    const end = Math.min(closes.length, start + bucketSize);
    const slice = closes.slice(start, end);
    result.push(slice[slice.length - 1]); // use last close of bucket
  }
  return result;
}