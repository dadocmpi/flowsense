// ============================================
// MARKET OPEN / CLOSED DETECTION
// ============================================
// A candle feed does not tell you the market is shut — it simply stops sending
// bars. That silence must not be mistaken for a quiet market, or the compass
// would keep recomputing a stale reading and present it as if it were live.
//
// This module answers one question: given the newest bar we have, is the market
// still producing data? It is pure, so it is testable without a clock or a
// network.
//
// The tolerance is deliberately generous — a timeframe is only called closed
// once several of its own bar lengths have passed with no new bar, because a
// thin market can legitimately skip a bar and a weekend gap is a real closure,
// not a bug.

import type { Candle } from './types';
import { TIMEFRAME_MINUTES, type Timeframe } from './types';
import { parseCandleTime } from './candles';

/** Bar lengths of silence tolerated before a market is called closed. */
export const CLOSED_AFTER_BARS = 3;

export type MarketState = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface MarketStateResult {
  state: MarketState;
  /** Milliseconds since the newest bar opened, when it could be determined. */
  stalenessMs: number | null;
  /** The threshold that was applied, for an honest UI explanation. */
  toleranceMs: number | null;
  reason: string;
}

/**
 * Whether the market for this series looks open.
 *
 * `now` is injected so the behaviour is deterministic under test.
 */
export function marketState(
  candles: Candle[],
  timeframe: Timeframe,
  now: number = Date.now(),
  closedAfterBars: number = CLOSED_AFTER_BARS
): MarketStateResult {
  const toleranceMs = TIMEFRAME_MINUTES[timeframe] * 60_000 * closedAfterBars;

  if (candles.length === 0) {
    return { state: 'UNKNOWN', stalenessMs: null, toleranceMs, reason: 'No candles to judge from' };
  }

  const lastMs = parseCandleTime(candles[candles.length - 1].datetime);
  if (!Number.isFinite(lastMs)) {
    return { state: 'UNKNOWN', stalenessMs: null, toleranceMs, reason: 'Newest bar has no readable timestamp' };
  }

  const stalenessMs = now - lastMs;
  if (stalenessMs > toleranceMs) {
    const bars = Math.floor(stalenessMs / (TIMEFRAME_MINUTES[timeframe] * 60_000));
    return {
      state: 'CLOSED',
      stalenessMs,
      toleranceMs,
      reason: `No new ${timeframe} bar for about ${bars} bars — market looks closed`,
    };
  }

  return { state: 'OPEN', stalenessMs, toleranceMs, reason: 'Newest bar is current' };
}
