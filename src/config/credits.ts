// ============================================
// PLAN-AWARE CREDIT LIMITS AND CACHE TTLs
// ============================================
// Upgrading the Twelve Data plan must be an environment change, not a code
// change. This module is the one place that turns the plan's limits into the
// two decisions that actually spend credits:
//
//   * the per-minute ceiling the meter enforces, and the daily cap it also
//     respects
//   * how long a cached payload is reused, and how often the client re-fetches
//
// It is PURE: no I/O, no clock, no environment access. The caller passes the
// plan numbers in, so both the browser and a serverless function can share the
// exact same maths and a test can pin the behaviour.

import type { Timeframe } from '../core/types.js';
import { TIMEFRAMES } from '../core/types.js';

/** Twelve Data's Basic plan: 8 credits per minute, 800 per day. */
export const DEFAULT_CREDITS_PER_MINUTE = 8;
export const DEFAULT_DAILY_CAP = 800;

/** The credit fraction at which the UI warns the daily cap is nearly reached. */
export const DAILY_CAP_WARN_FRACTION = 0.8;

/** Conservative cadence kept for the shipped 8-credit plan. */
const CONSERVATIVE_POLL_MS: Record<Timeframe, number> = {
  '1m': 20_000,
  '5m': 45_000,
  '15m': 60_000,
  '30m': 90_000,
  '1h': 120_000,
  '4h': 300_000,
  '1D': 600_000,
};

/**
 * Floor for the aggressive cadence. Even on a large plan a poll faster than this
 * is a waste: the compass reads candles, and a bar cannot change more often than
 * its own length. The cap scales with the plan but never collapses to zero.
 */
const AGGRESSIVE_MIN_POLL_MS = 5_000;

export interface PlanLimits {
  /** Per-minute credit ceiling the meter enforces. */
  creditsPerMinute: number;
  /** Daily credit cap; 0 means "no daily cap". */
  dailyCap: number;
}

/**
 * Scale one conservative interval down as the plan gets roomier.
 *
 * The 8-credit baseline is treated as 1x. A plan with N times the per-minute
 * budget may refresh up to N times sooner, floored so a bar is never polled
 * faster than is useful. This is deliberately monotonic: a bigger plan can never
 * end up polling slower than a smaller one.
 */
function scaledPollMs(baseMs: number, creditsPerMinute: number): number {
  const safeLimit = Number.isFinite(creditsPerMinute) && creditsPerMinute > 0 ? creditsPerMinute : DEFAULT_CREDITS_PER_MINUTE;
  const factor = Math.max(1, safeLimit / DEFAULT_CREDITS_PER_MINUTE);
  return Math.max(AGGRESSIVE_MIN_POLL_MS, Math.round(baseMs / factor));
}

/** The poll cadence for each timeframe under a given plan. */
export function pollIntervalForPlan(
  creditsPerMinute: number = DEFAULT_CREDITS_PER_MINUTE
): Record<Timeframe, number> {
  const table = {} as Record<Timeframe, number>;
  for (const timeframe of TIMEFRAMES) {
    table[timeframe] = scaledPollMs(CONSERVATIVE_POLL_MS[timeframe], creditsPerMinute);
  }
  return table;
}

/**
 * Server-side cache TTL per timeframe: just under the poll interval, so a client
 * poll normally lands inside the cache (one vendor call shared by every user)
 * while still seeing a new bar promptly.
 */
export function serverCacheTtlForPlan(
  creditsPerMinute: number = DEFAULT_CREDITS_PER_MINUTE
): Record<Timeframe, number> {
  const table = pollIntervalForPlan(creditsPerMinute);
  const ttl = {} as Record<Timeframe, number>;
  for (const timeframe of TIMEFRAMES) {
    ttl[timeframe] = Math.round(table[timeframe] * 0.8);
  }
  return ttl;
}

/**
 * The minimum gap between two vendor requests in the auto-load queue.
 *
 * Spacing the queue is what keeps a seven-timeframe sweep from tripping the
 * per-minute meter: at 8 credits/min the whole load is spread across the minute
 * instead of fired at once. It is derived from the plan, so a bigger plan loads
 * the screen sooner without any other change.
 */
export function queueStaggerMs(creditsPerMinute: number = DEFAULT_CREDITS_PER_MINUTE): number {
  const safeLimit = Number.isFinite(creditsPerMinute) && creditsPerMinute > 0 ? creditsPerMinute : DEFAULT_CREDITS_PER_MINUTE;
  return Math.max(750, Math.round(60_000 / safeLimit / 2));
}

/** Parse an integer env var, falling back when it is missing or malformed. */
export function parseLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
