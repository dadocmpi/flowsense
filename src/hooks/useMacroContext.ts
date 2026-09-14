import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MacroContext,
  MacroBias,
  SessionInfo,
  EconomicEvent,
  TradingSession,
  InterMarketRegime,
  SignalEngineConfig,
  DEFAULT_SIGNAL_CONFIG,
} from '../types/signalEngine';

// ============================================
// MACRO CONTEXT
// ============================================
// Slow-updating layer. Updates every few minutes, not per-tick.
// Inputs:
//   - Active trading session (Asia/London/NY)
//   - Economic calendar (high-impact events)
//   - Inter-market correlation (DXY, yields, risk regime)
//   - HTF trend bias (D1/H4)

// Approximate session times in UTC
const SESSION_HOURS_UTC = {
  ASIA: { start: 0, end: 8 },        // 00:00 - 08:00 UTC
  LONDON: { start: 7, end: 16 },     // 07:00 - 16:00 UTC
  NEW_YORK: { start: 13, end: 22 },  // 13:00 - 22:00 UTC
};

function getCurrentSession(now: Date): SessionInfo {
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;

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

  // Next session
  let next: TradingSession | null = null;
  let minutesUntilNext = 0;

  if (current === 'ASIA' || current === 'OVERLAP_LN') {
    next = 'LONDON';
  } else if (current === 'LONDON' || current === 'OVERLAP_NY') {
    next = 'NEW_YORK';
  } else if (current === 'NEW_YORK') {
    next = 'ASIA'; // next day
  } else {
    next = 'ASIA';
  }

  return {
    current,
    next,
    minutesUntilNext: minutesUntilNext,
    isOverlap,
  };
}

// Mock economic calendar (in real deployment, fetch from API)
// Returns upcoming high-impact events in the next 24h
function getUpcomingEvents(now: Date): EconomicEvent[] {
  // Stub: in production, integrate with ForexFactory / Investing.com / FMP
  // For now, generate a few realistic-looking events based on weekday

  const events: EconomicEvent[] = [];
  const day = now.getUTCDay();
  const hour = now.getUTCHours();

  // CPI — typically Tuesday/Wednesday 13:30 UTC
  if ((day === 2 || day === 3) && hour < 14) {
    events.push({
      id: 'cpi',
      name: 'US CPI (YoY)',
      time: new Date(now).setUTCHours(13, 30, 0, 0),
      impact: 'HIGH',
      currency: 'USD',
    });
  }

  // NFP — first Friday of month, 13:30 UTC
  if (day === 5 && now.getUTCDate() <= 7 && hour < 14) {
    events.push({
      id: 'nfp',
      name: 'US Non-Farm Payrolls',
      time: new Date(now).setUTCHours(13, 30, 0, 0),
      impact: 'HIGH',
      currency: 'USD',
    });
  }

  // FOMC — 19:00 UTC on scheduled days
  if (hour < 19 && (day === 3 && now.getUTCDate() <= 7)) {
    events.push({
      id: 'fomc',
      name: 'FOMC Rate Decision',
      time: new Date(now).setUTCHours(19, 0, 0, 0),
      impact: 'HIGH',
      currency: 'USD',
    });
  }

  return events;
}

function scoreToBias(score: number): MacroBias {
  if (score >= 60) return 'STRONG_BULLISH';
  if (score >= 20) return 'BULLISH';
  if (score <= -60) return 'STRONG_BEARISH';
  if (score <= -20) return 'BEARISH';
  return 'NEUTRAL';
}

export const useMacroContext = (
  currentPrice: number,
  ema200: number | null,
  config: SignalEngineConfig = DEFAULT_SIGNAL_CONFIG
) => {
  const [macro, setMacro] = useState<MacroContext | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const compute = useCallback(() => {
    const now = new Date();
    const nowMs = now.getTime();

    // Throttle: only recompute every macroUpdateIntervalMs
    if (nowMs - lastUpdateRef.current < config.macroUpdateIntervalMs && lastUpdateRef.current > 0) {
      return;
    }
    lastUpdateRef.current = nowMs;

    // ---- Session ----
    const session = getCurrentSession(now);

    // ---- HTF bias from price vs EMA200 ----
    let htfTrendBias: MacroBias = 'NEUTRAL';
    let macroScore = 0;
    if (ema200 && currentPrice > 0) {
      const diff = (currentPrice - ema200) / ema200; // percent
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

    // ---- Session weight adjustment ----
    // London + NY overlaps are the most decisive for XAU/USD
    if (session.current === 'OVERLAP_NY') {
      macroScore *= 1.3;
    } else if (session.current === 'OVERLAP_LN') {
      macroScore *= 1.15;
    } else if (session.current === 'ASIA') {
      macroScore *= 0.7; // Asia is quieter for gold
    } else if (session.current === 'CLOSED') {
      macroScore *= 0.5;
    }

    // ---- Economic events + quiet zone ----
    const upcomingHighImpact = getUpcomingEvents(now);
    let quietZoneActive = false;
    let quietZoneEndsAt: number | null = null;

    for (const event of upcomingHighImpact) {
      const beforeMs = (config.quietZoneBeforeEventMin || 30) * 60 * 1000;
      const afterMs = (config.quietZoneAfterEventMin || 15) * 60 * 1000;
      const quietStart = event.time - beforeMs;
      const quietEnd = event.time + afterMs;

      if (nowMs >= quietStart && nowMs <= quietEnd) {
        quietZoneActive = true;
        quietZoneEndsAt = quietEnd;
        // Dampen macro score during quiet zone
        macroScore *= 0.4;
        break;
      }
    }

    // Clamp
    macroScore = Math.max(-100, Math.min(100, macroScore));

    // Stub: inter-market context would come from real DXY/yields feeds
    // For now, infer from HTF direction
    const dxyTrend: 'UP' | 'DOWN' | 'FLAT' =
      htfTrendBias.includes('BULLISH') ? 'DOWN' :  // gold up = DXY down
      htfTrendBias.includes('BEARISH') ? 'UP' :
      'FLAT';
    const yieldsTrend: 'UP' | 'DOWN' | 'FLAT' = dxyTrend;
    const riskRegime: InterMarketRegime =
      Math.abs(macroScore) < 15 ? 'NEUTRAL' :
      macroScore > 0 ? 'RISK_ON' : 'RISK_OFF';

    setMacro({
      bias: scoreToBias(macroScore),
      score: Math.round(macroScore),
      session,
      dxyTrend,
      yieldsTrend,
      riskRegime,
      htfTrendBias,
      upcomingHighImpact,
      quietZoneActive,
      quietZoneEndsAt,
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