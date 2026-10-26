// ============================================
// ENTRY CHECK TESTS
// ============================================
// The entry check is the feature the trader actually acts on, so its verdicts
// are pinned down here: alignment counting, the higher-timeframe rule and the
// three verdicts, including the boundaries.
//
// The configured rules (src/config/compass.ts):
//   ALIGNED  at least 5 of 7 timeframes agree AND no higher timeframe disagrees
//   AGAINST  at most 3 agree, OR most of the higher timeframes disagree
//   PARTIAL  otherwise

import { describe, expect, it } from 'vitest';
import { checkEntry, type EntryTimeframeInput } from '../entryCheck';
import { DEFAULT_COMPASS_CONFIG, mergeCompassConfig } from '../../config/compass';
import type { ScoreLabel, Timeframe } from '../types';

const CONFIG = DEFAULT_COMPASS_CONFIG;

function frame(timeframe: Timeframe, label: ScoreLabel, available = true): EntryTimeframeInput {
  const score =
    label === 'STRONG_BUY' ? 90 : label === 'BUY' ? 40 : label === 'SELL' ? -40 : label === 'STRONG_SELL' ? -90 : 0;
  return { timeframe, label, score, available };
}

/** All seven timeframes reading the same way. */
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
  });

  it('counts every bullish timeframe as opposing a SHORT', () => {
    const result = checkEntry('SHORT', allFrames('BUY'), CONFIG);
    expect(result.aligned).toBe(0);
    expect(result.opposing).toBe(7);
  });

  it('treats a neutral timeframe as neither agreement nor opposition', () => {
    const readings = [frame('1m', 'NEUTRAL'), frame('15m', 'BUY'), frame('1h', 'BUY')];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.aligned).toBe(2);
    expect(result.opposing).toBe(0);
    expect(result.neutral).toBe(1);
    expect(result.total).toBe(3);
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

  it('never lists a neutral timeframe as disagreeing', () => {
    const readings = [frame('1m', 'BUY'), frame('1h', 'NEUTRAL'), frame('4h', 'NEUTRAL')];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.disagreeing).toHaveLength(0);
  });
});

describe('checkEntry — verdicts', () => {
  it('reports ALIGNED when at least five agree and no higher timeframe fights', () => {
    const result = checkEntry('LONG', allFrames('BUY'), CONFIG);
    expect(result.verdict).toBe('ALIGNED');
  });

  it('reports ALIGNED for a strong short when the market is bearish', () => {
    const result = checkEntry('SHORT', allFrames('STRONG_SELL'), CONFIG);
    expect(result.verdict).toBe('ALIGNED');
  });

  it('reports ALIGNED at exactly the minimum of five agreeing timeframes', () => {
    const readings = [
      frame('1m', 'BUY'),
      frame('5m', 'BUY'),
      frame('15m', 'BUY'),
      frame('30m', 'BUY'),
      frame('1h', 'BUY'),
      frame('4h', 'NEUTRAL'),
      frame('1D', 'NEUTRAL'),
    ];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.aligned).toBe(5);
    expect(result.verdict).toBe('ALIGNED');
  });

  it('reports AGAINST when at most three timeframes agree', () => {
    const readings = [
      frame('1m', 'BUY'),
      frame('5m', 'SELL'),
      frame('15m', 'SELL'),
      frame('30m', 'SELL'),
      frame('1h', 'SELL'),
      frame('4h', 'SELL'),
      frame('1D', 'SELL'),
    ];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.aligned).toBe(1);
    expect(result.verdict).toBe('AGAINST');
  });

  it('reports AGAINST at exactly three agreeing timeframes', () => {
    const readings = [
      frame('1m', 'BUY'),
      frame('5m', 'BUY'),
      frame('15m', 'BUY'),
      frame('30m', 'NEUTRAL'),
      frame('1h', 'NEUTRAL'),
      frame('4h', 'NEUTRAL'),
      frame('1D', 'NEUTRAL'),
    ];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.aligned).toBe(3);
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

  it('reports AGAINST when the majority of the higher timeframes disagree', () => {
    // Four timeframes agree, which alone would be PARTIAL, but two of the
    // three higher timeframes fight the trade.
    const readings: EntryTimeframeInput[] = [
      frame('1m', 'BUY'),
      frame('5m', 'BUY'),
      frame('15m', 'BUY'),
      frame('30m', 'BUY'),
      frame('1h', 'SELL'),
      frame('4h', 'SELL'),
      frame('1D', 'NEUTRAL'),
    ];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.aligned).toBe(4);
    expect(result.verdict).toBe('AGAINST');
  });

  it('reports PARTIAL when four agree and the higher timeframes do not dominate', () => {
    const readings: EntryTimeframeInput[] = [
      frame('1m', 'BUY'),
      frame('5m', 'BUY'),
      frame('15m', 'BUY'),
      frame('30m', 'BUY'),
      frame('1h', 'NEUTRAL'),
      frame('4h', 'NEUTRAL'),
      frame('1D', 'SELL'),
    ];
    const result = checkEntry('LONG', readings, CONFIG);
    expect(result.aligned).toBe(4);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('reports PARTIAL when nothing has taken a side', () => {
    const result = checkEntry('LONG', allFrames('NEUTRAL'), CONFIG);
    // Zero agreeing is at or below maxAlignedForAgainst, so the rules call this
    // AGAINST: there is no agreement to build on.
    expect(result.aligned).toBe(0);
    expect(result.verdict).toBe('AGAINST');
  });

  it('allows ALIGNED to be suppressed by the higher-timeframe rule alone', () => {
    const relaxed = mergeCompassConfig(CONFIG, {
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
    // With the rule off, the count alone decides.
    expect(checkEntry('LONG', readings, relaxed).verdict).toBe('ALIGNED');
    // With the rule on (the default), the same input cannot be ALIGNED.
    expect(checkEntry('LONG', readings, CONFIG).verdict).toBe('PARTIAL');
  });
});

describe('checkEntry — configuration', () => {
  it('marks which timeframes count as higher', () => {
    const result = checkEntry('LONG', allFrames('BUY'), CONFIG);
    const higher = result.timeframes.filter(f => f.higher).map(f => f.timeframe);
    expect(higher).toEqual(['1h', '4h', '1D']);
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

  it('honours a custom minimum agreement count', () => {
    const strict = mergeCompassConfig(CONFIG, {
      entryCheck: { ...CONFIG.entryCheck, minAligned: 7 },
    });
    const readings = [
      frame('1m', 'BUY'),
      frame('5m', 'BUY'),
      frame('15m', 'BUY'),
      frame('30m', 'BUY'),
      frame('1h', 'BUY'),
      frame('4h', 'BUY'),
      frame('1D', 'NEUTRAL'),
    ];
    expect(checkEntry('LONG', readings, CONFIG).verdict).toBe('ALIGNED');
    expect(checkEntry('LONG', readings, strict).verdict).toBe('PARTIAL');
  });
});
