// ============================================================================
// MARKET CONTEXT ENGINE - CORE TYPES
// ============================================================================
// Central type definitions for the contextual decision architecture.
// All types here are framework-agnostic and pure data structures.

/**
 * The discrete states the engine can be in.
 * Drives UI state machine, alert logic, and signal gating.
 */
export type MarketState =
  | 'WAITING'              // No relevant zone near price
  | 'MONITORING'           // Watching market but no approach
  | 'APPROACHING_ZONE'     // Price getting close to a relevant zone
  | 'ENTERING_ZONE'        // Price just entered zone boundaries
  | 'IN_ZONE'              // Price inside a relevant zone
  | 'ANALYZING'            // Inside zone, gathering context
  | 'CONFIRMATION'         // Confirmations accumulating
  | 'HIGH_CONFLUENCE'      // Strong contextual opportunity
  | 'CONFLICT'             // Mixed evidence inside zone
  | 'INVALIDATED'          // Zone lost validity
  | 'EXITED_ZONE';         // Price left the zone

/**
 * Timeframe hierarchy for multi-timeframe analysis.
 */
export type Timeframe = 'LTF' | 'MTF' | 'HTF';

/**
 * Source of a zone: where it was derived from.
 */
export type ZoneSource = 'FVG' | 'ORDER_BLOCK' | 'BREAKER' | 'MITIGATION' | 'POC' | 'LIQUIDITY' | 'STRUCTURAL_SR' | 'VWAP' | 'VOLUME_PROFILE';

/**
 * The current status of an institutional zone.
 */
export type ZoneStatus = 'ACTIVE' | 'TESTED' | 'PARTIALLY_FILLED' | 'CONSUMED' | 'INVALIDATED' | 'EXPIRED';

/**
 * Directional bias of a zone.
 */
export type ZoneDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/**
 * Severity of invalidation / conflict.
 */
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

/**
 * Category weights for the contextual scoring system.
 * Modular and configurable - this is the foundation, not a final calibration.
 */
export interface CategoryWeights {
  MARKET_STRUCTURE: number;
  INSTITUTIONAL_ZONE: number;
  ORDER_FLOW: number;
  ORDER_BOOK: number;
  VOLUME: number;
  LIQUIDITY: number;
  STRUCTURAL_EMA: number;
  RSI: number;
  MACD: number;
  MOMENTUM: number;
}

/**
 * Default weights - represent relative importance hierarchy.
 * NOT empirically calibrated. Should be refined via backtesting.
 */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  MARKET_STRUCTURE: 1.0,
  INSTITUTIONAL_ZONE: 1.2,   // Highest - location is king
  ORDER_FLOW: 0.9,
  ORDER_BOOK: 0.7,
  VOLUME: 0.7,
  LIQUIDITY: 0.8,
  STRUCTURAL_EMA: 0.5,       // Correlated EMAs share a single contribution
  RSI: 0.3,
  MACD: 0.3,
  MOMENTUM: 0.3,
};

/**
 * Raw institutional zone as detected by the Zone Engine.
 */
export interface InstitutionalZone {
  id: string;
  source: ZoneSource;
  direction: ZoneDirection;
  timeframe: Timeframe;
  high: number;
  low: number;
  mid: number;
  createdAt: number;          // timestamp
  status: ZoneStatus;
  testedCount: number;
  strength: number;           // 0..1
  notes?: string;
}

/**
 * Clustered/confluence zone - multiple raw zones grouped together.
 */
export interface ConfluenceZone {
  id: string;
  high: number;
  low: number;
  mid: number;
  direction: ZoneDirection;
  timeframe: Timeframe;
  sources: ZoneSource[];      // e.g. ['FVG', 'ORDER_BLOCK', 'POC']
  rawZoneIds: string[];       // underlying zones
  confluenceCount: number;
  totalStrength: number;      // 0..1
  status: ZoneStatus;
  createdAt: number;
  updatedAt: number;
  lastTestedAt?: number;
  invalidationPrice?: number; // If price crosses this, zone is dead
  distanceToPrice: number;    // absolute distance from current price
  proximityScore: number;     // 0..1, higher = closer
  relevanceScore: number;     // 0..1, final combined ranking
}

/**
 * A single factor (positive, negative, or neutral) that contributes
 * to the contextual score.
 */
export interface AnalysisFactor {
  id: string;
  category: keyof CategoryWeights;
  label: string;              // human-readable
  description?: string;       // detailed explanation
  weight: number;             // contribution to score (-1..+1)
  polarity: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  timeframe?: Timeframe;
  timestamp: number;
  source: string;             // e.g. 'orderflow.delta', 'structure.bos'
}

/**
 * A detected market structure event.
 */
export interface StructureEvent {
  type: 'BOS' | 'CHOCH' | 'MSS' | 'HH' | 'HL' | 'LH' | 'LL';
  direction: ZoneDirection;
  timeframe: Timeframe;
  price: number;
  timestamp: number;
}

/**
 * Current market structure state per timeframe.
 */
export interface MarketStructureState {
  timeframe: Timeframe;
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  lastBOS?: StructureEvent;
  lastCHOCH?: StructureEvent;
  recentSwings: StructureEvent[]; // last few swing points
}

/**
 * Data quality assessment.
 */
export interface DataQuality {
  score: number;              // 0..1
  issues: DataQualityIssue[];
  hasOrderBook: boolean;
  hasTape: boolean;
  hasVolume: boolean;
  hasStructure: boolean;
  hasZones: boolean;
  lastUpdate: number;
}

export interface DataQualityIssue {
  source: string;
  severity: Severity;
  message: string;
}

/**
 * The complete output of the Market Context Engine for a given moment.
 */
export interface MarketContext {
  symbol: string;
  price: number;
  timestamp: number;
  state: MarketState;
  stateMessage: string;       // human-readable
  directionalBias: ZoneDirection;  // overall bias from context
  contextScore: number;       // -100..+100 (signed)
  confidenceScore: number;    // 0..100 (magnitude of conviction)
  dataQuality: DataQuality;
  structure: {
    ltf: MarketStructureState | null;
    mtf: MarketStructureState | null;
    htf: MarketStructureState | null;
  };
  nearestZone: ConfluenceZone | null;
  activeZones: ConfluenceZone[];   // sorted by relevance
  positiveFactors: AnalysisFactor[];
  negativeFactors: AnalysisFactor[];
  neutralFactors: AnalysisFactor[];
  conflicts: ConflictReport[];
  dataAvailability: {
    hasZones: boolean;
    hasOrderBook: boolean;
    hasTape: boolean;
    hasVolume: boolean;
    hasStructure: boolean;
  };
}

/**
 * A documented conflict between factors.
 */
export interface ConflictReport {
  id: string;
  description: string;
  severity: Severity;
  bullishSide: string;        // e.g. "Order Flow: BUY"
  bearishSide: string;        // e.g. "HTF Structure: BEARISH"
}