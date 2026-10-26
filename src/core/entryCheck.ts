// ============================================
// ENTRY CHECK
// ============================================
// "Does the market agree with the trade I am about to take?"
//
// Given a LONG or SHORT direction and every timeframe's reading, this answers:
//
//   * how many timeframes agree with the direction
//   * which ones disagree
//   * a verdict: ALIGNED / PARTIAL / AGAINST
//
// The verdict is a pure function of the inputs, so it can be tuned in one place
// (the entryCheck block in src/config/compass.ts) and unit tested without a
// browser or a market.
//
// A neutral timeframe counts as "not agreeing" but is never shown as
// disagreeing: it took no side, so it is not evidence against the trade.

import type { ScoreLabel, Timeframe } from './types';
import { TIMEFRAME_LABELS } from './types';
import type { CompassConfig } from '../config/compass';
import { isBearishLabel, isBullishLabel } from './scoring';

export type EntryDirection = 'LONG' | 'SHORT';
export type EntryVerdict = 'ALIGNED' | 'PARTIAL' | 'AGAINST';

/** The minimum a timeframe needs to expose to be judged. */
export interface EntryTimeframeInput {
  timeframe: Timeframe;
  label: ScoreLabel;
  score: number;
  available: boolean;
}

export interface EntryCheckTimeframe {
  timeframe: Timeframe;
  label: string;
  score: number;
  /** 'AGREE' | 'DISAGREE' | 'NEUTRAL' | 'UNAVAILABLE', relative to the direction. */
  stance: 'AGREE' | 'DISAGREE' | 'NEUTRAL' | 'UNAVAILABLE';
  /** True when this timeframe is one of the configured higher timeframes. */
  higher: boolean;
}

export interface EntryCheckResult {
  direction: EntryDirection;
  verdict: EntryVerdict;
  /** Timeframes that agree with the direction. */
  aligned: number;
  /** Timeframes that disagree with the direction. */
  opposing: number;
  /** Timeframes that took no side. */
  neutral: number;
  /** Timeframes with no usable data. */
  unavailable: number;
  /** Timeframes considered at all (available ones). */
  total: number;
  /** Every timeframe with its stance, in the order supplied. */
  timeframes: EntryCheckTimeframe[];
  /** The disagreeing timeframes, for the small tags. */
  disagreeing: EntryCheckTimeframe[];
  /** Higher timeframes that disagree. Drives the warning. */
  higherConflicts: EntryCheckTimeframe[];
  /** True when a higher timeframe disagrees and the rule is enabled. */
  higherTimeframeWarning: boolean;
}

/** Which way a label points relative to the chosen direction. */
function stanceFor(label: ScoreLabel, direction: EntryDirection): EntryCheckTimeframe['stance'] {
  const bullish = isBullishLabel(label);
  const bearish = isBearishLabel(label);
  if (!bullish && !bearish) return 'NEUTRAL';
  const agrees = direction === 'LONG' ? bullish : bearish;
  return agrees ? 'AGREE' : 'DISAGREE';
}

/**
 * Judge whether the timeframes agree with a LONG or SHORT entry.
 *
 * ALIGNED  at least `minAligned` timeframes agree AND no higher timeframe disagrees
 * AGAINST  at most `maxAlignedForAgainst` agree, OR most higher timeframes disagree
 * PARTIAL  anything in between
 */
export function checkEntry(
  direction: EntryDirection,
  readings: EntryTimeframeInput[],
  config: CompassConfig
): EntryCheckResult {
  const rules = config.entryCheck;
  const higherSet = new Set<Timeframe>(rules.higherTimeframes);

  const timeframes: EntryCheckTimeframe[] = readings.map(reading => ({
    timeframe: reading.timeframe,
    label: TIMEFRAME_LABELS[reading.timeframe] ?? reading.timeframe,
    score: reading.score,
    stance: reading.available ? stanceFor(reading.label, direction) : 'UNAVAILABLE',
    higher: higherSet.has(reading.timeframe),
  }));

  let aligned = 0;
  let opposing = 0;
  let neutral = 0;
  let unavailable = 0;

  for (const frame of timeframes) {
    if (frame.stance === 'UNAVAILABLE') unavailable += 1;
    else if (frame.stance === 'NEUTRAL') neutral += 1;
    else if (frame.stance === 'AGREE') aligned += 1;
    else opposing += 1;
  }

  const disagreeing = timeframes.filter(frame => frame.stance === 'DISAGREE');
  const higherConflicts = disagreeing.filter(frame => frame.higher);

  // A higher timeframe fighting the trade is the one case worth a hard warning.
  const higherTimeframeWarning =
    rules.warnOnHigherTimeframeDisagreement && higherConflicts.length > 0;

  // A majority of the higher timeframes fighting the trade is enough to call
  // it AGAINST on its own. The denominator is the configured higher set, so
  // with the default three (1H, 4H, 1D) two disagreements are needed.
  const higherMajorityAgainst = higherConflicts.length * 2 > higherSet.size;

  let verdict: EntryVerdict;
  if (aligned <= rules.maxAlignedForAgainst || higherMajorityAgainst) {
    verdict = 'AGAINST';
  } else if (aligned >= rules.minAligned && !higherTimeframeWarning) {
    verdict = 'ALIGNED';
  } else {
    verdict = 'PARTIAL';
  }

  return {
    direction,
    verdict,
    aligned,
    opposing,
    neutral,
    unavailable,
    total: aligned + opposing + neutral,
    timeframes,
    disagreeing,
    higherConflicts,
    higherTimeframeWarning,
  };
}
