// ============================================
// GENERIC PER-MINUTE RATE METER (server-side)
// ============================================
// One gate, used by EVERY vendor. Each vendor gets its OWN meter instance, so a
// rate limit on one provider can never block another: Alpaca's 200 requests a
// minute and Twelve Data's 8 credits a minute are separate budgets, and the app
// spends them separately.
//
// Why this exists: every request the app makes is a candidate for a vendor
// limit, so without a gate a single page load can spend the whole minute before
// anyone notices. The meter is checked BEFORE the request and updated AFTER it,
// which is what turns "we ran out" into "we stopped ourselves short of running
// out".
//
// The vendor is the authority on how much was used, so a reported figure is
// adopted verbatim over our own tally. Twelve Data reports it in headers; Alpaca
// does not, so its meter simply counts the calls it made.
//
// Scope: one meter instance per serverless instance. That is honest — a fresh
// instance starts with an empty meter — so a cold start can be capped
// conservatively until the instance has proven the vendor is healthy. A rate
// limit is remembered for the rest of the wall-clock minute, which is the unit
// the vendor actually resets on.

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
  /** The vendor this meter belongs to, e.g. "twelvedata". */
  label: string;

  constructor(message: string, resetAt: number, coldStart: boolean, label = 'vendor') {
    super(message);
    this.name = 'CreditLimitError';
    this.resetAt = resetAt;
    this.coldStart = coldStart;
    this.label = label;
  }
}

/** What a vendor response reported about credit usage. */
export interface VendorUsage {
  /** `api-credits-used` header, when present (Twelve Data). */
  used?: number;
  /** `api-credits-left` header, when present (Twelve Data). */
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

export interface MeterOptions {
  /** Requests a cold instance may make in its first `coldStartWindowMs`. */
  coldStartMax: number;
  /** How long the cold-start cap applies after the instance first spends (ms). */
  coldStartWindowMs: number;
  /** Reads the configured ceiling from the environment, with its own default. */
  envLimit: () => number;
  /** Names the meter in error text and log lines, e.g. "twelvedata". */
  label: string;
}

export interface RateMeter {
  readonly label: string;
  check(credits: number, now?: number): MeterSnapshot;
  assert(credits: number, now?: number): void;
  record(cost: CreditCost, usage?: VendorUsage, now?: number): MeterSnapshot;
  markExhausted(now?: number, reportedUsed?: number): MeterSnapshot;
  snapshot(now?: number): MeterSnapshot;
  reset(): void;
  /** Record that one outbound call was actually made, for the health route. */
  noteCall(now?: number): void;
  /** How many calls were made in the current wall-clock minute. */
  callsThisMinute(now?: number): number;
  /** Epoch ms of the last outbound call, or null. Survives the minute roll. */
  lastCallAt(): number | null;
}

interface MeterState {
  minute: number;
  used: number;
  /** Limit reported by the vendor's `api-credits-used` + `api-credits-left`. */
  limit: number | null;
  exhaustedUntil: number;
  coldStartUntil: number;
  coldStartUsed: number;
  /** Calls made in the current minute (all vendors count one call each). */
  calls: number;
}

/** The wall-clock minute index for an epoch ms. */
function minuteOf(now: number): number {
  return Math.floor(now / 60_000);
}

/** Epoch ms the wall-clock minute containing `now` ends. */
function minuteEnd(now: number): number {
  return (minuteOf(now) + 1) * 60_000;
}

export function createRateMeter(options: MeterOptions): RateMeter {
  const { coldStartMax, coldStartWindowMs, envLimit, label } = options;

  let state: MeterState = {
    minute: -1,
    used: 0,
    limit: null,
    exhaustedUntil: 0,
    coldStartUntil: 0,
    coldStartUsed: 0,
    calls: 0,
  };
  let lastCall: number | null = null;

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
      calls: 0,
    };
  }

  function effectiveLimit(): number {
    return state.limit ?? envLimit();
  }

  function check(credits: number, now: number = Date.now()): MeterSnapshot {
    roll(now);
    const limit = effectiveLimit();
    const resetAt = minuteEnd(now);
    const coldStart = now < state.coldStartUntil;
    const coldStartRemaining = coldStart ? Math.max(0, coldStartMax - state.coldStartUsed) : 0;

    if (now < state.exhaustedUntil) {
      return blocked('vendor rate limit in force', true);
    }
    if (state.used + credits > limit) {
      return blocked(`would exceed ${limit} credits/minute (used ${state.used})`, false);
    }
    if (coldStart && state.coldStartUsed + credits > coldStartMax) {
      return blocked(`cold start allows ${coldStartMax} credits`, true);
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

  function assert(credits: number, now: number = Date.now()): void {
    const snapshot = check(credits, now);
    if (snapshot.allowed) return;
    throw new CreditLimitError(
      `Credit meter blocked the call: ${snapshot.reason}`,
      snapshot.resetAt,
      snapshot.coldStart,
      label
    );
  }

  function record(cost: CreditCost, usage: VendorUsage = {}, now: number = Date.now()): MeterSnapshot {
    roll(now);

    if (usage.used !== undefined) state.used = usage.used;
    else state.used += cost.credits;

    if (usage.used !== undefined && usage.left !== undefined && usage.used + usage.left > 0) {
      state.limit = usage.used + usage.left;
    }

    // The first spend starts the cold-start window; it is measured from the
    // instance's first request, not from process start.
    if (state.coldStartUntil === 0) state.coldStartUntil = now + coldStartWindowMs;
    if (now < state.coldStartUntil) state.coldStartUsed += cost.credits;

    return check(0, now);
  }

  function markExhausted(now: number = Date.now(), reportedUsed?: number): MeterSnapshot {
    roll(now);
    state.exhaustedUntil = minuteEnd(now);
    if (reportedUsed !== undefined && reportedUsed > state.used) state.used = reportedUsed;
    return check(0, now);
  }

  function noteCall(now: number = Date.now()): void {
    roll(now);
    state.calls += 1;
    lastCall = now;
  }

  return {
    label,
    check,
    assert,
    record,
    markExhausted,
    snapshot: (now: number = Date.now()) => check(0, now),
    reset: () => {
      state = {
        minute: -1,
        used: 0,
        limit: null,
        exhaustedUntil: 0,
        coldStartUntil: 0,
        coldStartUsed: 0,
        calls: 0,
      };
      lastCall = null;
    },
    noteCall,
    callsThisMinute: (now: number = Date.now()) => {
      roll(now);
      return state.calls;
    },
    lastCallAt: () => lastCall,
  };
}
