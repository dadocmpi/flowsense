// ============================================
// FLOW SENSE — SIGNAL ENGINE TYPES
// ============================================

// Trading session definitions
export type TradingSession = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP_LN' | 'OVERLAP_NY' | 'CLOSED';

export interface SessionInfo {
  current: TradingSession;
  next: TradingSession | null;
  minutesUntilNext: number;
  isOverlap: boolean;
}

// Macro context
export type MacroBias = 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
export type EconomicEventImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type InterMarketRegime = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface EconomicEvent {
  id: string;
  name: string;
  time: number; // unix ms
  impact: EconomicEventImpact;
  currency: string;
}

export interface MacroContext {
  bias: MacroBias;                  // -100 to +100
  score: number;                    // raw -100..+100
  session: SessionInfo;
  dxyTrend: 'UP' | 'DOWN' | 'FLAT';
  yieldsTrend: 'UP' | 'DOWN' | 'FLAT';
  riskRegime: InterMarketRegime;
  htfTrendBias: MacroBias;          // D1 / H4 macro trend
  upcomingHighImpact: EconomicEvent[];
  quietZoneActive: boolean;         // true = suppress signals
  quietZoneEndsAt: number | null;
  lastUpdated: number;
}

// Multi-timeframe micro confluence
export type Timeframe = 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

export interface TimeframeConfluence {
  timeframe: Timeframe;
  weight: number;           // higher TF = higher weight
  score: number;            // -100..+100 (raw local confluence)
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  trend: 'UP' | 'DOWN' | 'FLAT';
  rsi: number;
  emaCloudBias: 'BULL' | 'BEAR' | 'NEUTRAL';
  bollingerPosition: 'OVERBOUGHT' | 'OVERSOLD' | 'MIDDLE';
  momentum: number;
  lastUpdated: number;
}

export interface MultiTimeframeResult {
  weightedScore: number;             // -100..+100
  agreementPercent: number;          // 0..100 (% of TFs agreeing)
  dominantDirection: 'BUY' | 'SELL' | 'NEUTRAL';
  timeframes: TimeframeConfluence[];
  alignmentMet: boolean;             // true if agreement >= threshold
  lastUpdated: number;
}

// Setup detection
export type SetupType = 
  | 'NONE'
  | 'INSTITUTIONAL_ACCUMULATION'
  | 'LIQUIDITY_SWEEP'
  | 'ORDER_BLOCK_RETEST'
  | 'FVG_FILL'
  | 'BREAKER_BLOCK'
  | 'HTF_LTF_CONFLUENCE';

export interface SetupDetection {
  setup: SetupType;
  triggered: boolean;
  direction: 'BUY' | 'SELL' | null;
  zonePriceMin: number | null;
  zonePriceMax: number | null;
  zoneMidpoint: number | null;
  touches: number;
  absorptionScore: number;           // 0..100
  regimeType: 'TREND' | 'RANGE' | 'TRANSITION';
  regimeStrength: number;            // ADX-like 0..100
  volatilityAcceptable: boolean;
  liquidityAcceptable: boolean;
  conflictDetected: boolean;         // true = trend vs mean-reversion conflict
  conflictType: string | null;
  lastUpdated: number;
}

// Final smoothed output (what the UI consumes)
export type DisplayVerdict = 
  | 'STRONG_SELL'
  | 'SELL'
  | 'NEUTRAL'
  | 'BUY'
  | 'STRONG_BUY';

export interface SmoothedSignal {
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  displayVerdict: DisplayVerdict;
  confidence: number;                // 0..100 — how many layers agree
  compositeScore: number;            // -100..+100 (smoothed)
  rawScore: number;                  // -100..+100 (instantaneous, for debugging)
  macroScore: number;                // -100..+100
  mtfScore: number;                  // -100..+100
  setupScore: number;                // 0..100
  layersAligned: number;             // 0..4
  setupTriggered: boolean;
  quietZoneActive: boolean;
  conflictDetected: boolean;
  confidenceBreakdown: {
    macro: number;
    mtf: number;
    setup: number;
    regime: number;
  };
  lastUpdated: number;
  ageMs: number;                     // for staleness check
}

// Configuration (all thresholds exposed)
export interface SignalEngineConfig {
  // Layer 4 — Smoothing
  smoothingPeriod: number;           // EMA period on composite score (3-5 typical)
  hysteresisPersistenceCount: number;// consecutive readings required to flip verdict
  hysteresisPersistenceMs: number;   // OR sustained time in ms

  // Layer 4 — Verdict thresholds
  strongSellThreshold: number;       // composite score below
  sellThreshold: number;
  buyThreshold: number;
  strongBuyThreshold: number;

  // Layer 4 — Confidence
  minConfidenceForStrong: number;    // e.g. 75 — below this, can't show STRONG_*
  minLayersAlignedForSignal: number; // e.g. 3 of 4

  // Layer 2 — Multi-timeframe
  mtfAgreementThreshold: number;     // e.g. 0.75 (75% of TFs must agree)
  mtfTimeframes: Timeframe[];
  mtfWeights: Record<Timeframe, number>;

  // Layer 1 — Macro
  macroUpdateIntervalMs: number;     // e.g. 5 minutes
  quietZoneBeforeEventMin: number;   // minutes before high-impact
  quietZoneAfterEventMin: number;    // minutes after high-impact

  // Layer 3 — Setup
  minAbsorptionScore: number;        // 0..100
  maxVolatilityATR: number;          // ratio vs typical
  minInstitutionalPressure: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

export const DEFAULT_SIGNAL_CONFIG: SignalEngineConfig = {
  // Layer 4 — Smoothing
  smoothingPeriod: 4,
  hysteresisPersistenceCount: 3,
  hysteresisPersistenceMs: 5000,

  // Layer 4 — Verdict thresholds
  strongSellThreshold: -70,
  sellThreshold: -25,
  buyThreshold: 25,
  strongBuyThreshold: 70,

  // Layer 4 — Confidence
  minConfidenceForStrong: 70,
  minLayersAlignedForSignal: 3,

  // Layer 2 — Multi-timeframe
  mtfAgreementThreshold: 0.75,
  mtfTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
  mtfWeights: {
    M5: 0.10,
    M15: 0.15,
    H1: 0.20,
    H4: 0.25,
    D1: 0.30,
  },

  // Layer 1 — Macro
  macroUpdateIntervalMs: 5 * 60 * 1000,  // 5 minutes
  quietZoneBeforeEventMin: 30,
  quietZoneAfterEventMin: 15,

  // Layer 3 — Setup
  minAbsorptionScore: 60,
  maxVolatilityATR: 2.5,
  minInstitutionalPressure: 'MEDIUM',
};