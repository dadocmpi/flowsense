import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Candle } from '../lib/indicators';
import { ema } from '../lib/indicators';
import { MacroContext, MacroBias, TradingSession, SessionInfo, SignalEngineConfig, DEFAULT_SIGNAL_CONFIG } from '../types/signalEngine';

// ============================================
// MACRO / HIGHER-TIMEFRAME CONTEXT
// ============================================
// Slow-updating layer. The HTF bias is computed from the real candle series
// (price vs EMA200). Inter-market inputs (DXY, yields) are NOT available on
// the current data plan, so they are reported as FLAT rather than invented.

const SESSION_HOURS_UTC: Record<string, { start: number; end: number }> = {
  ASIA: { start: 0, end: 8 },
  LONDON: { start: 7, end: 16 },
  NEW_YORK: { start: 13, end: 22 },
};

function getCurrentSession(now: Date): SessionInfo {
  const hour = now.getUTCHours();

  const inAsia = hour >= SESSION_HOURS_UTC.ASIA.start && hour < SESSION_HOURS_UTC.ASIA.end;
  const inLondon = hour >= SESSION_HOURS_UTC.LONDON.start && hour < SESSION_HOURS_UTC.LONDON.end;
  const inNY = hour >= SESSION_HOURS_UTC.NEW_YORK.start && hour < SESSION_HOURS_UTC.NEW_YORK.end;

  let current: TradingSession = 'CLOSED';
  let isOverlap = false;

  if (inLondon && inNY) {
    current = 'OVERLAP_NY';
    isOverlap = true;
  } else if (inLondon && inAsia) {
    current = 'OVERLAP_LN';
    isOverlap = true;
  } else if (inLondon) {
    current = 'LONDON';
  } else if (inNY) {
    current = 'NEW_YORK';
  } else if (inAsia) {
    current = 'ASIA';
  }

  let next: TradingSession | null = null;
  if (current === 'ASIA' || current === 'OVERLAP_LN') next = 'LONDON';
  else if (current === 'LONDON' || current === 'OVERLAP_NY') next = 'NEW_YORK';
  else if (current === 'NEW_YORK') next = 'ASIA';
  else next = 'ASIA';

  // Minutes until the next session opens, computed from the real clock.
  // This used to be a hardcoded 0, which read as "a session starts now"
  // no matter the actual time.
  let minutesUntilNext = 0;
  if (next) {
    const startHour = SESSION_HOURS_UTC[next].start;
    let delta = startHour - hour;
    if (delta <= 0) delta += 24;
    const minutesIntoHour = now.getUTCMinutes();
    minutesUntilNext = delta * 60 - minutesIntoHour;
  }

  return { current, next, minutesUntilNext, isOverlap };
}

function scoreToBias(score: number): MacroBias {
  if (score >= 60) return 'STRONG_BULLISH';
  if (score >= 20) return 'BULLISH';
  if (score <= -60) return 'STRONG_BEARISH';
  if (score <= -20) return 'BEARISH';
  return 'NEUTRAL';
}

export const useMacroContext = (
  candles: Candle[],
  config: SignalEngineConfig = DEFAULT_SIGNAL_CONFIG
): MacroContext | null => {
  const [macro, setMacro] = useState<MacroContext | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const ema200 = useMemo(() => {
    const closes = candles.map(c => c.close);
    return closes.length >= 200 ? ema(closes, 200) : null;
  }, [candles]);

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

  const compute = useCallback(() => {
    if (!currentPrice || currentPrice <= 0) {
      setMacro(null);
      return;
    }

    const now = new Date();
    const nowMs = now.getTime();

    if (nowMs - lastUpdateRef.current < config.macroUpdateIntervalMs && lastUpdateRef.current > 0) {
      return;
    }
    lastUpdateRef.current = nowMs;

    const session = getCurrentSession(now);

    let htfTrendBias: MacroBias = 'NEUTRAL';
    let macroScore = 0;

    if (ema200 && currentPrice > 0) {
      const diff = (currentPrice - ema200) / ema200;
      if (diff > 0.005) {
        htfTrendBias = 'STRONG_BULLISH';
        macroScore += 50;
      } else if (diff > 0.001) {
        htfTrendBias = 'BULLISH';
        macroScore += 25;
      } else if (diff < -0.005) {
        htfTrendBias = 'STRONG_BEARISH';
        macroScore -= 50;
      } else if (diff < -0.001) {
        htfTrendBias = 'BEARISH';
        macroScore -= 25;
      }
    }

    // Session weighting — London/NY overlaps are the most decisive.
    if (session.current === 'OVERLAP_NY') macroScore *= 1.3;
    else if (session.current === 'OVERLAP_LN') macroScore *= 1.15;
    else if (session.current === 'ASIA') macroScore *= 0.7;
    else if (session.current === 'CLOSED') macroScore *= 0.5;

    macroScore = Math.max(-100, Math.min(100, macroScore));

    const riskRegime: MacroContext['riskRegime'] =
      Math.abs(macroScore) < 15 ? 'NEUTRAL' : macroScore > 0 ? 'RISK_ON' : 'RISK_OFF';

    setMacro({
      bias: scoreToBias(macroScore),
      score: Math.round(macroScore),
      session,
      // No DXY / yields feed is configured on this plan.
      dxyTrend: 'FLAT',
      yieldsTrend: 'FLAT',
      riskRegime,
      htfTrendBias,
      upcomingHighImpact: [],
      quietZoneActive: false,
      quietZoneEndsAt: null,
      lastUpdated: nowMs,
    });
  }, [currentPrice, ema200, config]);

  useEffect(() => {
    compute();
    const interval = setInterval(compute, config.macroUpdateIntervalMs);
    return () => clearInterval(interval);
  }, [compute, config.macroUpdateIntervalMs]);

  return macro;
};
