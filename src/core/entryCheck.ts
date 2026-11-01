// ============================================
// ENTRY CHECK
// ============================================
// "Does the market agree with the trade I am about to take?"
//
// It compares the chosen direction with the three compasses of the SELECTED
// timeframe — Technical indicators, Summary and Order flow — and returns one
// verdict in plain language:
//
//   ALIGNED  the weighted majority of the compasses agrees
//   MIXED    some agreement, but not enough for a clean read
//   AGAINST  the weighted majority disagrees with the direction
//
// The verdict is a pure function of the inputs, so it can be tuned in one place
// (the entryCheck block in src/config/compass.ts) and unit tested without a
// browser or a market.
//
// Agreement is measured on the compasses that actually took a side, weighted by
// their configured weight. A neutral compass neither helps nor hurts: it is not
// counted as agreement, and it is not counted as opposition. A compass with no
// reading at all — the order-flow card when no source is configured — is
// reported as unavailable and excluded, so a missing source can never be
// mistaken for agreement.

import type { ScoreLabel } from './types';
import type { CompassConfig } from '../config/compass';
import { isBearishLabel, isBullishLabel } from './scoring';

export type EntryDirection = 'LONG' | 'SHORT';
export type EntryVerdict = 'ALIGNED' | 'MIXED' | 'AGAINST';

/** The three compasses the entry check judges. */
export type EntryCompassKey = 'technical' | 'summary' | 'orderFlow';

/** What one compass reports, as the entry check sees it. */
export interface EntryCompassInput {
  key: EntryCompassKey;
  /** Display name, e.g. "Technical indicators". */
  label: string;
  /** The compass label, or null when that compass has no reading. */
  scoreLabel: ScoreLabel | null;
}

export interface EntryCompassStance extends EntryCompassInput {
  /** 'AGREE' | 'DISAGREE' | 'NEUTRAL' | 'UNAVAILABLE', relative to the direction. */
  stance: 'AGREE' | 'DISAGREE' | 'NEUTRAL' | 'UNAVAILABLE';
  weight: number;
}

export interface EntryCheckResult {
  direction: EntryDirection;
  verdict: EntryVerdict;
  /** Compasses that agree with the direction. */
  aligned: number;
  /** Compasses that disagree. */
  opposing: number;
  /** Compasses that took no side. */
  neutral: number;
  /** Compasses with no reading (no order-flow source, or not enough candles). */
  unavailable: number;
  /** Compasses considered at all (the three, minus the unavailable ones). */
  total: number;
  /** Weighted share of the directional vote that agrees, 0..1. */
  share: number;
  /** Every compass with its stance, in the order supplied. */
  compasses: EntryCompassStance[];
  /** The disagreeing compasses, for highlighting. */
  disagreeing: EntryCompassStance[];
  /** A short, plain-language summary of the verdict. */
  message: string;
}

/** Which way a label points relative to the chosen direction. */
function stanceFor(label: ScoreLabel, direction: EntryDirection): EntryCompassStance['stance'] {
  const bullish = isBullishLabel(label);
  const bearish = isBearishLabel(label);
  if (!bullish && !bearish) return 'NEUTRAL';
  const agrees = direction === 'LONG' ? bullish : bearish;
  return agrees ? 'AGREE' : 'DISAGREE';
}

/** The UI word for a verdict. */
export function verdictWord(verdict: EntryVerdict): string {
  if (verdict === 'ALIGNED') return 'Aligned';
  if (verdict === 'AGAINST') return 'Against';
  return 'Mixed';
}

/**
 * Judge whether the three compasses of one timeframe agree with a LONG or SHORT
 * entry.
 */
export function checkEntry(
  direction: EntryDirection,
  compasses: EntryCompassInput[],
  config: CompassConfig
): EntryCheckResult {
  const rules = config.entryCheck;

  const judged: EntryCompassStance[] = compasses.map(compass => ({
    ...compass,
    stance: compass.scoreLabel ? stanceFor(compass.scoreLabel, direction) : 'UNAVAILABLE',
    weight: rules.compassWeights[compass.key] ?? 1,
  }));

  let alignedWeight = 0;
  let opposingWeight = 0;
  let aligned = 0;
  let opposing = 0;
  let neutral = 0;
  let unavailable = 0;

  for (const compass of judged) {
    if (compass.stance === 'UNAVAILABLE') {
      unavailable += 1;
      continue;
    }
    if (compass.stance === 'NEUTRAL') {
      neutral += 1;
      continue;
    }
    if (compass.stance === 'AGREE') {
      aligned += 1;
      alignedWeight += compass.weight;
    } else {
      opposing += 1;
      opposingWeight += compass.weight;
    }
  }

  const directionalWeight = alignedWeight + opposingWeight;
  const share = directionalWeight === 0 ? 0 : alignedWeight / directionalWeight;
  const disagreeing = judged.filter(compass => compass.stance === 'DISAGREE');

  let verdict: EntryVerdict;
  if (directionalWeight === 0) {
    // Nothing has taken a side, so there is nothing to agree or disagree with.
    verdict = 'MIXED';
  } else if (share < rules.againstShare) {
    verdict = 'AGAINST';
  } else if (share >= rules.alignedShare) {
    verdict = 'ALIGNED';
  } else {
    verdict = 'MIXED';
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
    compasses: judged,
    disagreeing,
    message: describeVerdict(verdict, direction, aligned, opposing, neutral, unavailable, disagreeing),
  };
}

function describeVerdict(
  verdict: EntryVerdict,
  direction: EntryDirection,
  aligned: number,
  opposing: number,
  neutral: number,
  unavailable: number,
  disagreeing: EntryCompassStance[]
): string {
  const side = direction === 'LONG' ? 'long' : 'short';

  if (verdict === 'ALIGNED') {
    return `${aligned} of ${aligned + opposing + neutral} compasses back the ${side} setup.`;
  }

  if (verdict === 'AGAINST') {
    return `${opposing} of ${aligned + opposing + neutral} compasses oppose this ${side}. The market disagrees.`;
  }

  if (aligned + opposing === 0) {
    return 'No compass has taken a side yet — nothing to align with.';
  }

  if (disagreeing.length > 0) {
    const names = disagreeing.map(compass => compass.label).join(' and ');
    return `Mixed: ${names} disagree${disagreeing.length === 1 ? 's' : ''} with this ${side}, so it is not a clean setup.`;
  }

  const extra = unavailable > 0 ? `, ${unavailable} with no reading` : '';
  return `Mixed: ${aligned} agree, ${opposing} disagree, ${neutral} neutral${extra}.`;
}
