// ============================================
// MARKET CONTEXT ENGINE - TYPE DEFINITIONS
// ============================================

// ---- Market Structure ----
export type MarketStructure = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type TrendLine = 'HTF' | 'MTF' | 'LTF';
export type StructureState = 'HH_HL' | 'LH_LL' | 'BOS_BULL' | 'BOS_BEAR' | 'CHOPCH' | 'NEUTRAL';

export interface MarketStructureData {
  trend: MarketStructure;
  structureState: StructureState;
  htfTrend: MarketStructure; // Higher timeframe
  mtfTrend: MarketStructure; // Medium timeframe
  ltfTrend: MarketStructure; // Lower timeframe
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  bosConfirmed: boolean;
  bosDirection: 'BULL' | 'BEAR' | null;
}

// ---- Institutional Zones ----
export type ZoneType =
  | 'FVG'           // Fair Value Gap
  | 'ORDER_BLOCK'   // Order Block
  | 'POC'           // Point of Control
  | 'BREAKER'       // Breaker Block
  | 'MITIGATION'    // Mitigation Block
  | 'LIQUIDITY'     // Liquidity Zone
  | 'SWING'         // Swing High/Low
  | 'VWAP'          // VWAP Zone
  | 'MANUAL';       // User-defined daily zone

export type ZoneStatus = 'ACTIVE' | 'MITIGATED' | 'INVALIDATED' | 'BROKEN' | 'CONSUMED';
export type ZoneStrength = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface ZoneConfluence {
  type: ZoneType;
  strength: ZoneStrength;
  timeframe: TrendLine;
}

export interface InstitutionalZone {
  id: string;
  type: ZoneType;
  priceMin: number;
  priceMax: number;
  midpoint: number;
  strength: ZoneStrength;
  confluences: ZoneConfluence[];
  source: string;
  createdAt: number;
  updatedAt: number;
  status: ZoneStatus;
  timeframe: TrendLine;
  touches: number;         // How many times price interacted
  absorptionEvents: number; // Times zone absorbed major orders
  invalidationPrice: number; // Price that breaks this zone
  volumeAtFormation: number | null;
  isClustered: boolean;
  clusterId: string | null;
}

// ---- Zone Clusters ----
export interface ZoneCluster {
  id: string;
  zones: InstitutionalZone[];
  priceMin: number;
  priceMax: number;
  midpoint: number;
  totalConfluence: ZoneConfluence[];
  strength: ZoneStrength;
  distanceFromPrice: number;
  totalScore: number; // Sum of all zone scores
}

// ---- Signal & Confluence ----
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';
export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface SignalFactor {
  name: string;
  value: string | number;
  action: SignalAction;
  weight: number;
  isCorrelated: boolean;
  correlationGroup: string | null;
  source: string;
  timestamp: number;
  timestamp: number;
}

export interface ConfluenceResult {
  totalScore: number;           // 0-100
  zoneWeightScore: number;       // Portion from zone confluence (0-100)
  supportingScore: number;        // Portion from supporting indicators
  zoneWeightPercentage: number;   // What % of total is zone-based
  factors: SignalFactor[];
  dominantAction: SignalAction;
  contradictions: SignalFactor[];
  conflictSeverity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}

// ---- Data Quality ----
export type DataSource = 'BINANCE' | 'MOCK' | 'UNAVAILABLE';
export type DataFreshness = 'LIVE' | 'STALE' | 'DELAYED' | 'DISCONNECTED';

export interface DataQualityMetrics {
  orderBookComplete: boolean;
  tapeAvailable: boolean;
  volumeAvailable: boolean;
  tradesAvailable: boolean;
  indicatorsValid: boolean;
  websocketConnected: boolean;
  lastUpdateTime: number;
  latencyMs: number;
  freshness: DataFreshness;
}

export interface DataQualityScore {
  overall: number;           // 0-100
  orderBookWeight: number;   // How much we rely on it
  tapeWeight: number;
  volumeWeight: number;
  tradesWeight: number;
  indicatorsWeight: number;
  metrics: DataQualityMetrics;
}

// ---- Persistence / Anti-Flicker ----
export interface PersistenceWindow {
  dataType: 'DELTA' | 'TAPE' | 'ORDER_FLOW' | 'STRUCTURE' | 'ZONE';
  requiredTicks: number;       // N consecutive ticks
  requiredSeconds: number;    // OR N seconds sustained
  currentTicks: number;
  lastConfirmTime: number | null;
  isConfirming: boolean;
}

export interface PersistenceConfig {
  deltaWindow: number;       // Ticks for delta confirmation
  tapeWindow: number;         // Ticks for tape confirmation
  orderFlowWindow: number;    // Ticks for order flow confirmation
  structureWindow: number;    // Ticks for structure confirmation (longer)
  zoneWindow: number;         // Ticks for zone entry confirmation
  invalidationWindow: number; // Ticks before invalidating confirmed signal
  minReactionSize: number;    // Minimum delta/volume for valid reaction
}

// ---- State Machine ----
export type MarketState =
  | 'WAITING'
  | 'APPROACHING_ZONE'
  | 'ENTERING_ZONE'
  | 'IN_ZONE'
  | 'ANALYZING'
  | 'CONFIRMATION'
  | 'HIGH_CONFLUENCE'
  | 'INVALIDATED'
  | 'EXITED_ZONE'
  | 'ZONE_BROKEN';

export interface StateTransition {
  from: MarketState;
  to: MarketState;
  trigger: string;
  timestamp: number;
  reason: string;
}

// ---- Manual Daily Zone ----
export interface ManualDailyZone {
  id: string;
  date: string;              // YYYY-MM-DD
  direction: SignalAction;    // BUY or SELL (long/short)
  zoneMin: number;
  zoneMax: number;
  zoneName: string;
  stopLoss: number;
  takeProfit: number;
  startTime: string;         // Trading window start
  endTime: string;           // Trading window end
  notes: string;
  createdAt: number;
  ema200Aligned: boolean;     // True if direction matches EMA200
  ema200Conflict: boolean;    // True if contradicts EMA200
}

// ---- Contextual Market Decision ----
export interface MarketContextDecision {
  state: MarketState;
  contextScore: number;              // 0-100, methodology-derived
  calibratedProbability: number | null; // Only if empirically backtested
  confidence: ConfidenceLevel;
  gate0Passed: boolean;               // EMA200 gate
  gate0Trend: MarketStructure;
  zoneWeightMet: boolean;             // ≥50% zone weight
  thresholdMet: boolean;              // >80% total score
  persistenceMet: boolean;
  primaryZone: InstitutionalZone | ZoneCluster | ManualDailyZone | null;
  nearbyZones: InstitutionalZone[];
  zoneClusters: ZoneCluster[];
  structure: MarketStructureData;
  confluence: ConfluenceResult;
  dataQuality: DataQualityScore;
  manualZone: ManualDailyZone | null;
  stateHistory: StateTransition[];
  timestamp: number;
  isTradeable: boolean;              // All gates passed
  warnings: string[];                 // Internal warnings for debugging
}

// ---- Weighted Scoring Configuration ----
export interface IndicatorWeightConfig {
  indicatorName: string;
  category: 'STRUCTURE' | 'ZONE' | 'ORDER_FLOW' | 'ORDER_BOOK' | 'VOLUME' | 'EMA' | 'OSCILLATOR';
  baseWeight: number;
  minWeight: number;
  maxWeight: number;
  isEnabled: boolean;
  correlationGroup: string | null;
}

export interface WeightTierConfig {
  tier: 'HIGH' | 'MEDIUM' | 'LOW';
  multiplier: number;
  minIndicatorsRequired: number;
}

export const DEFAULT_WEIGHT_TIERS: Record<string, WeightTierConfig> = {
  STRUCTURE: { tier: 'HIGH', multiplier: 1.5, minIndicatorsRequired: 2 },
  ZONE: { tier: 'HIGH', multiplier: 1.5, minIndicatorsRequired: 1 },
  ORDER_FLOW: { tier: 'HIGH', multiplier: 1.25, minIndicatorsRequired: 2 },
  ORDER_BOOK: { tier: 'HIGH', multiplier: 1.25, minIndicatorsRequired: 1 },
  VOLUME: { tier: 'MEDIUM', multiplier: 1.0, minIndicatorsRequired: 1 },
  EMA: { tier: 'MEDIUM', multiplier: 1.0, minIndicatorsRequired: 1 },
  OSCILLATOR: { tier: 'LOW', multiplier: 0.75, minIndicatorsRequired: 1 },
};

// ---- Config ----
export interface MarketContextConfig {
  ema200Period: number;
  ema200Enabled: boolean;
  minConfluenceThreshold: number;      // Default 80
  minZoneWeightPercentage: number;     // Default 50
  persistence: PersistenceConfig;
  weights: IndicatorWeightConfig[];
  zoneProximityThreshold: number;       // Points away to consider "approaching"
  zoneEntryThreshold: number;           // Points into zone to consider "entered"
  dataQualityDecay: number;            // How much to reduce per quality issue
  enableMultiTimeframe: boolean;
  enableCorrelationCollapse: boolean;
}

export const DEFAULT_CONTEXT_CONFIG: MarketContextConfig = {
  ema200Period: 200,
  ema200Enabled: true,
  minConfluenceThreshold: 80,
  minZoneWeightPercentage: 50,
  persistence: {
    deltaWindow: 3,
    tapeWindow: 3,
    orderFlowWindow: 3,
    structureWindow: 5,
    zoneWindow: 2,
    invalidationWindow: 5,
    minReactionSize: 5,
  },
  weights: [
    // Structure
    { name: 'MARKET_STRUCTURE', category: 'STRUCTURE', baseWeight: 15, minWeight: 10, maxWeight: 20, isEnabled: true, correlationGroup: 'STRUCTURE' },
    { name: 'BOS', category: 'STRUCTURE', baseWeight: 10, minWeight: 5, maxWeight: 15, isEnabled: true, correlationGroup: 'STRUCTURE' },
    // Zone
    { name: 'FVG', category: 'ZONE', baseWeight: 12, minWeight: 8, maxWeight: 18, isEnabled: true, correlationGroup: 'ZONE_CLUSTER' },
    { name: 'ORDER_BLOCK', category: 'ZONE', baseWeight: 12, minWeight: 8, maxWeight: 18, isEnabled: true, correlationGroup: 'ZONE_CLUSTER' },
    { name: 'POC', category: 'ZONE', baseWeight: 10, minWeight: 6, maxWeight: 15, isEnabled: true, correlationGroup: 'ZONE_CLUSTER' },
    { name: 'MANUAL_ZONE', category: 'ZONE', baseWeight: 15, minWeight: 10, maxWeight: 20, isEnabled: true, correlationGroup: 'ZONE_CLUSTER' },
    // Order Flow
    { name: 'DELTA', category: 'ORDER_FLOW', baseWeight: 10, minWeight: 5, maxWeight: 15, isEnabled: true, correlationGroup: 'FLOW' },
    { name: 'TAPE', category: 'ORDER_FLOW', baseWeight: 8, minWeight: 4, maxWeight: 12, isEnabled: true, correlationGroup: 'FLOW' },
    { name: 'ABSORPTION', category: 'ORDER_FLOW', baseWeight: 8, minWeight: 4, maxWeight: 12, isEnabled: true, correlationGroup: 'FLOW' },
    // Order Book
    { name: 'BOOK_IMBALANCE', category: 'ORDER_BOOK', baseWeight: 8, minWeight: 4, maxWeight: 12, isEnabled: true, correlationGroup: 'BOOK' },
    // Volume
    { name: 'VOLUME', category: 'VOLUME', baseWeight: 6, minWeight: 3, maxWeight: 10, isEnabled: true, correlationGroup: null },
    { name: 'VOLUME_DELTA', category: 'VOLUME', baseWeight: 6, minWeight: 3, maxWeight: 10, isEnabled: true, correlationGroup: null },
    // EMA
    { name: 'EMA_200', category: 'EMA', baseWeight: 12, minWeight: 8, maxWeight: 18, isEnabled: true, correlationGroup: 'EMA_CLOUD' },
    { name: 'EMA_50', category: 'EMA', baseWeight: 6, minWeight: 3, maxWeight: 10, isEnabled: true, correlationGroup: 'EMA_CLOUD' },
    { name: 'EMA_20', category: 'EMA', baseWeight: 4, minWeight: 2, maxWeight: 8, isEnabled: true, correlationGroup: 'EMA_CLOUD' },
    { name: 'EMA_10', category: 'EMA', baseWeight: 3, minWeight: 1, maxWeight: 6, isEnabled: true, correlationGroup: 'EMA_CLOUD' },
    // Oscillators
    { name: 'RSI', category: 'OSCILLATOR', baseWeight: 4, minWeight: 2, maxWeight: 8, isEnabled: true, correlationGroup: null },
    { name: 'MACD', category: 'OSCILLATOR', baseWeight: 4, minWeight: 2, maxWeight: 8, isEnabled: true, correlationGroup: null },
    { name: 'MOMENTUM', category: 'OSCILLATOR', baseWeight: 3, minWeight: 1, maxWeight: 6, isEnabled: true, correlationGroup: null },
  ],
  zoneProximityThreshold: 50,      // 50 points for XAUUSD
  zoneEntryThreshold: 10,          // 10 points into zone
  dataQualityDecay: 15,           // 15% reduction per major issue
  enableMultiTimeframe: true,
  enableCorrelationCollapse: true,
};