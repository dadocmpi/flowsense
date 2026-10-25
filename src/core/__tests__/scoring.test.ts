// ============================================
// SCORING / LABEL CONSISTENCY TESTS
// ============================================
// These tests exist because of a real bug: a positive score could be labelled
// "Sell". The invariant locked in here is that the label is a pure function of
// the score, so the two can never disagree.

import { describe, expect, it } from 'vitest';
import {
  buildGauge,
  buildSummaryGauge,
  clampScore,
  computeConfluence,
  confidenceFromGauge,
  isBearishLabel,
  isBullishLabel,
  labelFromScore,
  labelText,
  needleAngleFromScore,
  scoreFromVotes,
  tallyVotes,
  voteValue,
} from '../scoring';
import { DEFAULT_COMPASS_CONFIG, mergeCompassConfig } from '../../config/compass';
import type { GaugeReading, Vote, VoteDetail } from '../types';

function detail(name: string, vote: Vote): VoteDetail {
  return { name, value: 1, display: '1', vote };
}

describe('voteValue', () => {
  it('maps Buy to +1, Sell to -1 and Neutral to 0', () => {
    expect(voteValue('BUY')).toBe(1);
    expect(voteValue('SELL')).toBe(-1);
    expect(voteValue('NEUTRAL')).toBe(0);
  });
});

describe('tallyVotes', () => {
  it('counts each side', () => {
    const tally = tallyVotes([detail('a', 'BUY'), detail('b', 'BUY'), detail('c', 'SELL'), detail('d', 'NEUTRAL')]);
    expect(tally).toEqual({ buy: 2, sell: 1, neutral: 1 });
  });
});

describe('labelFromScore', () => {
  it('follows the documented mapping', () => {
    expect(labelFromScore(100, DEFAULT_COMPASS_CONFIG)).toBe('STRONG_BUY');
    expect(labelFromScore(60, DEFAULT_COMPASS_CONFIG)).toBe('STRONG_BUY');
    expect(labelFromScore(59.9, DEFAULT_COMPASS_CONFIG)).toBe('BUY');
    expect(labelFromScore(20, DEFAULT_COMPASS_CONFIG)).toBe('BUY');
    expect(labelFromScore(19.9, DEFAULT_COMPASS_CONFIG)).toBe('NEUTRAL');
    expect(labelFromScore(0, DEFAULT_COMPASS_CONFIG)).toBe('NEUTRAL');
    expect(labelFromScore(-19.9, DEFAULT_COMPASS_CONFIG)).toBe('NEUTRAL');
    expect(labelFromScore(-20, DEFAULT_COMPASS_CONFIG)).toBe('SELL');
    expect(labelFromScore(-59.9, DEFAULT_COMPASS_CONFIG)).toBe('SELL');
    expect(labelFromScore(-60, DEFAULT_COMPASS_CONFIG)).toBe('STRONG_SELL');
    expect(labelFromScore(-100, DEFAULT_COMPASS_CONFIG)).toBe('STRONG_SELL');
  });

  it('REGRESSION: the historical "positive score, Sell label" bug cannot recur', () => {
    // Root cause of the original bug: the old engine scored on a 0-100 scale
    // where 50 was neutral, with cut-offs strongBuy 75 / buy 55 / sell 45 /
    // strongSell 25. A reading of 30 or 25 was genuinely bearish, but it was
    // rendered as the bare number "Score 30" beside the word "Sell", so it read
    // as a positive score carrying a bearish label.
    //
    // The signed scale removes the ambiguity: the sign IS the direction. These
    // are the exact values that used to look wrong, and they must now be
    // unambiguously bearish.
    for (const legacyLookingValue of [-25, -30, -33, -20]) {
      expect(labelFromScore(legacyLookingValue, DEFAULT_COMPASS_CONFIG)).not.toBe('BUY');
      expect(labelFromScore(legacyLookingValue, DEFAULT_COMPASS_CONFIG)).not.toBe('STRONG_BUY');
    }

    // And the positive counterparts are unambiguously bullish, never bearish.
    for (const value of [20, 25, 30, 33, 55, 75]) {
      const label = labelFromScore(value, DEFAULT_COMPASS_CONFIG);
      expect(isBearishLabel(label)).toBe(false);
      expect(isBullishLabel(label)).toBe(true);
    }
  });

  it('NEVER gives a bearish label to a positive score', () => {
    for (let score = 1; score <= 100; score += 0.5) {
      const label = labelFromScore(score, DEFAULT_COMPASS_CONFIG);
      expect(isBearishLabel(label)).toBe(false);
    }
  });

  it('NEVER gives a bullish label to a negative score', () => {
    for (let score = -1; score >= -100; score -= 0.5) {
      const label = labelFromScore(score, DEFAULT_COMPASS_CONFIG);
      expect(isBullishLabel(label)).toBe(false);
    }
  });

  it('always gives Neutral to a score of exactly zero', () => {
    expect(labelFromScore(0, DEFAULT_COMPASS_CONFIG)).toBe('NEUTRAL');
    expect(labelFromScore(-0, DEFAULT_COMPASS_CONFIG)).toBe('NEUTRAL');
  });

  it('regression: the exact scores that used to be mislabelled', () => {
    // 20, 25, 30 and 33 are all positive and were shown as Sell / Strong sell.
    for (const score of [20, 25, 30, 33]) {
      const label = labelFromScore(score, DEFAULT_COMPASS_CONFIG);
      expect(isBullishLabel(label) || label === 'NEUTRAL').toBe(true);
      expect(label).not.toBe('SELL');
      expect(label).not.toBe('STRONG_SELL');
    }
    // And their mirror images must be bearish, not bullish.
    for (const score of [-20, -25, -30, -33]) {
      const label = labelFromScore(score, DEFAULT_COMPASS_CONFIG);
      expect(isBearishLabel(label)).toBe(true);
    }
  });

  it('is monotonic: a higher score never gets a more bearish label', () => {
    const rank = { STRONG_SELL: 0, SELL: 1, NEUTRAL: 2, BUY: 3, STRONG_BUY: 4 } as const;
    let previous = rank[labelFromScore(-100, DEFAULT_COMPASS_CONFIG)];
    for (let score = -99; score <= 100; score += 1) {
      const current = rank[labelFromScore(score, DEFAULT_COMPASS_CONFIG)];
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('honours custom thresholds', () => {
    const config = mergeCompassConfig(DEFAULT_COMPASS_CONFIG, {
      thresholds: { strongBuy: 80, buy: 10, sell: -10, strongSell: -80 },
    });
    expect(labelFromScore(15, config)).toBe('BUY');
    expect(labelFromScore(75, config)).toBe('BUY');
    expect(labelFromScore(85, config)).toBe('STRONG_BUY');
  });
});

describe('labelText', () => {
  it('renders every label in words', () => {
    expect(labelText('STRONG_BUY')).toBe('Strong buy');
    expect(labelText('BUY')).toBe('Buy');
    expect(labelText('NEUTRAL')).toBe('Neutral');
    expect(labelText('SELL')).toBe('Sell');
    expect(labelText('STRONG_SELL')).toBe('Strong sell');
  });
});

describe('scoreFromVotes', () => {
  it('is +100 when every vote is Buy and -100 when every vote is Sell', () => {
    const weights = { a: 1, b: 1 };
    expect(scoreFromVotes([detail('a', 'BUY'), detail('b', 'BUY')], weights)).toBe(100);
    expect(scoreFromVotes([detail('a', 'SELL'), detail('b', 'SELL')], weights)).toBe(-100);
  });

  it('is 0 when the directional votes cancel out', () => {
    const weights = { a: 1, b: 1 };
    expect(scoreFromVotes([detail('a', 'BUY'), detail('b', 'SELL')], weights)).toBe(0);
  });

  it('is 0 when nothing voted directionally', () => {
    expect(scoreFromVotes([detail('a', 'NEUTRAL')], { a: 1 })).toBe(0);
    expect(scoreFromVotes([], {})).toBe(0);
  });

  it('weights votes by the configured weight table', () => {
    // One heavy buy (weight 3) against one light sell (weight 1) -> +50.
    const weights = { heavy: 3, light: 1 };
    expect(scoreFromVotes([detail('heavy', 'BUY'), detail('light', 'SELL')], weights)).toBe(50);
  });

  it('ignores neutral votes in the denominator', () => {
    // 1 buy + 1 neutral -> +100, because neutral carries no directional weight.
    const weights = { a: 1, n: 1 };
    expect(scoreFromVotes([detail('a', 'BUY'), detail('n', 'NEUTRAL')], weights)).toBe(100);
  });

  it('uses the fallback weight for unknown names', () => {
    expect(scoreFromVotes([detail('unknown', 'BUY')], {}, 1)).toBe(100);
  });

  it('stays inside -100..+100', () => {
    const many = Array.from({ length: 50 }, (_, i) => detail(`d${i}`, 'BUY'));
    expect(scoreFromVotes(many, {})).toBe(100);
  });
});

describe('clampScore', () => {
  it('clamps to the signed range and treats NaN as neutral', () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-150)).toBe(-100);
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore(42)).toBe(42);
  });
});

describe('buildGauge', () => {
  it('produces a score, a label derived from that score, and a tally', () => {
    const gauge = buildGauge(
      [detail('a', 'BUY'), detail('b', 'BUY'), detail('c', 'SELL'), detail('d', 'NEUTRAL')],
      { a: 1, b: 1, c: 1, d: 1 },
      DEFAULT_COMPASS_CONFIG
    );
    // (1 + 1 - 1) / 3 * 100 = 33.33
    expect(gauge.score).toBeCloseTo(33.33, 2);
    expect(gauge.label).toBe('BUY');
    expect(gauge.tally).toEqual({ buy: 2, sell: 1, neutral: 1 });
  });

  it('keeps label and score sign consistent for every gauge it builds', () => {
    for (let buys = 0; buys <= 12; buys++) {
      for (let sells = 0; sells <= 12; sells++) {
        const details: VoteDetail[] = [
          ...Array.from({ length: buys }, (_, i) => detail(`b${i}`, 'BUY')),
          ...Array.from({ length: sells }, (_, i) => detail(`s${i}`, 'SELL')),
        ];
        const gauge = buildGauge(details, {}, DEFAULT_COMPASS_CONFIG);
        if (gauge.score > 0) expect(isBearishLabel(gauge.label)).toBe(false);
        if (gauge.score < 0) expect(isBullishLabel(gauge.label)).toBe(false);
        if (gauge.score === 0) expect(gauge.label).toBe('NEUTRAL');
      }
    }
  });
});

describe('buildSummaryGauge', () => {
  function gauge(score: number): GaugeReading {
    return {
      score,
      label: labelFromScore(score, DEFAULT_COMPASS_CONFIG),
      tally: { buy: 0, neutral: 0, sell: 0 },
      details: [],
    };
  }

  it('blends the two component scores by weight', () => {
    const summary = buildSummaryGauge(gauge(100), gauge(0), DEFAULT_COMPASS_CONFIG);
    expect(summary.score).toBe(50);
    expect(summary.label).toBe('BUY');
  });

  it('adds the two tallies together', () => {
    const ma = { ...gauge(50), tally: { buy: 3, neutral: 1, sell: 2 } };
    const ind = { ...gauge(-50), tally: { buy: 1, neutral: 4, sell: 5 } };
    const summary = buildSummaryGauge(ma, ind, DEFAULT_COMPASS_CONFIG);
    expect(summary.tally).toEqual({ buy: 4, neutral: 5, sell: 7 });
  });

  it('respects an asymmetric blend', () => {
    const config = mergeCompassConfig(DEFAULT_COMPASS_CONFIG, {
      gaugeBlend: { movingAverages: 3, indicators: 1 },
    });
    // (100*3 + 0*1) / 4 = 75
    expect(buildSummaryGauge(gauge(100), gauge(0), config).score).toBe(75);
  });
});

describe('computeConfluence', () => {
  const readings = [
    { timeframe: '5m', score: 80, available: true },
    { timeframe: '15m', score: 60, available: true },
    { timeframe: '1h', score: 40, available: true },
    { timeframe: '4h', score: -20, available: true },
  ];

  it('reports a positive bias when most timeframes agree', () => {
    const result = computeConfluence(readings, DEFAULT_COMPASS_CONFIG);
    expect(result.bias).toBeGreaterThan(0);
    expect(isBullishLabel(result.label)).toBe(true);
    expect(result.direction).toBe('BULLISH');
    expect(result.available).toBe(4);
    expect(result.directional).toBe(4);
  });

  it('weights timeframes by the config table', () => {
    // Only the heavily-weighted 4h is bearish, but it must not flip a strong
    // intraday bullish majority on its own.
    const heavyBear = computeConfluence(
      [
        { timeframe: '5m', score: 90, available: true },
        { timeframe: '15m', score: 90, available: true },
        { timeframe: '1h', score: 90, available: true },
        { timeframe: '4h', score: -90, available: true },
      ],
      DEFAULT_COMPASS_CONFIG
    );
    expect(heavyBear.bias).toBeGreaterThan(0);
  });

  it('reports a negative bias when most timeframes disagree', () => {
    const result = computeConfluence(
      [
        { timeframe: '15m', score: -80, available: true },
        { timeframe: '1h', score: -60, available: true },
        { timeframe: '4h', score: -40, available: true },
      ],
      DEFAULT_COMPASS_CONFIG
    );
    expect(result.bias).toBeLessThan(0);
    expect(result.direction).toBe('BEARISH');
  });

  it('reports no direction when timeframes cancel', () => {
    // Equal weights on both sides, so the weighted bias cancels exactly.
    const config = mergeCompassConfig(DEFAULT_COMPASS_CONFIG, {
      timeframeWeights: { '1m': 0, '5m': 0, '15m': 1, '30m': 0, '1h': 1, '4h': 0, '1D': 0, '1W': 0 },
    });
    const result = computeConfluence(
      [
        { timeframe: '15m', score: 50, available: true },
        { timeframe: '1h', score: -50, available: true },
      ],
      config
    );
    expect(result.bias).toBe(0);
    expect(result.direction).toBeNull();
    expect(result.agreement).toBe(50);
  });

  it('reflects the configured weights when the sides are unequal', () => {
    // 15m (weight 1.0) bullish, 1h (weight 1.6) bearish -> bias is negative.
    const result = computeConfluence(
      [
        { timeframe: '15m', score: 50, available: true },
        { timeframe: '1h', score: -50, available: true },
      ],
      DEFAULT_COMPASS_CONFIG
    );
    // (50 * 1.0 + -50 * 1.6) / (1.0 + 1.6) = -11.538...
    expect(result.bias).toBeCloseTo(-11.538, 3);
    expect(result.direction).toBe('BEARISH');
  });

  it('skips unavailable timeframes', () => {
    const result = computeConfluence(
      [
        { timeframe: '5m', score: 100, available: false },
        { timeframe: '1h', score: 50, available: true },
      ],
      DEFAULT_COMPASS_CONFIG
    );
    expect(result.available).toBe(1);
    expect(result.bias).toBe(50);
  });

  it('is neutral when nothing is available', () => {
    const result = computeConfluence([{ timeframe: '5m', score: 0, available: false }], DEFAULT_COMPASS_CONFIG);
    expect(result.bias).toBe(0);
    expect(result.label).toBe('NEUTRAL');
    expect(result.available).toBe(0);
  });

  it('keeps the bias label consistent with the bias sign', () => {
    for (let score = -100; score <= 100; score += 10) {
      const result = computeConfluence([{ timeframe: '1h', score, available: true }], DEFAULT_COMPASS_CONFIG);
      if (result.bias > 0) expect(isBearishLabel(result.label)).toBe(false);
      if (result.bias < 0) expect(isBullishLabel(result.label)).toBe(false);
    }
  });
});

describe('needleAngleFromScore', () => {
  it('maps -100..+100 onto -90..+90 degrees', () => {
    expect(needleAngleFromScore(-100)).toBe(-90);
    expect(needleAngleFromScore(0)).toBe(0);
    expect(needleAngleFromScore(100)).toBe(90);
    expect(needleAngleFromScore(50)).toBe(45);
  });

  it('points the same way as the score sign', () => {
    expect(needleAngleFromScore(30)).toBeGreaterThan(0);
    expect(needleAngleFromScore(-30)).toBeLessThan(0);
  });
});

describe('confidenceFromGauge', () => {
  const details = (n: number): VoteDetail[] => Array.from({ length: n }, (_, i) => detail(`d${i}`, 'BUY'));

  it('rises with distance from neutral', () => {
    const weak = confidenceFromGauge({ score: 10, label: 'NEUTRAL', tally: { buy: 1, neutral: 1, sell: 1 }, details: details(12) }, 12);
    const strong = confidenceFromGauge({ score: 90, label: 'STRONG_BUY', tally: { buy: 12, neutral: 0, sell: 0 }, details: details(12) }, 12);
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBe(90);
  });

  it('is 0 at neutral', () => {
    expect(confidenceFromGauge({ score: 0, label: 'NEUTRAL', tally: { buy: 0, neutral: 0, sell: 0 }, details: details(12) }, 12)).toBe(0);
  });

  it('is damped when only part of the block was available', () => {
    const full = confidenceFromGauge({ score: 60, label: 'STRONG_BUY', tally: { buy: 12, neutral: 0, sell: 0 }, details: details(12) }, 12);
    const partial = confidenceFromGauge({ score: 60, label: 'STRONG_BUY', tally: { buy: 6, neutral: 0, sell: 0 }, details: details(6) }, 12);
    expect(partial).toBeLessThan(full);
  });
});
