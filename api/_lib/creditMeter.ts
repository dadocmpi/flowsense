// ============================================
// TWELVE DATA CREDIT METER (server-side)
// ============================================
// The one place that decides whether a vendor call may be made at all.
//
// Twelve Data meters API credits per minute (8 on the free plan) and answers HTTP
// 429 with "You have run out of API credits for the current minute. N API credits
// were used, with the current limit being M." once the minute is spent. The vendor
// is the authority on how many credits were used, so its numbers win: when a
// response carries the `api-credits-used` header, the meter adopts that value
// instead of its own tally.
//
// Why this exists: every request the app makes is a candidate for a credit, so
// without a gate a single page load can spend the whole minute before anyone
// notices. The meter is checked BEFORE the request and updated AFTER it, which is
// what turns "we ran out" into "we stopped ourselves short of running out".
//
// THE FULL-ASSET LOAD MUST FIT. One full asset load is seven credits — one per
// timeframe — so the meter must allow seven in a minute, not three. There is no
// cold-start cap any more: it used to cap a fresh instance at 3 credits, which
// made a full load impossible on the very first minute after a deploy. The
// per-minute ceiling alone is what bounds the spend now.
//
// A LOCAL BLOCK IS NOT A VENDOR RATE LIMIT. When the meter refuses a call it
// means "this would exceed the minute" — the caller marks that timeframe as
// waiting for credits and continues after the reset. A vendor rate limit is a
// different, harder state: the vendor itself said stop, so every call is refused
// until the minute rolls over.

/** Default per-minute ceiling. Twelve Data's free plan allows 8 credits/minute. */
export const DEFAULT_MINUTE_CREDITS = 8;

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
  /** Whether a vendor call may be made right now. */
  allowed: boolean;
  /** Why a call is blocked, when it is. */
  reason: string | null;
}

/** Raised when the meter refuses a call; the route maps this onto CREDIT_LIMIT. */
export class CreditLimitError extends Error {
  /** Epoch ms at which the current minute resets. */
  resetAt: number;

  constructor(message: string, resetAt: number) {
    super(message);
    this.name = 'CreditLimitError';
    this.resetAt = resetAt;
  }
}

interface MeterState {
  minute: number;
  used: number;
  /** Limit reported by the vendor's `api-credits-used` + `api-credits-left`. */
  limit: number | null;
  exhaustedUntil: number;
}

let state: MeterState = {
  minute: -1,
  used: 0,
  limit: null,
  exhaustedUntil: 0,
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

  if (now < state.exhaustedUntil) {
    return blocked('vendor rate limit in force');
  }
  if (state.used + credits > limit) {
    return blocked(`would exceed ${limit} credits/minute (used ${state.used})`);
  }

  return {
    limit,
    used: state.used,
    remaining: Math.max(0, limit - state.used),
    resetAt,
    exhausted: false,
    allowed: true,
    reason: null,
  };

  function blocked(reason: string): MeterSnapshot {
    return {
      limit,
      used: state.used,
      remaining: Math.max(0, limit - state.used),
      resetAt,
      exhausted: true,
      allowed: false,
      reason,
    };
  }
}

/** Raise a CreditLimitError when a call is not allowed. */
export function assertCredits(credits: number, now: number = Date.now()): void {
  const snapshot = checkCredits(credits, now);
  if (snapshot.allowed) return;
  throw new CreditLimitError(`Credit meter blocked the call: ${snapshot.reason}`, snapshot.resetAt);
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
 * per-request tally, which assumes exactly one credit per call.
 */
export function recordCredits(cost: CreditCost, usage: VendorUsage = {}, now: number = Date.now()): MeterSnapshot {
  roll(now);

  if (usage.used !== undefined) state.used = usage.used;
  else state.used += cost.credits;

  if (usage.used !== undefined && usage.left !== undefined && usage.used + usage.left > 0) {
    state.limit = usage.used + usage.left;
  }

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
  };
}
