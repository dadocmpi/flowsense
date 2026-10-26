// ============================================
// TECHNICAL METRICS PANEL
// ============================================

import type { Candle, TechnicalMetrics } from './types';
import { atr, pointOfControl, volumeProfile, vwap } from './indicators';
import { candlesInCurrentSession, sessionStartMs } from './session';
import { parseCandleTime } from './candles';
import type { SessionConfig } from '../config/compass';

/**
 * ATR(14), session VWAP, session high/low and the volume point of control.
 *
 * VWAP, the session range and the POC are measured over the candles of the
 * CURRENT session only, so they reset at the session open (see session.ts).
 * ATR is a rolling reading and is deliberately not session-bound.
 */
export function computeTechnicalMetrics(candles: Candle[], session: SessionConfig): TechnicalMetrics {
  const empty: TechnicalMetrics = {
    atr: null,
    vwap: null,
    sessionHigh: null,
    sessionLow: null,
    pointOfControl: null,
    pointOfControlVolume: null,
    sessionCandles: 0,
    sessionStart: null,
  };
  if (candles.length === 0) return empty;

  const measured = candlesInCurrentSession(candles, session);
  const window = measured.length > 0 ? measured : candles;

  const profile = volumeProfile(window, 40);
  const poc = pointOfControl(profile);

  const lastMs = parseCandleTime(candles[candles.length - 1].datetime);
  const sessionStart = Number.isFinite(lastMs) ? sessionStartMs(lastMs, session) : null;

  return {
    atr: atr(candles, 14),
    vwap: vwap(window),
    sessionHigh: Math.max(...window.map(c => c.high)),
    sessionLow: Math.min(...window.map(c => c.low)),
    pointOfControl: poc ? poc.price : null,
    pointOfControlVolume: poc ? poc.volume : null,
    sessionCandles: window.length,
    sessionStart,
  };
}
