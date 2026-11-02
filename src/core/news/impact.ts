// ============================================
// NEWS IMPACT CLASSIFICATION (pure)
// ============================================
// Two rule-based decisions, both pure and both testable without a network:
//
//   * how a provider's raw impact label maps onto our High / Medium / Low scale
//   * which assets a given event is KNOWN to move (the "affects" label)
//
// The "affects" mapping is a classification of the event, not a prediction of
// its outcome. It says "an FOMC decision moves USD and US indices"; it never
// says which way, and it never invents a number.
//
// Event-risk rule: the flag is red when a High-impact event is within the next
// 60 minutes or was released in the last 30 minutes.

export type ImpactLevel = 'High' | 'Medium' | 'Low';

/** Minutes before a High-impact event that the risk flag turns red. */
export const EVENT_RISK_LEAD_MINUTES = 60;
/** Minutes after a High-impact event that the risk flag stays red. */
export const EVENT_RISK_TAIL_MINUTES = 30;

/** The assets an event can be tagged as affecting. */
export const AFFECTED_ASSETS = ['USD', 'Gold', 'US indices'] as const;
export type AffectedAsset = (typeof AFFECTED_ASSETS)[number];

/**
 * Map a provider's impact wording onto our three levels.
 *
 * Providers use "high"/"medium"/"low" and sometimes "3"/"2"/"1" or "H"/"M"/"L".
 * Anything unrecognised is Low: an unknown event must never be presented as
 * high impact.
 */
export function normalizeImpact(raw: string | number | null | undefined): ImpactLevel {
  if (raw === null || raw === undefined) return 'Low';
  const value = String(raw).trim().toLowerCase();
  if (value === 'high' || value === '3' || value === 'h') return 'High';
  if (value === 'medium' || value === 'med' || value === '2' || value === 'm') return 'Medium';
  return 'Low';
}

/**
 * The rules that decide which assets an event moves.
 *
 * Each rule is a set of lowercase substrings to look for in the event name and
 * the assets it moves. The FIRST matching rule wins, so the list is ordered
 * most-specific first. This is a classification table, not a forecast: editing
 * it changes the label, never a number.
 */
interface AffectRule {
  /** Substrings that identify the event (matched case-insensitively). */
  match: string[];
  /** The assets this event is known to move. */
  affects: AffectedAsset[];
}

const AFFECT_RULES: AffectRule[] = [
  // The Fed moves everything priced in dollars, gold included. The bank name is
  // matched, not the generic phrase "interest rate decision": that phrase also
  // appears in the ECB's and the BoE's titles, which are handled below.
  { match: ['fomc', 'federal funds', 'fed ', 'federal reserve'], affects: ['USD', 'Gold', 'US indices'] },
  { match: ['cpi', 'ppi', 'inflation', 'pce'], affects: ['USD', 'Gold', 'US indices'] },
  { match: ['non-farm', 'nonfarm', 'nfp', 'payroll', 'unemployment', 'jobless', 'adp'], affects: ['USD', 'US indices'] },
  { match: ['gdp'], affects: ['USD', 'US indices'] },
  { match: ['retail sales'], affects: ['USD', 'US indices'] },
  { match: ['ism', 'pmi', 'purchasing managers'], affects: ['USD', 'US indices'] },
  { match: ['consumer confidence', 'sentiment'], affects: ['USD', 'US indices'] },
  // Other central banks move the dollar through the cross rate. Checked before
  // the generic rules so an ECB or BoE decision is not read as a Fed one.
  { match: ['ecb', 'lagarde', 'boe', 'boj', 'bank of japan', 'bank of england'], affects: ['USD'] },
  // Gold-specific drivers.
  { match: ['gold', 'bullion'], affects: ['Gold'] },
];

/**
 * Which assets an event is known to move. Unmatched events affect nothing we
 * track, and are reported as an empty list rather than guessed at.
 */
export function affectsFor(eventName: string, country?: string): AffectedAsset[] {
  const haystack = `${eventName} ${country ?? ''}`.toLowerCase();
  for (const rule of AFFECT_RULES) {
    if (rule.match.some(needle => haystack.includes(needle))) return [...rule.affects];
  }
  return [];
}

/** Whether an event matters to the assets this app tracks. */
export function affectsTrackedAssets(eventName: string, country?: string): boolean {
  return affectsFor(eventName, country).length > 0;
}

export interface EventRiskInput {
  /** ISO 8601 release time. */
  time: string;
  impact: ImpactLevel;
}

/**
 * The event-risk flag.
 *
 * Red when a High-impact event is within the next 60 minutes or was released in
 * the last 30 minutes; neutral otherwise. `now` is passed in so the rule is
 * testable without a clock.
 */
export function eventRiskFlag(events: EventRiskInput[], now: number): boolean {
  for (const event of events) {
    if (event.impact !== 'High') continue;
    const at = Date.parse(event.time);
    if (!Number.isFinite(at)) continue;
    const minutesUntil = (at - now) / 60_000;
    if (minutesUntil <= EVENT_RISK_LEAD_MINUTES && minutesUntil >= -EVENT_RISK_TAIL_MINUTES) return true;
  }
  return false;
}

/**
 * The next High-impact event at or after `now`, for the countdown. Returns null
 * when there is none in the supplied list.
 */
export function nextHighImpactEvent<T extends EventRiskInput>(events: T[], now: number): T | null {
  let best: T | null = null;
  let bestTime = Infinity;
  for (const event of events) {
    if (event.impact !== 'High') continue;
    const at = Date.parse(event.time);
    if (!Number.isFinite(at) || at < now) continue;
    if (at < bestTime) {
      bestTime = at;
      best = event;
    }
  }
  return best;
}
