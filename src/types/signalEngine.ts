// ============================================
// SIGNAL ENGINE TYPES
// ============================================

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type TradingSession = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP_LN' | 'OVERLAP_NY' | 'CLOSED';

export interface SessionInfo {
  current: TradingSession;
  next: TradingSession | null;
  minutesUntilNext: number;
  isOverlap: boolean;
}

export interface EconomicEvent {
  id: string;
  name: string;
  time: number; // timestamp
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  currency: string;
}

export type MacroBias = 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';

export type InterMarketRegime = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface MacroContext {
  bias: MacroBias;
  score: number; // -100 to 100
  session: SessionInfo;
  dxyTrend: 'UP' | 'DOWN' | 'FLAT';
  yieldsTrend: 'UP' | 'DOWN' | 'FLAT';
  riskRegime: InterMarketRegime;
  htfTrendBias: MacroBias;
  upcomingHighImpact: EconomicEvent[];
  quietZoneActive: boolean;
  quietZoneEndsAt: number | null; // timestamp
  lastUpdated: number; // timestamp
}

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

export interface PersistenceConfig {
  deltaWindow: number;       // Ticks for delta confirmation
  tapeWindow: number;         // Ticks for tape confirmation
  orderFlowWindow: number;    // Ticks for order flow confirmation
  structureWindow: number;    // Ticks for structure confirmation (longer)
  zoneWindow: number;         // Ticks for zone entry confirmation
  invalidationWindow: number; // Ticks before invalidating confirmed signal
  minReactionSize: number;    // Minimum delta/volume for valid reaction
}

export interface IndicatorWeightConfig {
  indicatorName: string;
  category: 'STRUCTURE' | 'ZONE' | 'ORDER_FLOW' | 'ORDER_BOOK' | 'VOLUME' | 'EMA' | 'OSCILLATOR';
  baseWeight: number;
  minWeight: number;
  maxWeight: number;
  isEnabled: boolean;
  correlationGroup: string | null;
}

export interface SignalEngineConfig {
  ema200Period: number;
  ema200Enabled: boolean;
  macroUpdateIntervalMs: number;      // How often to update macro context (ms)
  quietZoneBeforeEventMin: number;    // Minutes before event to activate quiet zone
  quietZoneAfterEventMin: number;     // Minutes after event to keep quiet zone active
  persistence: PersistenceConfig;
  weights: IndicatorWeightConfig[];
  enableMultiTimeframe: boolean;
  enableCorrelationCollapse: boolean;
}

export const DEFAULT_SIGNAL_CONFIG: SignalEngineConfig = {
  ema200Period: 200,
  ema200Enabled: true,
  macroUpdateIntervalMs: 30000, // 30 seconds
  quietZoneBeforeEventMin: 30,
  quietZoneAfterEventMin: 15,
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
  enableMultiTimeframe: true,
  enableCorrelationCollapse: true,
};