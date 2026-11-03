// ============================================
// COMPASS SMOOTHING — EMA + hysteresis
// ============================================
// A raw gauge score is recomputed from candles that are still forming, so it
// jitters tick to tick. The needle would twitch on every flush, and worse, the
// label could flicker across a threshold. Two dampers fix that:
//
//   * an EMA pulls the score toward the new value instead of jumping to it, so
//     the needle glides (the CSS transition on the needle does the rest);
//   * a hysteresis deadband holds the last displayed score until the smoothed
//     score moves far enough to matter, so the label cannot flap around a cut-off.
//
// The label is still derived from the DISPLAYED score through the one
// labelFromScore function, so a smoothed score can never disagree with its own
// label. Pure: same inputs, same output.

import type { GaugeReading } from './types';
import { labelFromScore } from './scoring';
import type { CompassConfig } from '../config/compass';

/** The carried state between frames, per gauge. */
export interface SmoothingState {
  /** The EMA value, or null before the first frame. */
  ema: number | null;
  /** The score actually rendered last frame, after hysteresis. */
  displayed: number | null;
}

export const INITIAL_SMOOTHING_STATE: SmoothingState = { ema: null, displayed: null };

/** One EMA step. With no previous value the EMA seeds at the target. */
export function emaStep(previous: number | null, target: number, alpha: number): number {
  if (previous === null || !Number.isFinite(previous)) return target;
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return previous + clampedAlpha * (target - previous);
}

export interface SmoothedGauge {
  gauge: GaugeReading;
  state: SmoothingState;
}

/**
 * Smooth a gauge reading, returning the reading to render and the state to
 * carry into the next frame.
 *
 * The score is EMA-smoothed, then passed through a hysteresis deadband: the
 * displayed score only follows the smoothed score once it has moved more than
 * `hysteresisPoints` from the last displayed value. The label is recomputed from
 * the displayed score, so the needle, the label and the verdict stay consistent.
 */
export function smoothGauge(
  reading: GaugeReading,
  previous: SmoothingState | null,
  config: CompassConfig
): SmoothedGauge {
  const { alpha, hysteresisPoints } = config.smoothing;
  const prior = previous ?? INITIAL_SMOOTHING_STATE;

  const ema = emaStep(prior.ema, reading.score, alpha);

  let displayed: number;
  if (prior.displayed === null) {
    displayed = ema;
  } else {
    const moved = Math.abs(ema - prior.displayed);
    displayed = moved < hysteresisPoints ? prior.displayed : ema;
  }

  return {
    gauge: {
      ...reading,
      score: displayed,
      label: labelFromScore(displayed, config),
    },
    state: { ema, displayed },
  };
}
