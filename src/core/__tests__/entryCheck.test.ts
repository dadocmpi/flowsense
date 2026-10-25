// ============================================
// ENTRY CHECK TESTS
// ============================================
// The entry check is the feature the trader actually acts on, so its verdicts
// are pinned down here: alignment counting, the higher-timeframe warning, and
// the three verdicts, including the boundaries.

import { describe, expect, it } from 'vitest';
import { checkEntry, type EntryTimeframeInput } from '../entryCheck';
import { DEFAULT_COMPASS_CONFIG, mergeCompassConfig } from '../../config/compass';
import type { ScoreLabel, Timeframe } from '../types';

const CONFIG = DEFAULT_COMPASS_CONFIG;

function frame(timeframe: Timeframe, label: ScoreLabel, available = true): EntryTimeframeInput {
  const score = label === 'STRONG_BUY' ? 90 : label === 'BUY' ? 40 : label === 'SELL' ? -40 : label === 'STRONG_SELL' ? -90 : 0;
  return { timeframe, label, score, available };
}

/** All seven intraday-to-daily timeframes reading the same way. */
function allFrames(label: ScoreLabel): EntryTimeframeInput[] {
  return (['1m', '5m', '15m', '30m', '1h', '4h', '1D'] as Timeframe[]).map(tf => frame(tf, label));
}

describe('checkEntry — agreement counting', () => {
  it('counts every bullish timeframe as agreeing with a LONG', () => {
    const result = checkEntry('LONG', allFrames('BUY'), CONFIG);
    expect(result.aligned).toBe(7);
    expect(result.opposing).toBe(0);
    expect(result.neutral).toBe(0);
    expect(result.total).toBe(7);
    expect(result.share).toBe(1);
  });

  it('counts every bullish timeframe as opposing a SHORT', () => {
    const result = checkEntry('SHORT', allFrames('BUY'), CONFIG);
    expect(result.aligned).toBe(0);
    expect(result.opposing).toBe(7);
    expect(result.share).toBe(0);
  });

  it('treats a neutral timeframe as neither agreement nor opposition', () => {
    const readings = [frame('1m', 'NEUTRAL'), frame('15m', 'BUY'), frame('1h', 'BUY')];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.aligned).toBe(2);
    expect(result.opposing).toBe(0);
    expect(result.neutral).toBe(1);
    // Neutral does not dilute the share: it is measured across directional votes.
    expect(result.share).toBe(1);
  });

  it('ignores an unavailable timeframe entirely', () => {
    const readings = [frame('1m', 'BUY', false), frame('1h', 'BUY')];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.unavailable).toBe(1);
    expect(result.total).toBe(1);
    expect(result.aligned).toBe(1);
  });

  it('names the disagreeing timeframes', () => {
    const readings = [frame('1m', 'BUY'), frame('15m', 'BUY'), frame('1h', 'SELL'), frame('4h', 'SELL')];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.disagreeing.map(f => f.timeframe)).toEqual(['1h', '4h']);
  });
});

describe('checkEntry — verdicts', () => {
  it('reports ALIGNED when the majority agrees and no higher timeframe fights', () => {
    const result = checkEntry('LONG', allFrames('BUY'), CONFIG);
    expect(result.verdict).toBe('ALIGNED');
  });

  it('reports ALIGNED for a strong short when the market is bearish', () => {
    const result = checkEntry('SHORT', allFrames('STRONG_SELL'), CONFIG);
    expect(result.verdict).toBe('ALIGNED');
  });

  it('reports AGAINST when the weighted majority opposes the direction', () => {
    const readings = [frame('1m', 'BUY'), frame('5m', 'SELL'), frame('15m', 'SELL'), frame('1h', 'SELL')];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.verdict).toBe('AGAINST');
  });

  it('never reports ALIGNED when a higher timeframe disagrees', () => {
    // Six timeframes agree, but the 1D fights the trade. That is exactly the
    // case the higher-timeframe rule exists to catch.
    const readings: EntryTimeframeInput[] = [
      frame('1m', 'STRONG_BUY'),
      frame('5m', 'STRONG_BUY'),
      frame('15m', 'STRONG_BUY'),
      frame('30m', 'STRONG_BUY'),
      frame('1h', 'STRONG_BUY'),
      frame('4h', 'STRONG_BUY'),
      frame('1D', 'STRONG_SELL'),
    ];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.verdict).not.toBe('ALIGNED');
    expect(result.verdict).toBe('PARTIAL');
    expect(result.higherTimeframeWarning).toBe(true);
    expect(result.higherConflicts.map(f => f.timeframe)).toEqual(['1D']);
  });

  it('reports PARTIAL when the majority is only marginal', () => {
    // 1m (0.2) + 5m (0.6) agree = 0.8; 15m (1.0) opposes. Share 0.44 sits
    // between againstShare (0.4) and alignedShare (0.6), and no higher
    // timeframe is involved, so this is a clean PARTIAL.
    const readings = [frame('1m', 'BUY'), frame('5m', 'BUY'), frame('15m', 'SELL')];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.share).toBeCloseTo(0.444, 2);
    expect(result.higherConflicts).toHaveLength(0);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('reports PARTIAL when nothing has taken a side', () => {
    const result = checkEntry('LONG', allFrames('NEUTRAL'), CONFIG);
    expect(result.verdict).toBe('PARTIAL');
    expect(result.share).toBe(0);
  });

  it('allows ALIGNED to be suppressed by the higher-timeframe rule alone', () => {
    const strict = mergeCompassConfig(CONFIG, {
      entryCheck: { ...CONFIG.entryCheck, warnOnHigherTimeframeDisagreement: false },
    });
    const readings: EntryTimeframeInput[] = [
      frame('1m', 'STRONG_BUY'),
      frame('5m', 'STRONG_BUY'),
      frame('15m', 'STRONG_BUY'),
      frame('30m', 'STRONG_BUY'),
      frame('1h', 'STRONG_BUY'),
      frame('4h', 'STRONG_BUY'),
      frame('1D', 'STRONG_SELL'),
    ];
    // With the rule off, the majority alone decides.
    expect(checkEntry('LONG', readings, strict).verdict).toBe('ALIGNED');
    // With the rule on (the default), the same input cannot be ALIGNED.
    expect(checkEntry('LONG', readings, CONFIG).verdict).toBe('PARTIAL');
  });
});

describe('checkEntry — weights and configuration', () => {
  it('weights the share by the configured timeframe weights, not the raw count', () => {
    // One heavy 1D against three light intraday timeframes: the daily dominates
    // the weighted share even though it is outnumbered.
    const readings = [frame('1m', 'SELL'), frame('5m', 'SELL'), frame('15m', 'SELL'), frame('1D', 'BUY')];
    const result = checkEntry('LONG', readings, CONFIG);
    // 1D weight 2.0 vs 1m+5m+15m = 0.2+0.6+1.0 = 1.8, so the daily wins.
    expect(result.share).toBeGreaterThan(0.5);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('respects a custom higher-timeframe set', () => {
    const custom = mergeCompassConfig(CONFIG, {
      entryCheck: { ...CONFIG.entryCheck, higherTimeframes: ['4h', '1D'] },
    });
    const readings = [frame('1h', 'SELL'), frame('4h', 'BUY'), frame('1D', 'BUY'), frame('1m', 'BUY')];
    const result = checkEntry('LONG', readings, custom);
    // 1h is no longer "higher", so its disagreement does not trigger the rule.
    expect(result.higherConflicts).toHaveLength(0);
    expect(result.higherTimeframeWarning).toBe(false);
  });

  it('marks which timeframes count as higher', () => {
    const result = checkEntry('LONG', allFrames('BUY'), CONFIG);
    const higher = result.timeframes.filter(f => f.higher).map(f => f.timeframe);
    expect(higher).toEqual(['1h', '4h', '1D']);
  });

  it('produces a plain-language message for each verdict', () => {
    expect(checkEntry('LONG', allFrames('BUY'), CONFIG).message).toMatch(/back the long setup/i);
    expect(checkEntry('SHORT', allFrames('BUY'), CONFIG).message).toMatch(/oppose this short/i);
    expect(checkEntry('LONG', allFrames('NEUTRAL'), CONFIG).message).toMatch(/no timeframe has taken a side/i);
  });
});
