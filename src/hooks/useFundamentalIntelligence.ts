import { useState, useEffect, useRef, useMemo } from 'react';
import type { Candle } from '../lib/indicators';
import { atr } from '../lib/indicators';

// ============================================
// SESSION & VOLATILITY CONTEXT
// ============================================
// Everything here is derived from the clock and from real candle data.
// Cross-market feeds (DXY, VIX, yields) and the economic calendar are NOT
// part of the current scope, so they are reported as unavailable instead of
// being simulated.

export interface SessionProfile {
  name: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP_LN' | 'OVERLAP_NY' | 'CLOSED';
  startHour: number;
  endHour: number;
  volatilityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  isActive: boolean;
  killZone: boolean;
}

export interface FundamentalContext {
  currentSession: SessionProfile;
  nextSession: SessionProfile | null;
  minutesUntilNext: number;

  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  atrPercent: number | null;

  // No calendar source is configured, so quiet zones are never asserted.
  quietZoneActive: boolean;

  // Cross-market context is unavailable on this data plan.
  crossMarketAvailable: boolean;

  lastUpdated: number;
}

const SESSION_PROFILES: Record<string, SessionProfile> = {
  ASIA: { name: 'ASIA', startHour: 0, endHour: 8, volatilityLevel: 'LOW', isActive: false, killZone: false },
  LONDON: { name: 'LONDON', startHour: 7, endHour: 16, volatilityLevel: 'HIGH', isActive: false, killZone: true },
  NEW_YORK: { name: 'NEW_YORK', startHour: 13, endHour: 22, volatilityLevel: 'HIGH', isActive: false, killZone: true },
  OVERLAP_LN: { name: 'OVERLAP_LN', startHour: 7, endHour: 8, volatilityLevel: 'MEDIUM', isActive: false, killZone: true },
  OVERLAP_NY: { name: 'OVERLAP_NY', startHour: 13, endHour: 16, volatilityLevel: 'EXTREME', isActive: false, killZone: true },
  CLOSED: { name: 'CLOSED', startHour: 0, endHour: 0, volatilityLevel: 'LOW', isActive: false, killZone: false },
};

function resolveSession(now: Date): SessionProfile {
  const hour = now.getUTCHours();

  const inAsia = hour >= SESSION_PROFILES.ASIA.startHour && hour < SESSION_PROFILES.ASIA.endHour;
  const inLondon = hour >= SESSION_PROFILES.LONDON.startHour && hour < SESSION_PROFILES.LONDON.endHour;
  const inNY = hour >= SESSION_PROFILES.NEW_YORK.startHour && hour < SESSION_PROFILES.NEW_YORK.endHour;

  if (inLondon && inNY) return { ...SESSION_PROFILES.OVERLAP_NY, isActive: true };
  if (inLondon && inAsia) return { ...SESSION_PROFILES.OVERLAP_LN, isActive: true };
  if (inLondon) return { ...SESSION_PROFILES.LONDON, isActive: true };
  if (inNY) return { ...SESSION_PROFILES.NEW_YORK, isActive: true };
  if (inAsia) return { ...SESSION_PROFILES.ASIA, isActive: true };
  return { ...SESSION_PROFILES.CLOSED, isActive: false };
}

function resolveNextSession(current: SessionProfile, now: Date): { next: SessionProfile | null; minutesUntilNext: number } {
  const order: SessionProfile['name'][] = ['ASIA', 'LONDON', 'NEW_YORK'];

  const currentIndex = order.indexOf(current.name);
  const nextName = currentIndex === -1 ? 'ASIA' : order[(currentIndex + 1) % order.length];
  const next = SESSION_PROFILES[nextName];
  if (!next) return { next: null, minutesUntilNext: 0 };

  const nextStart = new Date(now);
  nextStart.setUTCHours(next.startHour, 0, 0, 0);
  if (nextStart.getTime() <= now.getTime()) nextStart.setUTCDate(nextStart.getUTCDate() + 1);

  return { next, minutesUntilNext: Math.round((nextStart.getTime() - now.getTime()) / 60_000) };
}

function resolveVolatilityRegime(atrPercent: number | null): FundamentalContext['volatilityRegime'] {
  if (atrPercent === null) return 'NORMAL';
  if (atrPercent >= 1.5) return 'EXTREME';
  if (atrPercent >= 0.8) return 'HIGH';
  if (atrPercent <= 0.15) return 'LOW';
  return 'NORMAL';
}

/**
 * Session and volatility context. The volatility regime comes from the real
 * ATR of the candle series; session windows come from the clock.
 */
export const useFundamentalIntelligence = (
  candles: Candle[],
  price: number,
  updateIntervalMs = 60_000
): FundamentalContext => {
  const [context, setContext] = useState<FundamentalContext>(() => {
    const now = new Date();
    const session = resolveSession(now);
    const { next, minutesUntilNext } = resolveNextSession(session, now);
    return {
      currentSession: session,
      nextSession: next,
      minutesUntilNext,
      volatilityRegime: 'NORMAL',
      atrPercent: null,
      quietZoneActive: false,
      crossMarketAvailable: false,
      lastUpdated: now.getTime(),
    };
  });

  const lastUpdateRef = useRef(0);

  const atrPercent = useMemo(() => {
    if (candles.length < 20 || price <= 0) return null;
    const atrValue = atr(candles, 14);
    if (atrValue === null) return null;
    return (atrValue / price) * 100;
  }, [candles, price]);

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const nowMs = now.getTime();
      if (nowMs - lastUpdateRef.current < updateIntervalMs && lastUpdateRef.current > 0) return;
      lastUpdateRef.current = nowMs;

      const session = resolveSession(now);
      const { next, minutesUntilNext } = resolveNextSession(session, now);

      setContext({
        currentSession: session,
        nextSession: next,
        minutesUntilNext,
        volatilityRegime: resolveVolatilityRegime(atrPercent),
        atrPercent,
        quietZoneActive: false,
        crossMarketAvailable: false,
        lastUpdated: nowMs,
      });
    };

    compute();
    const interval = setInterval(compute, updateIntervalMs);
    return () => clearInterval(interval);
  }, [atrPercent, updateIntervalMs]);

  return context;
};
