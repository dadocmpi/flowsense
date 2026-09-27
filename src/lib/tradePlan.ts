import type { CompassDirection } from '../types/compassEngine';

// ============================================
// TRADE PLAN (derived from the signal)
// ============================================
// A compact entry / stop / target derived from the live price and the compass
// direction. It is the same arithmetic the old Action Planning panel used —
// it only moved next to the signal it belongs to.

export interface TradePlan {
  /** Null when the compass has no directional read. */
  side: 'Long' | 'Short' | null;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target: number;
  riskPercent: number;
  rewardPercent: number;
  /** Reward / risk, e.g. 1.42. */
  ratio: number;
}

export function buildTradePlan(direction: CompassDirection, price: number): TradePlan | null {
  if (!price || price <= 0) return null;

  const isBullish = direction === 'STRONG_BUY' || direction === 'BUY';
  const isBearish = direction === 'STRONG_SELL' || direction === 'SELL';
  const side: TradePlan['side'] = isBullish ? 'Long' : isBearish ? 'Short' : null;

  const entryZone = isBullish
    ? { min: price * 0.999, max: price * 1.001 }
    : isBearish
    ? { min: price * 0.999, max: price * 1.001 }
    : { min: price * 0.998, max: price * 1.002 };

  const stopLoss = isBullish ? price * 0.993 : isBearish ? price * 1.007 : price * 0.99;
  const target = isBullish ? price * 1.01 : isBearish ? price * 0.99 : price * 1.005;

  const riskPercent = (Math.abs(price - stopLoss) / price) * 100;
  const rewardPercent = (Math.abs(target - price) / price) * 100;
  const ratio = riskPercent > 0 ? rewardPercent / riskPercent : 0;

  return {
    side,
    entryLow: entryZone.min,
    entryHigh: entryZone.max,
    stopLoss,
    target,
    riskPercent,
    rewardPercent,
    ratio,
  };
}
