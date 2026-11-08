// ============================================
// USE SMOOTHED GAUGE — EMA + hysteresis over a live gauge
// ============================================
// Applies the compass smoothing to a gauge reading that is recomputed as new
// candles arrive. The smoothing state is held in a ref, so it survives
// re-renders and only the DISPLAYED reading is committed to React state.
//
// When the incoming reading is unavailable (not enough candles), it is passed
// through untouched and the state is reset, so the next real reading seeds the
// EMA fresh instead of gliding away from a reading that no longer exists.

import { useEffect, useRef, useState } from 'react';
import type { GaugeReading } from '../core/types';
import { INITIAL_SMOOTHING_STATE, smoothGauge, type SmoothingState } from '../core/compassSmoothing';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';

/**
 * @param resetKey When this changes (e.g. the user switched tabs), the smoothing
 *   state is discarded and the next reading seeds fresh, so one view's history
 *   never drags the needle of another.
 */
export function useSmoothedGauge(
  reading: GaugeReading | null,
  available: boolean,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG,
  resetKey: string = 'default'
): GaugeReading | null {
  const stateRef = useRef<SmoothingState>(INITIAL_SMOOTHING_STATE);
  const resetRef = useRef(resetKey);
  const [displayed, setDisplayed] = useState<GaugeReading | null>(reading);

  useEffect(() => {
    if (resetRef.current !== resetKey) {
      resetRef.current = resetKey;
      stateRef.current = INITIAL_SMOOTHING_STATE;
    }

    if (!reading || !available) {
      stateRef.current = INITIAL_SMOOTHING_STATE;
      setDisplayed(reading);
      return;
    }
    const { gauge, state } = smoothGauge(reading, stateRef.current, config);
    stateRef.current = state;
    setDisplayed(gauge);
  }, [reading, available, config, resetKey]);

  return displayed;
}
