// ============================================
// ENTRY CHECK
// ============================================
// "Does the market agree with the trade I am about to take?"
//
// Given a LONG or SHORT direction and every timeframe's reading, this answers
// three things, in plain language:
//
//   * how many timeframes agree with the direction
//   * which ones disagree
//   * a verdict: ALIGNED / PARTIAL / AGAINST
//
// The verdict is a pure function of the inputs, so it can be tuned in one place
// (the entryCheck block in src/config/compass.ts) and unit tested without a
// browser or a market.
//
// Agreement is measured on the timeframes that actually took a side, weighted
// by the configured timeframe weights. A neutral timeframe neither helps nor
// hurts: it is not counted as agreement, and it is not counted as opposition.

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
  /** Weighted share of the directional vote that agrees, 0..1. */
  share: number;
  /** Every timeframe with its stance, in the order supplied. */
  timeframes: EntryCheckTimeframe[];
  /** The disagreeing timeframes, for highlighting. */
  disagreeing: EntryCheckTimeframe[];
  /** Higher timeframes that disagree. Drives the warning. */
  higherConflicts: EntryCheckTimeframe[];
  /** True when a higher timeframe disagrees and the rule is enabled. */
  higherTimeframeWarning: boolean;
  /** A short, plain-language summary of the verdict. */
  message: string;
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
 * ALIGNED  the weighted majority agrees AND no higher timeframe disagrees
 * PARTIAL  some agreement, but not enough — or a higher timeframe is fighting
 * AGAINST  the weighted majority disagrees with the direction
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

  let alignedWeight = 0;
  let opposingWeight = 0;
  let aligned = 0;
  let opposing = 0;
  let neutral = 0;
  let unavailable = 0;

  for (const frame of timeframes) {
    const weight = config.timeframeWeights[frame.timeframe] ?? 0;
    if (frame.stance === 'UNAVAILABLE') {
      unavailable += 1;
      continue;
    }
    if (frame.stance === 'NEUTRAL') {
      neutral += 1;
      continue;
    }
    if (frame.stance === 'AGREE') {
      aligned += 1;
      alignedWeight += weight;
    } else {
      opposing += 1;
      opposingWeight += weight;
    }
  }

  const directionalWeight = alignedWeight + opposingWeight;
  const share = directionalWeight === 0 ? 0 : alignedWeight / directionalWeight;

  const disagreeing = timeframes.filter(frame => frame.stance === 'DISAGREE');
  const higherConflicts = disagreeing.filter(frame => frame.higher);

  // A higher timeframe fighting the trade is the one case worth a hard warning,
  // so it is reported separately from the raw count.
  const higherTimeframeWarning =
    rules.warnOnHigherTimeframeDisagreement && higherConflicts.length > 0;

  let verdict: EntryVerdict;
  if (directionalWeight === 0) {
    // Nothing has taken a side, so there is nothing to agree or disagree with.
    verdict = 'PARTIAL';
  } else if (share < rules.againstShare) {
    verdict = 'AGAINST';
  } else if (share >= rules.alignedShare && !higherTimeframeWarning) {
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
    share,
    timeframes,
    disagreeing,
    higherConflicts,
    higherTimeframeWarning,
    message: describeVerdict(verdict, direction, aligned, opposing, neutral, higherConflicts),
  };
}

function describeVerdict(
  verdict: EntryVerdict,
  direction: EntryDirection,
  aligned: number,
  opposing: number,
  neutral: number,
  higherConflicts: EntryCheckTimeframe[]
): string {
  const side = direction === 'LONG' ? 'long' : 'short';

  if (verdict === 'ALIGNED') {
    return `${aligned} of ${aligned + opposing + neutral} timeframes back the ${side} setup.`;
  }

  if (verdict === 'AGAINST') {
    return `${opposing} of ${aligned + opposing + neutral} timeframes oppose this ${side}. The market disagrees.`;
  }

  if (aligned + opposing === 0) {
    return 'No timeframe has taken a side yet — nothing to align with.';
  }

  if (higherConflicts.length > 0) {
    const names = higherConflicts.map(frame => frame.label).join(', ');
    return `Mixed, and ${names} disagree${higherConflicts.length === 1 ? 's' : ''} with this ${side}.`;
  }

  return `Mixed: ${aligned} agree, ${opposing} disagree, ${neutral} neutral. Not a clean ${side}.`;
}
