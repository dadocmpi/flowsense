import type { FactorContribution } from './compassEngine';

// ============================================
// SUPPORT/RESISTANCE/REVERSAL TYPES
// ============================================

export type SRDirection = 'SUPPORT' | 'RESISTANCE';
export type SRType = 
  | 'MAJOR'
  | 'INTRADAY'
  | 'SUPPLY_ZONE'
  | 'DEMAND_ZONE'
  | 'LIQUIDITY_POOL'
  | 'PREV_SESSION_HIGH'
  | 'PREV_SESSION_LOW'
  | 'PREV_DAY_HIGH'
  | 'PREV_DAY_LOW'
  | 'WEEKLY_HIGH'
  | 'WEEKLY_LOW'
  | 'OPENING_RANGE_HIGH'
  | 'OPENING_RANGE_LOW'
  | 'SWING_HIGH'
  | 'SWING_LOW'
  | 'HIGH_VOLUME_AREA'
  | 'FAIR_VALUE_GAP';

export interface SRLevel {
  id: string;
  type: SRType;
  direction: SRDirection;
  priceLow: number; // lower bound of the zone/level
  priceHigh: number; // upper bound of the zone/level (for zones, for single line levels, low === high)
  strength: number; // 0-100
  timeframe: string; // e.g., '15m', '1h', '1d'
  testCount: number; // number of times price has tested this level
  freshness: number; // 0-100, based on how recent the level was formed
  distanceFromPrice: number; // absolute distance in price units
  pricePosition: 'ABOVE' | 'BELOW' | 'INSIDE'; // relative to current price
  zoneState: 'APPROACHING' | 'TOUCHING' | 'REJECTING' | 'BREAKING' | 'RETESTING' | 'INVALIDATED';
  invalidationLevel: number; // price level that would invalidate this zone
  confidence: number; // 0-100
  dataQuality: number; // 0-100, quality of data used to compute this level
}

export type ReversalState =
  | 'AT_SUPPORT'
  | 'AT_RESISTANCE'
  | 'APPROACHING_SUPPORT'
  | 'APPROACHING_RESISTANCE'
  | 'REJECTION_DETECTED'
  | 'BREAKOUT_DETECTED'
  | 'BREAKDOWN_DETECTED'
  | 'RETEST_PENDING'
  | 'BULLISH_REVERSAL_WATCH'
  | 'BEARISH_REVERSAL_WATCH'
  | 'CONFIRMATION_PENDING'
  | 'READY_FOR_REVIEW'
  | 'INVALIDATED'
  | 'NO_TRADE';

export interface ReversalSignal {
  state: ReversalState;
  reason: string;
  confidence: number;
  dataQuality: number;
  timestamp: number;
  price: number;
  previousDirection: string; // e.g., 'BULLISH', 'BEARISH'
  currentDirection: string; // e.g., 'BULLISH', 'BEARISH'
  directionChangeReason: string;
  volumeConfirmation: {
    available: boolean;
    volumeRatio: number; // recent volume vs average; 0 when unavailable
    risingVolume: boolean; // volume expanding into the level
    exhaustion: boolean; // volume contracting after an extended move
  };
  timeframeAgreement: {
    aligned: string[]; // timeframes that agree with the reversal
    conflicting: string[]; // timeframes that conflict
    unavailable: string[]; // timeframes without data
  };
  invalidation: {
    level: number; // price level that invalidates the reversal
    distance: number; // distance from current price
  };
  riskReward: {
    target: number;
    stop: number;
    ratio: number; // reward/risk
  };
}

export interface SRReversalFactors {
  factors: FactorContribution[]; // for the compass engine
  reversalSignal: ReversalSignal | null;
  srLevels: SRLevel[]; // all identified support/resistance levels
}