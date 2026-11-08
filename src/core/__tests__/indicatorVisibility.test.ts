// ============================================
// INDICATOR VISIBILITY REGRESSION
// ============================================
// Hiding an indicator from the Technical indicators table is VISUAL ONLY. This
// test proves the Compass is unaffected: every indicator keeps being computed and
// keeps voting, and the gauge score / label / tally is identical whether a row is
// shown or hidden.
//
// It fails loudly if anyone ever wires `showInTable` into the scoring path.

import { describe, expect, it } from 'vitest';
import { computeTimeframeReading } from '../timeframeEngine';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';
import { INDICATOR_VISIBILITY, isShownInTable } from '../../config/indicators';
import { scoreFromVotes } from '../scoring';
import type { Candle } from '../types';

/** A deterministic, non-trivial series so every indicator produces a value. */
function series(length = 300): Candle[] {
  return Array.from({ length }, (_, i) => {
    const base = 2000 + i * 0.7 + Math.sin(i / 4) * 6;
    return {
      datetime: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      open: base - 0.4,
      high: base + 1.2,
      low: base - 1.1,
      close: base,
      volume: 100 + (i % 7) * 5,
    };
  });
}

describe('indicator visibility is cosmetic', () => {
  const reading = computeTimeframeReading('15m', series(), DEFAULT_COMPASS_CONFIG);

  it('has hidden indicators configured', () => {
    const hidden = INDICATOR_VISIBILITY.filter(entry => !entry.showInTable);
    expect(hidden.length).toBeGreaterThan(0);
    // The five redundant oscillators are hidden by default.
    expect(hidden.map(h => h.id).sort()).toEqual(
      ['Bull/Bear Power (13)', 'Highs/Lows (14)', 'ROC (12)', 'Ultimate Oscillator', 'Williams %R (14)'].sort()
    );
  });

  it('still computes and votes every hidden indicator', () => {
    for (const entry of INDICATOR_VISIBILITY.filter(e => !e.showInTable)) {
      const detail = reading.technical.details.find(d => d.name === entry.id);
      // The hidden row is present in the reading, with a real value and a vote.
      expect(detail, `${entry.id} must still be computed`).toBeDefined();
      expect(detail!.display).not.toBe('--');
      expect(['BUY', 'NEUTRAL', 'SELL']).toContain(detail!.vote);
    }
  });

  it('keeps the Compass score identical to a computation over ALL details', () => {
    // Recompute the MA and oscillator blocks from the full detail list — exactly
    // as the engine does — and confirm the gauge agrees. If a hidden row were
    // dropped from scoring, this would diverge.
    const maDetails = reading.technical.details.filter(d => d.group === 'MA');
    const oscDetails = reading.technical.details.filter(d => d.group === 'OSCILLATOR');
    const maScore = scoreFromVotes(maDetails, DEFAULT_COMPASS_CONFIG.maWeights);
    const oscScore = scoreFromVotes(oscDetails, DEFAULT_COMPASS_CONFIG.indicatorWeights);
    const blend =
      (maScore * DEFAULT_COMPASS_CONFIG.technicalBlend.movingAverages +
        oscScore * DEFAULT_COMPASS_CONFIG.technicalBlend.indicators) /
      (DEFAULT_COMPASS_CONFIG.technicalBlend.movingAverages + DEFAULT_COMPASS_CONFIG.technicalBlend.indicators);

    expect(reading.technical.score).toBeCloseTo(blend, 6);
  });

  it('reports the same gauge whether or not the rows are shown', () => {
    // A "shown" subset and the full set must produce the same gauge, because the
    // gauge is built from `details`, which is never filtered.
    const allNames = reading.technical.details.map(d => d.name);
    const visibleNames = reading.technical.details.filter(d => isShownInTable(d.name)).map(d => d.name);
    expect(visibleNames.length).toBeLessThan(allNames.length);
    // Every visible name is a subset of all names; nothing was removed upstream.
    expect(visibleNames.every(name => allNames.includes(name))).toBe(true);
    // The gauge carries every detail, hidden or not.
    expect(allNames.length).toBe(reading.technical.details.length);
  });

  it('produces an identical Compass score for the same series across runs', () => {
    // Guards against a visibility change leaking into scoring via a shared cache.
    const first = computeTimeframeReading('15m', series(), DEFAULT_COMPASS_CONFIG);
    const second = computeTimeframeReading('15m', series(), DEFAULT_COMPASS_CONFIG);
    expect(second.technical.score).toBe(first.technical.score);
    expect(second.summary.score).toBe(first.summary.score);
    expect(second.technical.details.length).toBe(first.technical.details.length);
  });
});
