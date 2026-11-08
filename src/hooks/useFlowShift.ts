// ============================================
// FLOW SHIFT ALERT
// ============================================
// Watches the dominance side and raises a "Flow turning to buyers / sellers"
// alert only when the new side has HELD for the configured time — a one-tick
// flip is noise, not a turn. The state lives in a ref so the alert is announced
// once per turn and never on every render.
//
// The hold time and the thresholds come from src/config/compass.ts (flow), so
// the alert can never disagree with the bar it sits above.

import { useEffect, useRef, useState } from 'react';
import { advanceShift, INITIAL_SHIFT_STATE, type FlowState } from '../core/orderflow';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';

export function useFlowShift(state: FlowState | null, holdMs: number = DEFAULT_COMPASS_CONFIG.flow.shiftHoldMs): string | null {
  const ref = useRef(INITIAL_SHIFT_STATE);
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    if (state === null) {
      ref.current = INITIAL_SHIFT_STATE;
      setAlert(null);
      return;
    }
    const decision = advanceShift(ref.current, state, Date.now(), holdMs);
    ref.current = decision.state;
    if (decision.alert) {
      setAlert(decision.alert === 'BUYERS' ? 'Flow turning to buyers' : 'Flow turning to sellers');
    }
    // The alert clears when the tape returns to balance.
    if (state === 'BALANCED') setAlert(null);
  }, [state, holdMs]);

  return alert;
}
