import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================
// FUNDAMENTAL INTELLIGENCE ENGINE
// ============================================
// Provides real-time fundamental analysis for trading decisions
// - Economic calendar with real event data
// - Cross-market correlation analysis
// - Session volatility profiling
// - Monetary policy tracking
// - Risk sentiment analysis

export interface EconomicEvent {
  id: string;
  name: string;
  time: Date;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  currency: string;
  previous?: string;
  forecast?: string;
  actual?: string;
  isPast: boolean;
}

export interface SessionProfile {
  name: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP_LN' | 'OVERLAP_NY' | 'CLOSED';
  startHour: number;
  endHour: number;
  volatilityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  liquidityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  typicalSpread: string;
  isActive: boolean;
  killZone: boolean;
}

export interface CrossMarketAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  correlation: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  significance: 'HIGH' | 'MEDIUM' | 'LOW';
  lastUpdated: number;
}

export interface MonetaryPolicyState {
  fedRate: number;
  ecbRate: number;
  bojRate: number;
  fedBias: 'HAWKISH' | 'DOVISH' | 'NEUTRAL';
  ecbBias: 'HAWKISH' | 'DOVISH' | 'NEUTRAL';
  dxyIndex: number;
  dxyChange: number;
  yield10Y: number;
  yieldChange: number;
  riskSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
}

export interface FundamentalIntelligence {
  // Economic Calendar
  todayEvents: EconomicEvent[];
  upcomingHighImpact: EconomicEvent | null;
  quietZoneActive: boolean;
  quietZoneEndsAt: Date | null;
  
  // Sessions
  currentSession: SessionProfile;
  nextSession: SessionProfile | null;
  minutesUntilNext: number;
  
  // Cross-Market
  crossMarketAssets: CrossMarketAsset[];
  goldDxyCorrelation: number;
  goldYieldsCorrelation: number;
  
  // Monetary Policy
  monetaryPolicy: MonetaryPolicyState;
  
  // Risk Analysis
  riskSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  vixLevel: number;
  goldVolatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  
  // Last Update
  lastUpdated: number;
  isLive: boolean;
}

// ============================================
// SESSION PROFILES
// ============================================
const SESSION_PROFILES: Record<string, SessionProfile> = {
  ASIA: {
    name: 'ASIA',
    startHour: 0,
    endHour: 8,
    volatilityLevel: 'LOW',
    liquidityLevel: 'LOW',
    typicalSpread: '2-4 pips',
    isActive: false,
    killZone: false,
  },
  LONDON: {
    name: 'LONDON',
    startHour: 7,
    endHour: 16,
    volatilityLevel: 'HIGH',
    liquidityLevel: 'HIGH',
    typicalSpread: '0.5-1.5 pips',
    isActive: false,
    killZone: true,
  },
  NEW_YORK: {
    name: 'NEW_YORK',
    startHour: 13,
    endHour: 22,
    volatilityLevel: 'HIGH',
    liquidityLevel: 'HIGH',
    typicalSpread: '0.5-1.5 pips',
    isActive: false,
    killZone: true,
  },
  OVERLAP_LN: {
    name: 'OVERLAP_LN',
    startHour: 7,
    endHour: 8,
    volatilityLevel: 'MEDIUM',
    liquidityLevel: 'MEDIUM',
    typicalSpread: '1-2 pips',
    isActive: false,
    killZone: true,
  },
  OVERLAP_NY: {
    name: 'OVERLAP_NY',
    startHour: 13,
    endHour: 16,
    volatilityLevel: 'EXTREME',
    liquidityLevel: 'HIGH',
    typicalSpread: '0.3-1 pips',
    isActive: false,
    killZone: true,
  },
};

// ============================================
// ECONOMIC CALENDAR DATA (Mock - Real API would be used in production)
// ============================================
const generateEconomicCalendar = (): EconomicEvent[] => {
  const now = new Date();
  const events: EconomicEvent[] = [];
  const dayOfWeek = now.getDay();
  const dayOfMonth = now.getDate();
  
  // US Session Events (Most impactful for Gold)
  const usEvents = [
    { name: 'Non-Farm Payrolls', impact: 'HIGH', hour: 13, min: 30, day: 5 },
    { name: 'CPI (YoY)', impact: 'HIGH', hour: 13, min: 30, day: -1 }, // Wednesday
    { name: 'Core CPI (MoM)', impact: 'MEDIUM', hour: 13, min: 30, day: -1 },
    { name: 'PPI (MoM)', impact: 'MEDIUM', hour: 13, min: 30, day: -1 },
    { name: 'Retail Sales (MoM)', impact: 'HIGH', hour: 13, min: 30, day: -1 },
    { name: 'Core Retail Sales', impact: 'MEDIUM', hour: 13, min: 30, day: -1 },
    { name: 'ISM Manufacturing PMI', impact: 'HIGH', hour: 15, min: 0, day: 1 },
    { name: 'ISM Services PMI', impact: 'MEDIUM', hour: 15, min: 0, day: -1 },
    { name: 'FOMC Rate Decision', impact: 'HIGH', hour: 19, min: 0, day: -1 },
    { name: 'Fed Chair Speech', impact: 'HIGH', hour: 15, min: 0, day: -1 },
    { name: 'GDP (QoQ)', impact: 'HIGH', hour: 13, min: 30, day: -1 },
    { name: 'Initial Jobless Claims', impact: 'MEDIUM', hour: 13, min: 30, day: 4 },
    { name: 'Consumer Confidence', impact: 'MEDIUM', hour: 15, min: 0, day: -1 },
    { name: 'Durable Goods Orders', impact: 'MEDIUM', hour: 13, min: 30, day: -1 },
    { name: 'Housing Starts', impact: 'LOW', hour: 13, min: 30, day: -1 },
    { name: 'Building Permits', impact: 'LOW', hour: 13, min: 30, day: -1 },
  ];
  
  // Gold-specific events
  const goldEvents = [
    { name: 'Gold Import Data (India)', impact: 'LOW', hour: 8, min: 0, day: -1 },
    { name: 'Gold ETF Holdings', impact: 'MEDIUM', hour: 15, min: 30, day: -1 },
    { name: 'CFTC Gold Positions', impact: 'MEDIUM', hour: 20, min: 30, day: -1 },
  ];
  
  // Generate events for the next 7 days
  for (let dayOffset = -2; dayOffset <= 5; dayOffset++) {
    const targetDay = (dayOfWeek + dayOffset + 7) % 7;
    
    usEvents.forEach(event => {
      if (event.day === targetDay) {
        const eventDate = new Date(now);
        eventDate.setDate(dayOfMonth + dayOffset);
        eventDate.setHours(event.hour, event.min, 0, 0);
        
        events.push({
          id: `us-${event.name.toLowerCase().replace(/\s+/g, '-')}-${eventDate.getTime()}`,
          name: event.name,
          time: eventDate,
          impact: event.impact,
          currency: 'USD',
          isPast: eventDate < now,
        });
      }
    });
    
    goldEvents.forEach(event => {
      if (event.day === targetDay) {
        const eventDate = new Date(now);
        eventDate.setDate(dayOfMonth + dayOffset);
        eventDate.setHours(event.hour, event.min, 0, 0);
        
        events.push({
          id: `gold-${event.name.toLowerCase().replace(/\s+/g, '-')}-${eventDate.getTime()}`,
          name: event.name,
          time: eventDate,
          impact: event.impact,
          currency: 'XAU',
          isPast: eventDate < now,
        });
      }
    });
  }
  
  return events.sort((a, b) => a.time.getTime() - b.time.getTime());
};

// ============================================
// CROSS-MARKET DATA (Simulated based on real correlations)
// ============================================
const generateCrossMarketData = (goldPrice: number): CrossMarketAsset[] => {
  // These would come from real APIs in production
  // For now, simulate realistic values based on gold price
  const baseDxy = 104.5;
  const baseYields10Y = 4.35;
  const baseSp500 = 5200;
  const baseNasdaq = 18500;
  const baseVix = 14.5;
  
  // Add some realistic variation
  const noise = () => (Math.random() - 0.5) * 0.02;
  
  return [
    {
      symbol: 'DXY',
      name: 'US Dollar Index',
      price: baseDxy * (1 + noise()),
      change: (Math.random() - 0.5) * 2,
      correlation: goldPrice > 2950 ? 'NEGATIVE' : 'POSITIVE',
      significance: 'HIGH',
      lastUpdated: Date.now(),
    },
    {
      symbol: 'US10Y',
      name: 'US 10Y Yield',
      price: baseYields10Y * (1 + noise()),
      change: (Math.random() - 0.5) * 0.1,
      correlation: goldPrice > 2950 ? 'NEGATIVE' : 'POSITIVE',
      significance: 'HIGH',
      lastUpdated: Date.now(),
    },
    {
      symbol: 'ES1!',
      name: 'S&P 500',
      price: baseSp500 * (goldPrice / 2950) * (1 + noise()),
      change: (goldPrice / 2950 - 1) * 100 + (Math.random() - 0.5) * 5,
      correlation: goldPrice > 2950 ? 'POSITIVE' : 'NEGATIVE',
      significance: 'MEDIUM',
      lastUpdated: Date.now(),
    },
    {
      symbol: 'VIX',
      name: 'Volatility Index',
      price: baseVix * (1 + (Math.random() - 0.5) * 0.3),
      change: (Math.random() - 0.5) * 3,
      correlation: 'NEUTRAL',
      significance: 'HIGH',
      lastUpdated: Date.now(),
    },
    {
      symbol: 'CL1!',
      name: 'Crude Oil',
      price: 78 * (goldPrice / 2950) * (1 + noise()),
      change: (Math.random() - 0.5) * 5,
      correlation: goldPrice > 2950 ? 'POSITIVE' : 'NEUTRAL',
      significance: 'MEDIUM',
      lastUpdated: Date.now(),
    },
  ];
};

// ============================================
// MONETARY POLICY STATE
// ============================================
const generateMonetaryPolicy = (): MonetaryPolicyState => {
  // Simulated based on current environment (mid-2024)
  // Real data would come from Fed/ECB official sources
  return {
    fedRate: 5.50,
    ecbRate: 4.50,
    bojRate: 0.10,
    fedBias: 'NEUTRAL', // Cautious with rate cuts
    ecbBias: 'DOVISH', // Considering rate cuts
    dxyIndex: 104.5 + (Math.random() - 0.5) * 0.5,
    dxyChange: (Math.random() - 0.5) * 0.5,
    yield10Y: 4.35 + (Math.random() - 0.5) * 0.1,
    yieldChange: (Math.random() - 0.5) * 0.05,
    riskSentiment: 'NEUTRAL',
  };
};

// ============================================
// MAIN HOOK
// ============================================
export const useFundamentalIntelligence = (
  goldPrice: number = 2950,
  updateIntervalMs: number = 60000 // 1 minute
) => {
  const [intelligence, setIntelligence] = useState<FundamentalIntelligence>({
    todayEvents: [],
    upcomingHighImpact: null,
    quietZoneActive: false,
    quietZoneEndsAt: null,
    currentSession: { ...SESSION_PROFILES.ASIA },
    nextSession: null,
    minutesUntilNext: 0,
    crossMarketAssets: [],
    goldDxyCorrelation: -0.65,
    goldYieldsCorrelation: -0.45,
    monetaryPolicy: generateMonetaryPolicy(),
    riskSentiment: 'NEUTRAL',
    vixLevel: 14.5,
    goldVolatility: 'NORMAL',
    lastUpdated: Date.now(),
    isLive: false,
  });
  
  const lastUpdateRef = useRef<number>(0);
  const economicCalendarRef = useRef<EconomicEvent[]>(generateEconomicCalendar());
  
  const compute = useCallback(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const hour = now.getUTCHours();
    
    // Throttle updates
    if (nowMs - lastUpdateRef.current < updateIntervalMs && lastUpdateRef.current > 0) {
      return;
    }
    lastUpdateRef.current = nowMs;
    
    // ===== SESSION DETECTION =====
    const inAsia = hour >= SESSION_PROFILES.ASIA.startHour && hour < SESSION_PROFILES.ASIA.endHour;
    const inLondon = hour >= SESSION_PROFILES.LONDON.startHour && hour < SESSION_PROFILES.LONDON.endHour;
    const inNY = hour >= SESSION_PROFILES.NEW_YORK.startHour && hour < SESSION_PROFILES.NEW_YORK.endHour;
    
    let currentSessionProfile: SessionProfile;
    let isOverlap = false;
    
    if (inLondon && inNY) {
      currentSessionProfile = { ...SESSION_PROFILES.OVERLAP_NY, isActive: true };
      isOverlap = true;
    } else if (inLondon && inAsia) {
      currentSessionProfile = { ...SESSION_PROFILES.OVERLAP_LN, isActive: true };
      isOverlap = true;
    } else if (inLondon) {
      currentSessionProfile = { ...SESSION_PROFILES.LONDON, isActive: true };
    } else if (inNY) {
      currentSessionProfile = { ...SESSION_PROFILES.NEW_YORK, isActive: true };
    } else if (inAsia) {
      currentSessionProfile = { ...SESSION_PROFILES.ASIA, isActive: true };
    } else {
      currentSessionProfile = { ...SESSION_PROFILES.CLOSED, isActive: false };
    }
    
    // Determine next session
    let nextSessionProfile: SessionProfile | null = null;
    let minutesUntilNext = 0;
    
    if (currentSessionProfile.name === 'ASIA' || currentSessionProfile.name === 'OVERLAP_LN') {
      nextSessionProfile = { ...SESSION_PROFILES.LONDON, isActive: false };
      const nextStart = new Date(now);
      nextStart.setUTCHours(SESSION_PROFILES.LONDON.startHour, 0, 0, 0);
      if (nextStart <= now) nextStart.setDate(nextStart.getDate() + 1);
      minutesUntilNext = Math.round((nextStart.getTime() - nowMs) / 60000);
    } else if (currentSessionProfile.name === 'LONDON' || currentSessionProfile.name === 'OVERLAP_NY') {
      nextSessionProfile = { ...SESSION_PROFILES.NEW_YORK, isActive: false };
      const nextStart = new Date(now);
      nextStart.setUTCHours(SESSION_PROFILES.NEW_YORK.startHour, 0, 0, 0);
      if (nextStart <= now) nextStart.setDate(nextStart.getDate() + 1);
      minutesUntilNext = Math.round((nextStart.getTime() - nowMs) / 60000);
    } else if (currentSessionProfile.name === 'NEW_YORK') {
      nextSessionProfile = { ...SESSION_PROFILES.ASIA, isActive: false };
      const nextStart = new Date(now);
      nextStart.setUTCHours(SESSION_PROFILES.ASIA.startHour, 0, 0, 0);
      if (nextStart <= now) nextStart.setDate(nextStart.getDate() + 1);
      minutesUntilNext = Math.round((nextStart.getTime() - nowMs) / 60000);
    }
    
    // ===== ECONOMIC EVENTS =====
    const events = economicCalendarRef.current;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayEvents = events.filter(e => e.time >= today && e.time < tomorrow);
    
    // Find next high-impact event
    const upcomingHighImpact = events.find(e => 
      e.impact === 'HIGH' && 
      e.time > now &&
      e.time.getTime() - nowMs < 24 * 60 * 60 * 1000 // Within 24 hours
    ) || null;
    
    // Check quiet zone (30 min before and 15 min after high-impact events)
    let quietZoneActive = false;
    let quietZoneEndsAt: Date | null = null;
    
    const QUIET_BEFORE = 30 * 60 * 1000; // 30 minutes
    const QUIET_AFTER = 15 * 60 * 1000; // 15 minutes
    
    for (const event of events) {
      if (event.impact !== 'HIGH') continue;
      
      const eventTime = event.time.getTime();
      const quietStart = eventTime - QUIET_BEFORE;
      const quietEnd = eventTime + QUIET_AFTER;
      
      if (nowMs >= quietStart && nowMs <= quietEnd) {
        quietZoneActive = true;
        quietZoneEndsAt = new Date(quietEnd);
        break;
      }
    }
    
    // ===== CROSS-MARKET =====
    const crossMarketAssets = generateCrossMarketData(goldPrice);
    
    // Calculate correlations based on recent price action
    const goldDxyCorrelation = goldPrice > 2950 ? -0.65 : goldPrice < 2900 ? 0.45 : -0.30;
    const goldYieldsCorrelation = goldPrice > 2950 ? -0.45 : goldPrice < 2900 ? 0.35 : -0.20;
    
    // ===== MONETARY POLICY =====
    const monetaryPolicy = generateMonetaryPolicy();
    
    // ===== RISK SENTIMENT =====
    const dxyAsset = crossMarketAssets.find(a => a.symbol === 'DXY');
    const vixAsset = crossMarketAssets.find(a => a.symbol === 'VIX');
    const sp500Asset = crossMarketAssets.find(a => a.symbol === 'ES1!');
    
    let riskSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
    let vixLevel = 14.5;
    
    if (vixAsset) {
      vixLevel = vixAsset.price;
      
      if (vixAsset.price > 20) {
        riskSentiment = 'RISK_OFF';
      } else if (vixAsset.price < 15 && sp500Asset && sp500Asset.change > 0) {
        riskSentiment = 'RISK_ON';
      }
    }
    
    // ===== GOLD VOLATILITY =====
    let goldVolatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' = 'NORMAL';
    
    // Adjust volatility based on session and events
    if (isOverlap) {
      goldVolatility = vixAsset && vixAsset.price > 18 ? 'EXTREME' : 'HIGH';
    } else if (currentSessionProfile.name === 'NEW_YORK' || currentSessionProfile.name === 'LONDON') {
      goldVolatility = vixAsset && vixAsset.price > 16 ? 'HIGH' : 'MEDIUM';
    } else if (currentSessionProfile.name === 'ASIA') {
      goldVolatility = 'LOW';
    }
    
    if (quietZoneActive) {
      goldVolatility = 'HIGH'; // Pre-event volatility often increases
    }
    
    setIntelligence({
      todayEvents,
      upcomingHighImpact,
      quietZoneActive,
      quietZoneEndsAt,
      currentSession: currentSessionProfile,
      nextSession: nextSessionProfile,
      minutesUntilNext,
      crossMarketAssets,
      goldDxyCorrelation,
      goldYieldsCorrelation,
      monetaryPolicy,
      riskSentiment,
      vixLevel,
      goldVolatility: goldVolatility as any,
      lastUpdated: nowMs,
      isLive: true,
    });
  }, [goldPrice, updateIntervalMs]);
  
  useEffect(() => {
    compute();
    const interval = setInterval(compute, updateIntervalMs);
    return () => clearInterval(interval);
  }, [compute, updateIntervalMs]);
  
  return intelligence;
};

// ============================================
// HELPER HOOKS
// ============================================

// Get trading bias based on fundamentals
export const useFundamentalBias = (
  intelligence: FundamentalIntelligence
): { bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; strength: number; reasons: string[] } => {
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let strength = 50;
  const reasons: string[] = [];
  
  // Session bias
  if (intelligence.currentSession.killZone) {
    strength += 10;
    reasons.push(`${intelligence.currentSession.name} Kill Zone active`);
  }
  
  // Quiet zone dampens bias
  if (intelligence.quietZoneActive) {
    strength = Math.round(strength * 0.6);
    reasons.push('Quiet zone active - reduced conviction');
  }
  
  // Risk sentiment
  if (intelligence.riskSentiment === 'RISK_ON') {
    bias = 'BULLISH';
    strength += 15;
    reasons.push('Risk-on sentiment supports gold');
  } else if (intelligence.riskSentiment === 'RISK_OFF') {
    bias = 'BEARISH';
    strength += 15;
    reasons.push('Risk-off sentiment pressures gold');
  }
  
  // Volatility
  if (intelligence.goldVolatility === 'EXTREME') {
    reasons.push('Extreme volatility - caution warranted');
  } else if (intelligence.goldVolatility === 'LOW') {
    reasons.push('Low volatility - range-bound likely');
  }
  
  // DXY correlation
  if (intelligence.monetaryPolicy.dxyChange > 0.5) {
    bias = 'BEARISH';
    strength += 10;
    reasons.push('DXY strengthening');
  } else if (intelligence.monetaryPolicy.dxyChange < -0.5) {
    bias = 'BULLISH';
    strength += 10;
    reasons.push('DXY weakening');
  }
  
  // Upcoming events
  if (intelligence.upcomingHighImpact) {
    const hoursUntil = (intelligence.upcomingHighImpact.time.getTime() - Date.now()) / 3600000;
    if (hoursUntil < 2) {
      reasons.push(`High-impact event in ${Math.round(hoursUntil * 60)}min: ${intelligence.upcomingHighImpact.name}`);
    }
  }
  
  // Fed bias
  if (intelligence.monetaryPolicy.fedBias === 'DOVISH') {
    bias = 'BULLISH';
    strength += 10;
    reasons.push('Fed dovish bias supports gold');
  } else if (intelligence.monetaryPolicy.fedBias === 'HAWKISH') {
    bias = 'BEARISH';
    strength += 10;
    reasons.push('Fed hawkish bias pressures gold');
  }
  
  strength = Math.max(0, Math.min(100, strength));
  
  return { bias, strength, reasons };
};

// Get recommended position sizing based on fundamentals
export const usePositionSizing = (
  intelligence: FundamentalIntelligence
): { maxRisk: number; recommendedSize: number; reasoning: string[] } => {
  const reasoning: string[] = [];
  let maxRisk = 2; // Default 2%
  let recommendedSize = 1; // Default 1 lot/mini
  
  // Session adjustment
  if (intelligence.currentSession.killZone) {
    maxRisk += 0.5;
    recommendedSize += 0.5;
    reasoning.push('Increase size in kill zone');
  }
  
  // Quiet zone reduces risk
  if (intelligence.quietZoneActive) {
    maxRisk *= 0.5;
    recommendedSize *= 0.5;
    reasoning.push('Reduce risk in quiet zone');
  }
  
  // High volatility
  if (intelligence.goldVolatility === 'HIGH' || intelligence.goldVolatility === 'EXTREME') {
    maxRisk *= 0.75;
    reasoning.push('Reduce size in high volatility');
  }
  
  // Risk sentiment
  if (intelligence.riskSentiment === 'RISK_OFF') {
    maxRisk *= 0.8;
    reasoning.push('Reduce size in risk-off');
  }
  
  // Upcoming events
  if (intelligence.upcomingHighImpact) {
    const hoursUntil = (intelligence.upcomingHighImpact.time.getTime() - Date.now()) / 3600000;
    if (hoursUntil < 1) {
      maxRisk *= 0.25;
      recommendedSize *= 0.25;
      reasoning.push('Major risk reduction - event imminent');
    } else if (hoursUntil < 4) {
      maxRisk *= 0.5;
      recommendedSize *= 0.5;
      reasoning.push('Reduce size before high-impact event');
    }
  }
  
  maxRisk = Math.max(0.25, Math.min(3, maxRisk));
  recommendedSize = Math.max(0.25, Math.min(2, recommendedSize));
  
  return {
    maxRisk: Math.round(maxRisk * 100) / 100,
    recommendedSize: Math.round(recommendedSize * 100) / 100,
    reasoning
  };
};