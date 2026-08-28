// ============================================================================
// MARKET STATE MACHINE
// ============================================================================
// Explicit, deterministic state transitions based on price location and context quality.

import { ConflictReport, MarketContext, MarketState, Severity } from './types';
import { ConfluenceZone } from './types';
import { isPriceInZone, isPriceApproaching } from './clustering';
import { ClusterConfig, DEFAULT_CLUSTER_CONFIG } from './clustering';

export interface StateMachineInput {
  currentPrice: number;
  zones: ConfluenceZone[];
  contextScore: number;       // -100..+100
  confidenceScore: number;    // 0..100
  dataQualityScore: number;   // 0..1
  previousState: MarketState;
  approachingDistance: number;
}

export interface StateMachineResult {
  state: MarketState;
  stateMessage: string;
  hasValidContext: boolean;
}

/**
 * Determine the market state based on price location, zone proximity,
 * and context quality.
 */
export function determineMarketState(input: StateMachineInput): StateMachineResult {
  const { currentPrice, zones, contextScore, confidenceScore, dataQualityScore, previousState } = input;

  // Find the nearest zone
  const nearestZone = zones.length > 0 ? zones[0] : null;

  // No zones or all far away
  if (!nearestZone) {
    return {
      state: 'WAITING',
      stateMessage: 'No relevant institutional zones detected. Waiting for structure.',
      hasValidContext: false,
    };
  }

  const inZone = isPriceInZone(nearestZone, currentPrice);
  const approaching = isPriceApproaching(nearestZone, currentPrice, { ...DEFAULT_CLUSTER_CONFIG, approachingDistance: input.approachingDistance });
  const dist = Math.abs(nearestZone.distanceToPrice);

  // State transitions
  if (!inZone && !approaching) {
    // Price is far from all relevant zones
    if (previousState === 'WAITING' || previousState === 'MONITORING') {
      return {
        state: 'WAITING',
        stateMessage: `Waiting for valid context. Nearest zone ${dist.toFixed(1)} pts away.`,
        hasValidContext: false,
      };
    }
    // Was inside zone, now exited
    return {
      state: 'EXITED_ZONE',
      stateMessage: `Exited institutional zone. ${dist.toFixed(1)} pts from next relevant area.`,
      hasValidContext: false,
    };
  }

  if (approaching && !inZone) {
    return {
      state: 'APPROACHING_ZONE',
      stateMessage: `Approaching ${nearestZone.direction} zone (${nearestZone.sources.join(' + ')}). Distance: ${dist.toFixed(1)} pts.`,
      hasValidContext: false,
    };
  }

  if (inZone) {
    // Inside zone - evaluate context quality
    if (dataQualityScore < 0.5) {
      return {
        state: 'ANALYZING',
        stateMessage: 'Inside institutional zone but data quality is low. Defer decision.',
        hasValidContext: false,
      };
    }

    if (Math.abs(contextScore) < 15) {
      return {
        state: 'ANALYZING',
        stateMessage: 'Inside zone. Conflicting evidence - awaiting clearer signal.',
        hasValidContext: false,
      };
    }

    if (confidenceScore >= 70 && Math.abs(contextScore) >= 30) {
      return {
        state: 'HIGH_CONFLUENCE',
        stateMessage: `HIGH CONFLUENCE: ${contextScore > 0 ? 'BULLISH' : 'BEARISH'} context at ${nearestZone.direction} zone. Score: ${contextScore} | Confidence: ${confidenceScore}.`,
        hasValidContext: true,
      };
    }

    if (confidenceScore >= 50) {
      return {
        state: 'CONFIRMATION',
        stateMessage: `Building confirmation inside ${nearestZone.direction} zone. Score: ${contextScore} | Confidence: ${confidenceScore}.`,
        hasValidContext: true,
      };
    }

    return {
      state: 'IN_ZONE',
      stateMessage: `Inside ${nearestZone.direction} zone (${nearestZone.sources.join(' + ')}). Analyzing context...`,
      hasValidContext: false,
    };
  }

  // Default fallback
  return {
    state: 'MONITORING',
    stateMessage: 'Monitoring market conditions.',
    hasValidContext: false,
  };
}

/**
 * Detect conflicts between factors.
 * A conflict exists when a high-weight factor opposes the overall directional bias.
 */
export function detectConflicts(
  context: MarketContext,
  factors: { category: string; weight: number; polarity: string; label: string; timeframe?: string }[]
): ConflictReport[] {
  const conflicts: ConflictReport[] = [];
  const bias = context.directionalBias;

  if (bias === 'NEUTRAL') return conflicts;

  // Look for HTF structure vs LTF flow conflicts
  const structureFactor = factors.find(f => f.category === 'MARKET_STRUCTURE' && f.timeframe === 'HTF');
  const flowFactor = factors.find(f => f.category === 'ORDER_FLOW');

  if (structureFactor && flowFactor) {
    const structDir = structureFactor.weight > 0 ? 'BULLISH' : 'BEARISH';
    const flowDir = flowFactor.weight > 0 ? 'BULLISH' : 'BEARISH';
    if (structDir !== flowDir) {
      conflicts.push({
        id: 'htf-vs-flow',
        description: 'Higher timeframe structure disagrees with short-term order flow',
        severity: 'HIGH',
        bullishSide: `Order Flow: ${flowDir}`,
        bearishSide: `HTF Structure: ${structDir}`,
      });
    }
  }

  // Look for EMA stack vs zone direction conflicts
  const emaFactor = factors.find(f => f.category === 'STRUCTURAL_EMA');
  const zoneFactor = factors.find(f => f.category === 'INSTITUTIONAL_ZONE');

  if (emaFactor && zoneFactor) {
    const emaDir = emaFactor.weight > 0 ? 'BULLISH' : 'BEARISH';
    const zoneDir = zoneFactor.weight > 0 ? 'BULLISH' : 'BEARISH';
    if (emaDir !== zoneDir && Math.abs(emaFactor.weight) > 0.3) {
      conflicts.push({
        id: 'ema-vs-zone',
        description: 'EMA 200 trend opposes the institutional zone direction',
        severity: 'MEDIUM',
        bullishSide: `Zone: ${zoneDir}`,
        bearishSide: `EMA 200: ${emaDir}`,
      });
    }
  }

  return conflicts;
}

/**
 * Compute overall conflict severity.
 */
export function overallConflictSeverity(conflicts: ConflictReport[]): Severity {
  if (conflicts.length === 0) return 'LOW';
  if (conflicts.some(c => c.severity === 'EXTREME')) return 'EXTREME';
  if (conflicts.some(c => c.severity === 'HIGH')) return 'HIGH';
  if (conflicts.some(c => c.severity === 'MEDIUM')) return 'MEDIUM';
  return 'LOW';
}