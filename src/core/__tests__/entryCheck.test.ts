// ============================================
// ENTRY CHECK TESTS
// ============================================
// The entry check is the feature the trader actually acts on, so its verdicts
// are pinned down here: how the three compasses of the selected timeframe are
// counted, the weighted share, and the three verdicts including the boundaries.
//
// The invariant that matters most: a compass with NO reading (the order-flow card
// when no source is configured) is reported as unavailable and excluded. It must
// never be counted as agreement, or a missing source would look like support.

import { describe, expect, it } from 'vitest';
import { checkEntry, verdictWord, type EntryCompassInput } from '../entryCheck';
import { DEFAULT_COMPASS_CONFIG, mergeCompassConfig } from '../../config/compass';
import type { ScoreLabel } from '../types';

const CONFIG = DEFAULT_COMPASS_CONFIG;

/** The three compasses with the given labels. */
function compasses(technical: ScoreLabel | null, summary: ScoreLabel | null, orderFlow: ScoreLabel | null): EntryCompassInput[] {
  return [
    { key: 'technical', label: 'Technical indicators', scoreLabel: technical },
    { key: 'summary', label: 'Summary', scoreLabel: summary },
    { key: 'orderFlow', label: 'Order Book', scoreLabel: orderFlow },
  ];
}

describe('checkEntry — agreement counting', () => {
  it('counts every bullish compass as agreeing with a LONG', () => {
    const result = checkEntry('LONG', compasses('BUY', 'BUY', 'BUY'), CONFIG);
    expect(result.aligned).toBe(3);
    expect(result.opposing).toBe(0);
    expect(result.neutral).toBe(0);
    expect(result.total).toBe(3);
    expect(result.share).toBe(1);
  });

  it('counts every bullish compass as opposing a SHORT', () => {
    const result = checkEntry('SHORT', compasses('BUY', 'BUY', 'BUY'), CONFIG);
    expect(result.aligned).toBe(0);
    expect(result.opposing).toBe(3);
    expect(result.share).toBe(0);
  });

  it('treats a neutral compass as neither agreement nor opposition', () => {
    const result = checkEntry('LONG', compasses('NEUTRAL', 'BUY', 'BUY'), CONFIG);
    expect(result.aligned).toBe(2);
    expect(result.opposing).toBe(0);
    expect(result.neutral).toBe(1);
    // Neutral does not dilute the share: it is measured across directional votes.
    expect(result.share).toBe(1);
  });

  it('excludes a compass with no reading instead of counting it as agreement', () => {
    const result = checkEntry('LONG', compasses('BUY', 'BUY', null), CONFIG);
    expect(result.unavailable).toBe(1);
    expect(result.total).toBe(2);
    expect(result.aligned).toBe(2);
    // Two of two directional compasses agree, so the share is still 1.
    expect(result.share).toBe(1);
  });

  it('names the disagreeing compasses', () => {
    const result = checkEntry('LONG', compasses('BUY', 'SELL', null), CONFIG);
    expect(result.disagreeing.map(compass => compass.key)).toEqual(['summary']);
  });
});

describe('checkEntry — verdicts', () => {
  it('reports ALIGNED when the weighted majority agrees', () => {
    expect(checkEntry('LONG', compasses('BUY', 'BUY', 'BUY'), CONFIG).verdict).toBe('ALIGNED');
  });

  it('reports ALIGNED for a strong short when everything is bearish', () => {
    expect(checkEntry('SHORT', compasses('STRONG_SELL', 'STRONG_SELL', 'STRONG_SELL'), CONFIG).verdict).toBe('ALIGNED');
  });

  it('reports AGAINST when the weighted majority opposes the direction', () => {
    const result = checkEntry('LONG', compasses('SELL', 'SELL', 'BUY'), CONFIG);
    expect(result.verdict).toBe('AGAINST');
  });

  it('reports AGAINST when only a minority agrees', () => {
    // Only the technical compass agrees, and it is the lightest of the three:
    // 1.0 vs summary 1.4 + order flow 1.0 = 2.4 -> share 0.294.
    const result = checkEntry('LONG', compasses('BUY', 'SELL', 'SELL'), CONFIG);
    expect(result.share).toBeCloseTo(1 / 3.4, 3);
    expect(result.verdict).toBe('AGAINST');
  });

  it('reports MIXED when the directional vote is split', () => {
    // Order flow is absent, so technical (1.0) agrees and summary (1.4)
    // disagrees: share 1.0 / 2.4 = 0.4166 — above againstShare, below
    // alignedShare.
    const result = checkEntry('LONG', compasses('BUY', 'SELL', null), CONFIG);
    expect(result.share).toBeCloseTo(1 / 2.4, 3);
    expect(result.verdict).toBe('MIXED');
  });

  it('reports MIXED when nothing has taken a side', () => {
    const result = checkEntry('LONG', compasses('NEUTRAL', 'NEUTRAL', 'NEUTRAL'), CONFIG);
    expect(result.verdict).toBe('MIXED');
    expect(result.share).toBe(0);
  });

  it('never reports ALIGNED when the only reading disagrees', () => {
    const result = checkEntry('LONG', compasses(null, 'STRONG_SELL', null), CONFIG);
    expect(result.verdict).toBe('AGAINST');
  });

  it('does not let a missing order-flow source turn a split read into agreement', () => {
    // With flow absent, one agree and one disagree is a split, not a win.
    const result = checkEntry('LONG', compasses('STRONG_BUY', 'STRONG_SELL', null), CONFIG);
    expect(result.unavailable).toBe(1);
    expect(result.verdict).not.toBe('ALIGNED');
  });
});

describe('checkEntry — weights and configuration', () => {
  it('weights the share by the configured compass weights, not the raw count', () => {
    // The heavy summary disagrees while the two lighter compasses agree:
    // 1.0 + 1.0 = 2.0 against 1.4 -> share 0.588, just under alignedShare.
    const result = checkEntry('LONG', compasses('BUY', 'SELL', 'BUY'), CONFIG);
    expect(result.share).toBeCloseTo(2 / 3.4, 3);
    expect(result.verdict).toBe('MIXED');
  });

  it('lets a custom weight table flip the verdict', () => {
    const heavySummary = mergeCompassConfig(CONFIG, {
      entryCheck: { ...CONFIG.entryCheck, compassWeights: { technical: 1, summary: 9, orderFlow: 1 } },
    });
    // The summary now dominates, so its disagreement outweighs the other two.
    expect(checkEntry('LONG', compasses('BUY', 'SELL', 'BUY'), heavySummary).verdict).toBe('AGAINST');
  });

  it('marks which compasses are unavailable', () => {
    const result = checkEntry('LONG', compasses('BUY', null, null), CONFIG);
    const unavailable = result.compasses.filter(compass => compass.stance === 'UNAVAILABLE').map(c => c.key);
    expect(unavailable).toEqual(['summary', 'orderFlow']);
  });

  it('produces a plain-language message for each verdict', () => {
    expect(checkEntry('LONG', compasses('BUY', 'BUY', 'BUY'), CONFIG).message).toMatch(/back the long setup/i);
    expect(checkEntry('SHORT', compasses('BUY', 'BUY', 'BUY'), CONFIG).message).toMatch(/oppose this short/i);
    expect(checkEntry('LONG', compasses('NEUTRAL', 'NEUTRAL', null), CONFIG).message).toMatch(/no compass has taken a side/i);
    expect(checkEntry('LONG', compasses('BUY', 'SELL', null), CONFIG).message).toMatch(/mixed/i);
  });
});

describe('verdictWord', () => {
  it('renders each verdict in words', () => {
    expect(verdictWord('ALIGNED')).toBe('Aligned');
    expect(verdictWord('MIXED')).toBe('Mixed');
    expect(verdictWord('AGAINST')).toBe('Against');
  });
});
