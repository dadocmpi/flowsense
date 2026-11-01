// ============================================
// TWELVE DATA CREDIT METER (server-side)
// ============================================
// The one place that decides whether a vendor call may be made at all.
//
// Twelve Data meters API credits per minute and answers HTTP 429 with
// "You have run out of API credits for the current minute. N API credits were
// used, with the current limit being M." once the minute is spent. The vendor is
// the authority on how many credits were used, so its numbers win: when a
// response carries the `api-credits-used` header, the meter adopts that value
// instead of its own tally.
//
// Why this exists: every request the app makes is a candidate for a credit, so
// without a gate a single page load can spend the whole minute before anyone
// notices. The meter is checked BEFORE the request and updated AFTER it, which
// is what turns "we ran out" into "we stopped ourselves short of running out".
//
// Scope: one module instance per serverless instance. That is honest — a fresh
// instance starts with an empty meter — so a cold start is capped conservatively
// (COLD_START_MAX_CREDITS) until the instance has proven the vendor is healthy.
// A rate limit is remembered for the rest of the wall-clock minute, which is the
// unit the vendor actually resets on.

/** Default per-minute ceiling. Twelve Data's Basic plan allows 8 credits/minute. */
export const DEFAULT_MINUTE_CREDITS = 8;

/**
 * Credits a cold instance may spend in its first COLD_START_WINDOW_MS.
 *
 * One credit is one (symbol, timeframe) load, so three is a small, useful slice
 * of the compass rather than a full sweep. This is deliberately below the plan
 * limit: a new instance has no history, and the point of the cap is to make a
 * cold start cheap, not to spend the whole minute discovering the ceiling.
 */
export const COLD_START_MAX_CREDITS = 3;

/** How long the cold-start cap applies after the instance first spends (ms). */
export const COLD_START_WINDOW_MS = 60_000;

/** One vendor request's cost, used both to gate and to record. */
export interface CreditCost {
  /** Credits this request will consume if it succeeds. */
  credits: number;
  /** The vendor endpoint, for the log line. */
  endpoint: string;
  /** The symbol requested, for the log line. */
  symbol: string;
  /** The app timeframe or vendor interval, for the log line. */
  timeframe?: string;
}

export interface MeterSnapshot {
  /** The per-minute ceiling in force (vendor-reported when known, else env). */
  limit: number;
  /** Credits the meter believes were used in the current minute. */
  used: number;
  /** Credits left in the current minute, floored at zero. */
  remaining: number;
  /** Epoch ms the current minute window resets. */
  resetAt: number;
  /** True while a vendor rate limit is in force for this minute. */
  exhausted: boolean;
  /** True while the cold-start cap is still in force. */
  coldStart: boolean;
  /** Credits the cold-start window still allows. */
  coldStartRemaining: number;
  /** Whether a vendor call may be made right now. */
  allowed: boolean;
  /** Why a call is blocked, when it is. */
  reason: string | null;
}

/** Raised when the meter refuses a call; the route maps this onto RATE_LIMIT. */
export class CreditLimitError extends Error {
  /** Epoch ms at which the current minute resets. */
  resetAt: number;
  /** True when the block is the cold-start cap rather than the minute limit. */
  coldStart: boolean;

  constructor(message: string, resetAt: number, coldStart: boolean) {
    super(message);
    this.name = 'CreditLimitError';
    this.resetAt = resetAt;
    this.coldStart = coldStart;
  }
}

interface MeterState {
  minute: number;
  used: number;
  /** Limit reported by the vendor's `api-credits-used` + `api-credits-left`. */
  limit: number | null;
  exhaustedUntil: number;
  coldStartUntil: number;
  coldStartUsed: number;
}

let state: MeterState = {
  minute: -1,
  used: 0,
  limit: null,
  exhaustedUntil: 0,
  coldStartUntil: 0,
  coldStartUsed: 0,
};

/** The wall-clock minute index for an epoch ms. */
function minuteOf(now: number): number {
  return Math.floor(now / 60_000);
}

/** Epoch ms the wall-clock minute containing `now` ends. */
function minuteEnd(now: number): number {
  return (minuteOf(now) + 1) * 60_000;
}

/** The configured ceiling, from env, validated. */
function envLimit(): number {
  const parsed = Number.parseInt((process.env.TWELVE_DATA_CREDITS_PER_MINUTE ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MINUTE_CREDITS;
}

/** Drop the state whenever the wall-clock minute rolls over. */
function roll(now: number): void {
  const minute = minuteOf(now);
  if (state.minute === minute) return;
  state = {
    minute,
    used: 0,
    // A vendor-reported limit outlives the minute: it describes the plan.
    limit: state.limit,
    exhaustedUntil: 0,
    coldStartUntil: state.coldStartUntil,
    coldStartUsed: state.coldStartUsed,
  };
}

/** The ceiling in force: the vendor's own number when it has reported one. */
export function effectiveLimit(): number {
  return state.limit ?? envLimit();
}

/**
 * Whether a call costing `credits` may be made now.
 *
 * Returns the snapshot so a caller can log or report exactly why it was refused
 * rather than guessing.
 */
export function checkCredits(credits: number, now: number = Date.now()): MeterSnapshot {
  roll(now);
  const limit = effectiveLimit();
  const resetAt = minuteEnd(now);
  const coldStart = now < state.coldStartUntil;
  const coldStartRemaining = coldStart ? Math.max(0, COLD_START_MAX_CREDITS - state.coldStartUsed) : 0;

  if (now < state.exhaustedUntil) {
    return blocked('vendor rate limit in force', true);
  }
  if (state.used + credits > limit) {
    return blocked(`would exceed ${limit} credits/minute (used ${state.used})`, false);
  }
  if (coldStart && state.coldStartUsed + credits > COLD_START_MAX_CREDITS) {
    return blocked(`cold start allows ${COLD_START_MAX_CREDITS} credits`, true);
  }

  return {
    limit,
    used: state.used,
    remaining: Math.max(0, limit - state.used),
    resetAt,
    exhausted: false,
    coldStart,
    coldStartRemaining,
    allowed: true,
    reason: null,
  };

  function blocked(reason: string, isColdStart: boolean): MeterSnapshot {
    // A cold-start block clears at the end of its own window, which may be later
    // than the minute boundary; reporting the earlier of the two would have the
    // client retry into the same block.
    const blockedUntil = isColdStart ? Math.max(resetAt, state.coldStartUntil) : resetAt;
    return {
      limit,
      used: state.used,
      remaining: Math.max(0, limit - state.used),
      resetAt: blockedUntil,
      exhausted: true,
      coldStart,
      coldStartRemaining,
      allowed: false,
      reason: isColdStart ? `${reason} (cold start)` : reason,
    };
  }
}

/** Raise a CreditLimitError when a call is not allowed. */
export function assertCredits(credits: number, now: number = Date.now()): void {
  const snapshot = checkCredits(credits, now);
  if (snapshot.allowed) return;
  throw new CreditLimitError(
    `Credit meter blocked the call: ${snapshot.reason}`,
    snapshot.resetAt,
    snapshot.coldStart
  );
}

/** What a vendor response reported about credit usage. */
export interface VendorUsage {
  /** `api-credits-used` header, when present. */
  used?: number;
  /** `api-credits-left` header, when present. */
  left?: number;
}

function headerNumber(headers: Headers | undefined, name: string): number | undefined {
  const raw = headers?.get(name);
  if (raw === null || raw === undefined) return undefined;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Read the vendor's own credit-usage headers, when the response carries them. */
export function readVendorUsage(headers: Headers | undefined): VendorUsage {
  const usage: VendorUsage = {};
  const used = headerNumber(headers, 'api-credits-used');
  const left = headerNumber(headers, 'api-credits-left');
  if (used !== undefined) usage.used = used;
  if (left !== undefined) usage.left = left;
  return usage;
}

/**
 * Record the cost of a completed request.
 *
 * `usage` is the vendor's own report and is the source of truth: when it carries
 * `api-credits-used` and `api-credits-left`, their sum is the plan limit and the
 * used value is adopted verbatim. Without headers the meter falls back to its own
 * per-request tally, which is a deliberate undercount of nothing — every call
 * costs at least one credit and the tally assumes exactly one.
 */
export function recordCredits(cost: CreditCost, usage: VendorUsage = {}, now: number = Date.now()): MeterSnapshot {
  roll(now);

  if (usage.used !== undefined) state.used = usage.used;
  else state.used += cost.credits;

  if (usage.used !== undefined && usage.left !== undefined && usage.used + usage.left > 0) {
    state.limit = usage.used + usage.left;
  }

  // The first spend starts the cold-start window; it is measured from the
  // instance's first request, not from process start.
  if (state.coldStartUntil === 0) state.coldStartUntil = now + COLD_START_WINDOW_MS;
  if (now < state.coldStartUntil) state.coldStartUsed += cost.credits;

  return checkCredits(0, now);
}

/**
 * Mark the meter exhausted for the rest of the wall-clock minute.
 *
 * Called when the vendor answers a rate-limit error, whether or not it said how
 * many credits were used. `reportedUsed` (the "N API credits were used" figure)
 * is adopted when the vendor supplied it, because it is more accurate than our
 * own tally.
 */
export function markExhausted(now: number = Date.now(), reportedUsed?: number): MeterSnapshot {
  roll(now);
  state.exhaustedUntil = minuteEnd(now);
  if (reportedUsed !== undefined && reportedUsed > state.used) state.used = reportedUsed;
  return checkCredits(0, now);
}

/** The current meter state, for the status route and the log line. */
export function meterSnapshot(now: number = Date.now()): MeterSnapshot {
  return checkCredits(0, now);
}

/** Test seam: forget everything the meter has learned. */
export function resetCreditMeter(): void {
  state = {
    minute: -1,
    used: 0,
    limit: null,
    exhaustedUntil: 0,
    coldStartUntil: 0,
    coldStartUsed: 0,
  };
}
