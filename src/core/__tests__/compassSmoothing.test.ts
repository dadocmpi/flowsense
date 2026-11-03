// ============================================
// COMPASS SMOOTHING TESTS
// ============================================
// The needle must glide and the label must not flicker, but the label must
// still be the one derived from the displayed score. These tests pin both.

import { describe, expect, it } from 'vitest';
import { emaStep, INITIAL_SMOOTHING_STATE, smoothGauge } from '../compassSmoothing';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';
import type { GaugeReading } from '../types';

function gauge(score: number): GaugeReading {
  return { score, label: 'NEUTRAL', tally: { buy: 0, neutral: 0, sell: 0 }, details: [] };
}

const config = DEFAULT_COMPASS_CONFIG;

describe('emaStep', () => {
  it('seeds at the target when there is no previous value', () => {
    expect(emaStep(null, 42, 0.25)).toBe(42);
  });

  it('moves a fraction of the distance toward the target', () => {
    expect(emaStep(0, 100, 0.25)).toBe(25);
    expect(emaStep(50, 100, 0.5)).toBe(75);
  });
});

describe('smoothGauge', () => {
  it('seeds the displayed score at the first reading', () => {
    const { gauge: out, state } = smoothGauge(gauge(80), INITIAL_SMOOTHING_STATE, config);
    expect(out.score).toBe(80);
    expect(state.displayed).toBe(80);
  });

  it('does not jump straight to a new score', () => {
    const first = smoothGauge(gauge(0), INITIAL_SMOOTHING_STATE, config);
    const second = smoothGauge(gauge(100), first.state, config);
    // EMA(alpha=0.25) from 0 toward 100 lands on 25, not 100.
    expect(second.gauge.score).toBeCloseTo(25);
  });

  it('holds the displayed score until the smoothed score clears the deadband', () => {
    const first = smoothGauge(gauge(50), INITIAL_SMOOTHING_STATE, config);
    // A tiny move (EMA step of 0.25 * 2 = 0.5) is inside the 4-point deadband.
    const second = smoothGauge(gauge(52), first.state, config);
    expect(second.gauge.score).toBe(50);
    expect(second.state.displayed).toBe(50);
  });

  it('follows once the smoothed score moves beyond the deadband', () => {
    const first = smoothGauge(gauge(50), INITIAL_SMOOTHING_STATE, config);
    // EMA step of 0.25 * 40 = 10 points, beyond the 4-point deadband.
    const second = smoothGauge(gauge(90), first.state, config);
    expect(second.gauge.score).toBeGreaterThan(50);
    expect(second.gauge.score).toBeCloseTo(60);
  });

  it('keeps the label consistent with the displayed score', () => {
    // Smoothing a strong-buy reading from neutral must not leave the label at
    // Strong Buy while the needle sits near neutral.
    const first = smoothGauge(gauge(0), INITIAL_SMOOTHING_STATE, config);
    const second = smoothGauge(gauge(100), first.state, config);
    expect(second.gauge.label).toBe('BUY');
  });
});
