// ============================================
// COMPASS ENGINE TYPES
// ============================================

export type CompassDirection =
  | 'STRONG_BUY'
  | 'BUY'
  | 'NEUTRAL'
  | 'SELL'
  | 'STRONG_SELL';

export type DataLabel = 'LIVE' | 'DELAYED' | 'CACHED' | 'SIMULATED' | 'UNAVAILABLE';

export interface FactorContribution {
  category: string;
  name: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  weight: number;
  value: string;
  confidence: number;
}

export interface LiveAnalysisState {
  minuteKey: string | null;
  rawScore: number;
  rawDirection: CompassDirection;
  factorAgreement: number;
  totalFactors: number;
  availableFactors: number;
  marketRegime: string;
  dataQuality: number;
  dataLabel: DataLabel;
  factors: FactorContribution[];
  timestamp: number;
  price: number;
  isStale: boolean;
}

export interface OfficialCompassState {
  minuteKey: string;
  direction: CompassDirection;
  score: number;
  confidence: number;
  factorSummary: string[];
  timestamp: number;
  price: number;
  marketRegime: string;
  dataQuality: number;
  dataLabel: DataLabel;
  reason: string;
  isStale: boolean;
}

export interface CompassEngineConfig {
  minValidFactors: number;
  minConfidence: number;
  scoreThreshold: number;
  directionChangeThreshold: number;
  maxDataAgeMs: number;
  minFactorAgreement: number;
  strongBuyScore: number;
  buyScore: number;
  sellScore: number;
  strongSellScore: number;
}

export const DEFAULT_COMPASS_CONFIG: CompassEngineConfig = {
  minValidFactors: 3,
  minConfidence: 40,
  scoreThreshold: 50,
  directionChangeThreshold: 15,
  maxDataAgeMs: 60000,
  // Percentage of weighted directional agreement required to publish. This is
  // an anti-noise gate: a near-tie reading should not flip the official signal.
  minFactorAgreement: 55,
  strongBuyScore: 75,
  buyScore: 55,
  sellScore: 45,
  strongSellScore: 25,
};

export interface SignalHistoryEntry {
  minuteKey: string;
  direction: CompassDirection;
  score: number;
  confidence: number;
  price: number;
  marketRegime: string;
  dataQuality: number;
  dataLabel: DataLabel;
  timestamp: number;
  factorSummary: string[];
}