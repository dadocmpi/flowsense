import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MarketContextDecision,
  MarketState,
  MarketStructureData,
  InstitutionalZone,
  ZoneCluster,
  ConfluenceResult,
  DataQualityScore,
  DataQualityMetrics,
  SignalFactor,
  ManualDailyZone,
  PersistenceWindow,
  StateTransition,
  MarketContextConfig,
  DEFAULT_CONTEXT_CONFIG,
  ZoneConfluence,
  ZoneType,
  ZoneStrength,
  MarketStructure,
  SignalAction,
  DEFAULT_WEIGHT_TIERS,
} from '../types/marketContext';
import { 
  TwelveDataState,
  OrderBookLevel,
  TradeFeedItem,
} from '../types/trading';

// ============================================
// MARKET CONTEXT ENGINE — RIGOROUS CONTEXTUAL ENGINE
// ============================================
//
// Decision flow (strict order):
//   1. DATA QUALITY ASSESSMENT
//   2. STRUCTURE (HTF / MTF / LTF)
//   3. ZONE DETECTION (FVG, OB, POC, SWING, LIQUIDITY)
//   4. ZONE CLUSTERING + PROXIMITY RANKING
//   5. BUILD SIGNAL FACTORS (with correlation collapse)
//   6. CALCULATE CONFLUENCE (with zone-weight minimum rule)
//   7. GATE 0 (EMA200) — HARD VETO
//   8. PERSISTENCE WINDOWS — confirmation + invalidation
//   9. STATE MACHINE
//  10. REACTION QUALITY FILTER — distinguish touch vs reaction
//

interface EngineState {
  decision: MarketContextDecision | null;
  manualZone: ManualDailyZone | null;
  activeZones: InstitutionalZone[];
  zoneClusters: ZoneCluster[];
  state: MarketState;
  persistenceWindows: Map<string, PersistenceWindow>;
  stateHistory: StateTransition[];
  lastPrice: number;
  priceHistory: number[];
  volumeHistory: number[];
  ema200Value: number | null;
  ema50Value: number | null;
  ema20Value: number | null;
  dataQuality: DataQualityScore;
  isInitialized: boolean;
  // Persistence tracking
  stateConsecutiveTicks: Map<MarketState, number>;
  directionConsecutiveTicks: Map<SignalAction, number>;
  zoneEntryTicks: number;
  lastZoneEntryPrice: number | null;
  zoneEntryConfirmed: boolean;
  lastPriceUpdateTime: number;
}

const initialState: EngineState = {
  decision: null,
  manualZone: null,
  activeZones: [],
  zoneClusters: [],
  state: 'WAITING',
  persistenceWindows: new Map(),
  stateHistory: [],
  lastPrice: 0,
  priceHistory: [],
  volumeHistory: [],
  ema200Value: null,
  ema50Value: null,
  ema20Value: null,
  dataQuality: {
    overall: 100,
    orderBookWeight: 20,
    tapeWeight: 15,
    volumeWeight: 15,
    tradesWeight: 10,
    indicatorsWeight: 40,
    metrics: {
      orderBookComplete: true,
      tapeAvailable: true,
      volumeAvailable: true,
      tradesAvailable: true,
      indicatorsValid: true,
      websocketConnected: true,
      lastUpdateTime: Date.now(),
      latencyMs: 0,
      freshness: 'LIVE',
    },
  },
  isInitialized: false,
  stateConsecutiveTicks: new Map(),
  directionConsecutiveTicks: new Map(),
  zoneEntryTicks: 0,
  lastZoneEntryPrice: null,
  zoneEntryConfirmed: false,
  lastPriceUpdateTime: 0,
};

export const useMarketContextEngine = (
  marketData: TwelveDataState,
  config: MarketContextConfig = DEFAULT_CONTEXT_CONFIG
) => {
  const [engineState, setEngineState] = useState<EngineState>(initialState);
  
  // Refs for real-time calculations
  const priceHistoryRef = useRef<number[]>([]);
  const volumeHistoryRef = useRef<number[]>([]);
  const ohlcRef = useRef<{ open: number; high: number; low: number; close: number }[]>([]);
  const lastStateChangeRef = useRef<number>(Date.now());
  const consecutiveTicksRef = useRef<Map<string, number>>(new Map());

  // ---- Load Manual Zone from localStorage ----
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(`tradingConfig_MGC1!`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const manualZone: ManualDailyZone = {
          id: `manual-${today}`,
          date: today,
          direction: parsed.direction === 'SELL' ? 'SELL' : 'BUY',
          zoneMin: parsed.minPrice || 0,
          zoneMax: parsed.maxPrice || 0,
          zoneName: `Daily Zone ${today}`,
          stopLoss: parsed.stopLoss || 0,
          takeProfit: parsed.takeProfit || 0,
          startTime: parsed.startTime || '09:00',
          endTime: parsed.endTime || '17:00',
          notes: '',
          createdAt: Date.now(),
          ema200Aligned: false,
          ema200Conflict: false,
        };
        
        setEngineState(prev => ({ ...prev, manualZone }));
      } catch (e) {
        console.error('Failed to load manual zone:', e);
      }
    }
  }, []);

  // ============================================
  // STEP 1: DATA QUALITY ASSESSMENT
  // ============================================
  const assessDataQuality = useCallback((data: TwelveDataState): DataQualityScore => {
    const metrics: DataQualityMetrics = {
      orderBookComplete: data.bids.length >= 3 && data.asks.length >= 3 && 
                         data.bids.every(b => b.size > 0) && data.asks.every(a => a.size > 0),
      tapeAvailable: data.recentTrades.length > 0,
      volumeAvailable: data.volumeDelta !== undefined && data.volumeDelta !== null,
      tradesAvailable: data.recentTrades.length > 0,
      indicatorsValid: data.oscillators.length >= 2 && data.movingAverages.length >= 3,
      websocketConnected: data.isLive,
      lastUpdateTime: Date.now(),
      latencyMs: 0,
      freshness: data.isLive ? 'LIVE' : 'DELAYED',
    };

    let overall = 100;
    
    // CRITICAL: missing order book is severe
    if (!metrics.orderBookComplete) overall -= 20;
    if (!metrics.tapeAvailable) overall -= 15;
    if (!metrics.volumeAvailable) overall -= 10;
    if (!metrics.tradesAvailable) overall -= 10;
    if (!metrics.indicatorsValid) overall -= 15;
    if (!metrics.websocketConnected) overall -= 25;
    
    // Bonus for full data
    if (metrics.orderBookComplete && metrics.tapeAvailable && 
        metrics.volumeAvailable && metrics.indicatorsValid) {
      overall = Math.min(100, overall + 5);
    }

    return {
      overall: Math.max(0, overall),
      orderBookWeight: metrics.orderBookComplete ? 20 : 0,
      tapeWeight: metrics.tapeAvailable ? 15 : 0,
      volumeWeight: metrics.volumeAvailable ? 15 : 0,
      tradesWeight: metrics.tradesAvailable ? 10 : 0,
      indicatorsWeight: metrics.indicatorsValid ? 40 : 0,
      metrics,
    };
  }, []);

  // ============================================
  // STEP 2: EMA CALCULATION (proper seed)
  // ============================================
  const calculateEMA = useCallback((prices: number[], period: number): number | null => {
    if (prices.length < period) return null;
    
    const k = 2 / (period + 1);
    // Seed with SMA
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    
    return ema;
  }, []);

  // ============================================
  // STEP 3: GATE 0 — EMA200 MASTER TREND GATE (HARD VETO)
  // ============================================
  const evaluateGate0 = useCallback((
    price: number, 
    ema200: number | null, 
    manualZone: ManualDailyZone | null
  ): { passed: boolean; trend: MarketStructure; blocks: SignalAction | null; conflicts: string[] } => {
    const conflicts: string[] = [];
    
    if (!config.ema200Enabled || ema200 === null) {
      return { passed: true, trend: 'NEUTRAL', blocks: null, conflicts };
    }
    
    const trend: MarketStructure = price > ema200 ? 'BULLISH' : price < ema200 ? 'BEARISH' : 'NEUTRAL';
    
    // Gate 0 doesn't block by default, it constrains direction
    // But manual zone direction MUST match trend
    if (manualZone && manualZone.zoneMin > 0 && manualZone.zoneMax > 0) {
      if (manualZone.direction === 'BUY' && trend === 'BEARISH') {
        conflicts.push('Manual zone direction (BUY) conflicts with EMA200 trend (BEARISH)');
      }
      if (manualZone.direction === 'SELL' && trend === 'BULLISH') {
        conflicts.push('Manual zone direction (SELL) conflicts with EMA200 trend (BULLISH)');
      }
    }
    
    // Determine what the gate blocks
    let blocks: SignalAction | null = null;
    if (trend === 'BULLISH') blocks = 'SELL';
    else if (trend === 'BEARISH') blocks = 'BUY';
    
    return { passed: true, trend, blocks, conflicts };
  }, [config.ema200Enabled]);

  // ============================================
  // STEP 4: MARKET STRUCTURE ANALYSIS (HTF/MTF/LTF)
  // ============================================
  const analyzeMarketStructure = useCallback((
    price: number,
    priceHistory: number[],
    ema200: number | null,
    ema50: number | null,
    ema20: number | null
  ): MarketStructureData => {
    if (priceHistory.length < 20) {
      return {
        trend: 'NEUTRAL',
        structureState: 'NEUTRAL',
        htfTrend: 'NEUTRAL',
        mtfTrend: 'NEUTRAL',
        ltfTrend: 'NEUTRAL',
        lastSwingHigh: null,
        lastSwingLow: null,
        bosConfirmed: false,
        bosDirection: null,
      };
    }
    
    // Multi-timeframe trend using different lookback periods
    // HTF: full history (macro)
    // MTF: 50 candles (intermediate)
    // LTF: 10 candles (execution)
    const htfTrend: MarketStructure = ema200 !== null
      ? (price > ema200 ? 'BULLISH' : 'BEARISH')
      : 'NEUTRAL';
    
    const mtfTrend: MarketStructure = ema50 !== null
      ? (price > ema50 ? 'BULLISH' : 'BEARISH')
      : 'NEUTRAL';
    
    const ltfTrend: MarketStructure = ema20 !== null
      ? (price > ema20 ? 'BULLISH' : 'BEARISH')
      : 'NEUTRAL';
    
    // Overall trend: HTF dominates, MTF confirms, LTF supplements
    let overallTrend: MarketStructure = 'NEUTRAL';
    if (htfTrend === mtfTrend && htfTrend !== 'NEUTRAL') {
      overallTrend = htfTrend;
    } else if (htfTrend !== 'NEUTRAL') {
      overallTrend = htfTrend; // HTF wins on conflict
    } else if (mtfTrend !== 'NEUTRAL') {
      overallTrend = mtfTrend;
    }
    
    // Find swing highs and lows (proper swing detection)
    const lookback = Math.min(50, priceHistory.length);
    const recentPrices = priceHistory.slice(-lookback);
    const swingHighs: { price: number; idx: number }[] = [];
    const swingLows: { price: number; idx: number }[] = [];
    
    const swingWindow = 3; // 3 candles each side
    for (let i = swingWindow; i < recentPrices.length - swingWindow; i++) {
      // Swing high
      let isHigh = true;
      for (let j = 1; j <= swingWindow; j++) {
        if (recentPrices[i] <= recentPrices[i - j] || recentPrices[i] <= recentPrices[i + j]) {
          isHigh = false;
          break;
        }
      }
      if (isHigh) swingHighs.push({ price: recentPrices[i], idx: i });
      
      // Swing low
      let isLow = true;
      for (let j = 1; j <= swingWindow; j++) {
        if (recentPrices[i] >= recentPrices[i - j] || recentPrices[i] >= recentPrices[i + j]) {
          isLow = false;
          break;
        }
      }
      if (isLow) swingLows.push({ price: recentPrices[i], idx: i });
    }
    
    // Determine structure state
    let structureState: MarketStructureData['structureState'] = 'NEUTRAL';
    let bosDirection: MarketStructureData['bosDirection'] = null;
    let bosConfirmed = false;
    
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const last2Highs = swingHighs.slice(-2);
      const last2Lows = swingLows.slice(-2);
      
      // HH + HL = bullish structure
      if (last2Highs[1].price > last2Highs[0].price && last2Lows[1].price > last2Lows[0].price) {
        structureState = 'HH_HL';
        // BOS Bull: price broke above last swing high
        if (price > last2Highs[1].price) {
          bosDirection = 'BULL';
          bosConfirmed = true;
        }
      }
      // LH + LL = bearish structure
      else if (last2Highs[1].price < last2Highs[0].price && last2Lows[1].price < last2Lows[0].price) {
        structureState = 'LH_LL';
        // BOS Bear: price broke below last swing low
        if (price < last2Lows[1].price) {
          bosDirection = 'BEAR';
          bosConfirmed = true;
        }
      }
      // Choppy
      else if (Math.abs(last2Highs[1].price - last2Highs[0].price) < (price * 0.001) &&
               Math.abs(last2Lows[1].price - last2Lows[0].price) < (price * 0.001)) {
        structureState = 'CHOPCH';
      }
    }
    
    return {
      trend: overallTrend,
      structureState,
      htfTrend,
      mtfTrend,
      ltfTrend,
      lastSwingHigh: swingHighs[swingHighs.length - 1]?.price || null,
      lastSwingLow: swingLows[swingLows.length - 1]?.price || null,
      bosConfirmed,
      bosDirection,
    };
  }, []);

  // ============================================
  // STEP 5: INSTITUTIONAL ZONE DETECTION
  // ============================================
  const detectZones = useCallback((
    price: number,
    priceHistory: number[],
    orderBook: { bids: OrderBookLevel[]; asks: OrderBookLevel[] },
    trades: TradeFeedItem[]
  ): InstitutionalZone[] => {
    const zones: InstitutionalZone[] = [];
    const now = Date.now();

    if (priceHistory.length < 5) return zones;

    // 1. FVG (Fair Value Gap) Detection
    if (priceHistory.length >= 3) {
      for (let i = 2; i < Math.min(priceHistory.length, 30); i++) {
        const prev = priceHistory[priceHistory.length - 1 - i + 2];
        const curr = priceHistory[priceHistory.length - 1 - i];
        const next = priceHistory[priceHistory.length - 1 - i - 1] || curr;
        
        const bullishFVG = prev < next - (next * 0.0005);
        const bearishFVG = prev > next + (next * 0.0005);
        
        if (bullishFVG) {
          const zoneMin = prev;
          const zoneMax = next;
          const midpoint = (zoneMin + zoneMax) / 2;
          
          if (Math.abs(price - midpoint) < config.zoneProximityThreshold * 3) {
            zones.push({
              id: `fvg-bull-${i}`,
              type: 'FVG',
              priceMin: zoneMin,
              priceMax: zoneMax,
              midpoint,
              strength: 'HIGH',
              confluences: [{ type: 'FVG', strength: 'HIGH', timeframe: 'LTF' }],
              source: 'FVG Detection (3-candle)',
              createdAt: now,
              updatedAt: now,
              status: 'ACTIVE',
              timeframe: 'LTF',
              touches: 0,
              absorptionEvents: 0,
              invalidationPrice: zoneMin - (zoneMax - zoneMin) * 0.5,
              volumeAtFormation: null,
              isClustered: false,
              clusterId: null,
            });
          }
        }
        
        if (bearishFVG) {
          const zoneMin = next;
          const zoneMax = prev;
          const midpoint = (zoneMin + zoneMax) / 2;
          
          if (Math.abs(price - midpoint) < config.zoneProximityThreshold * 3) {
            zones.push({
              id: `fvg-bear-${i}`,
              type: 'FVG',
              priceMin: zoneMin,
              priceMax: zoneMax,
              midpoint,
              strength: 'HIGH',
              confluences: [{ type: 'FVG', strength: 'HIGH', timeframe: 'LTF' }],
              source: 'FVG Detection (3-candle)',
              createdAt: now,
              updatedAt: now,
              status: 'ACTIVE',
              timeframe: 'LTF',
              touches: 0,
              absorptionEvents: 0,
              invalidationPrice: zoneMax + (zoneMax - zoneMin) * 0.5,
              volumeAtFormation: null,
              isClustered: false,
              clusterId: null,
            });
          }
        }
      }
    }

    // 2. Order Block Detection
    if (priceHistory.length >= 10) {
      const recent = priceHistory.slice(-10);
      for (let i = 1; i < recent.length - 2; i++) {
        if (recent[i] < recent[i - 1] && recent[i + 1] > recent[i] && recent[i + 2] > recent[i + 1]) {
          const midpoint = (recent[i] + recent[i - 1]) / 2;
          if (Math.abs(price - midpoint) < config.zoneProximityThreshold * 2) {
            zones.push({
              id: `ob-bull-${i}`,
              type: 'ORDER_BLOCK',
              priceMin: recent[i],
              priceMax: recent[i - 1],
              midpoint,
              strength: 'HIGH',
              confluences: [{ type: 'ORDER_BLOCK', strength: 'HIGH', timeframe: 'MTF' }],
              source: 'Order Block Detection',
              createdAt: now,
              updatedAt: now,
              status: 'ACTIVE',
              timeframe: 'MTF',
              touches: 0,
              absorptionEvents: 0,
              invalidationPrice: recent[i] - (recent[i - 1] - recent[i]) * 0.5,
              volumeAtFormation: null,
              isClustered: false,
              clusterId: null,
            });
          }
        }
        
        if (recent[i] > recent[i - 1] && recent[i + 1] < recent[i] && recent[i + 2] < recent[i + 1]) {
          const midpoint = (recent[i] + recent[i - 1]) / 2;
          if (Math.abs(price - midpoint) < config.zoneProximityThreshold * 2) {
            zones.push({
              id: `ob-bear-${i}`,
              type: 'ORDER_BLOCK',
              priceMin: recent[i - 1],
              priceMax: recent[i],
              midpoint,
              strength: 'HIGH',
              confluences: [{ type: 'ORDER_BLOCK', strength: 'HIGH', timeframe: 'MTF' }],
              source: 'Order Block Detection',
              createdAt: now,
              updatedAt: now,
              status: 'ACTIVE',
              timeframe: 'MTF',
              touches: 0,
              absorptionEvents: 0,
              invalidationPrice: recent[i] + (recent[i] - recent[i - 1]) * 0.5,
              volumeAtFormation: null,
              isClustered: false,
              clusterId: null,
            });
          }
        }
      }
    }

    // 3. POC (Point of Control) from order book
    if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      let maxTotal = 0;
      let pocPrice = 0;
      
      [...orderBook.bids, ...orderBook.asks].forEach(level => {
        const total = level.price * level.size;
        if (total > maxTotal) {
          maxTotal = total;
          pocPrice = level.price;
        }
      });
      
      if (pocPrice > 0) {
        const spread = Math.abs(orderBook.asks[0]?.price - orderBook.bids[0]?.price) || (pocPrice * 0.001);
        zones.push({
          id: `poc-${now}`,
          type: 'POC',
          priceMin: pocPrice - spread * 0.5,
          priceMax: pocPrice + spread * 0.5,
          midpoint: pocPrice,
          strength: 'MEDIUM',
          confluences: [{ type: 'POC', strength: 'MEDIUM', timeframe: 'MTF' }],
          source: 'Order Book Liquidity',
          createdAt: now,
          updatedAt: now,
          status: 'ACTIVE',
          timeframe: 'MTF',
          touches: 1,
          absorptionEvents: 0,
          invalidationPrice: pocPrice - spread * 2,
          volumeAtFormation: maxTotal,
          isClustered: false,
          clusterId: null,
        });
      }
    }

    // 4. Swing High/Low zones
    if (priceHistory.length >= 20) {
      const recentPrices = priceHistory.slice(-20);
      const max = Math.max(...recentPrices);
      const min = Math.min(...recentPrices);
      const range = max - min;
      
      if (range > 0) {
        if (Math.abs(price - max) < config.zoneProximityThreshold * 2) {
          zones.push({
            id: `swing-h-${now}`,
            type: 'SWING',
            priceMin: max - range * 0.02,
            priceMax: max + range * 0.01,
            midpoint: max,
            strength: 'MEDIUM',
            confluences: [{ type: 'SWING', strength: 'MEDIUM', timeframe: 'HTF' }],
            source: 'Swing High',
            createdAt: now,
            updatedAt: now,
            status: 'ACTIVE',
            timeframe: 'HTF',
            touches: 0,
            absorptionEvents: 0,
            invalidationPrice: max + range * 0.05,
            volumeAtFormation: null,
            isClustered: false,
            clusterId: null,
          });
        }
        
        if (Math.abs(price - min) < config.zoneProximityThreshold * 2) {
          zones.push({
            id: `swing-l-${now}`,
            type: 'SWING',
            priceMin: min - range * 0.01,
            priceMax: min + range * 0.02,
            midpoint: min,
            strength: 'MEDIUM',
            confluences: [{ type: 'SWING', strength: 'MEDIUM', timeframe: 'HTF' }],
            source: 'Swing Low',
            createdAt: now,
            updatedAt: now,
            status: 'ACTIVE',
            timeframe: 'HTF',
            touches: 0,
            absorptionEvents: 0,
            invalidationPrice: min - range * 0.05,
            volumeAtFormation: null,
            isClustered: false,
            clusterId: null,
          });
        }
      }
    }

    // 5. Liquidity zones
    if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      const allLevels = [...orderBook.bids, ...orderBook.asks];
      const avgSize = allLevels.reduce((sum, l) => sum + l.size, 0) / allLevels.length;
      
      allLevels.forEach((level, idx) => {
        if (level.size > avgSize * 3 && Math.abs(price - level.price) < config.zoneProximityThreshold * 2) {
          zones.push({
            id: `liq-${idx}-${now}`,
            type: 'LIQUIDITY',
            priceMin: level.price - (level.price * 0.0005),
            priceMax: level.price + (level.price * 0.0005),
            midpoint: level.price,
            strength: 'HIGH',
            confluences: [{ type: 'LIQUIDITY', strength: 'HIGH', timeframe: 'LTF' }],
            source: 'Order Book Liquidity Pool',
            createdAt: now,
            updatedAt: now,
            status: 'ACTIVE',
            timeframe: 'LTF',
            touches: 0,
            absorptionEvents: 0,
            invalidationPrice: level.price * 1.01,
            volumeAtFormation: level.size,
            isClustered: false,
            clusterId: null,
          });
        }
      });
    }

    return zones;
  }, [config.zoneProximityThreshold]);

  // ============================================
  // STEP 6: ZONE INVALIDATION CHECK
  // ============================================
  const invalidateZones = useCallback((
    zones: InstitutionalZone[],
    price: number
  ): InstitutionalZone[] => {
    return zones.map(zone => {
      if (zone.invalidationPrice > 0) {
        if (zone.priceMin < zone.priceMax) {
          if (price < zone.invalidationPrice) {
            return { ...zone, status: 'INVALIDATED' as ZoneStatus };
          }
        } else {
          if (price > zone.invalidationPrice) {
            return { ...zone, status: 'INVALIDATED' as ZoneStatus };
          }
        }
      }
      
      if (zone.touches >= 3) {
        return { ...zone, status: 'CONSUMED' as ZoneStatus };
      }
      
      return zone;
    }).filter(z => z.status === 'ACTIVE' || z.status === 'CONSUMED');
  }, []);

  // ============================================
  // STEP 7: ZONE CLUSTERING
  // ============================================
  const clusterZones = useCallback((zones: InstitutionalZone[]): ZoneCluster[] => {
    if (zones.length === 0) return [];
    
    const clusters: ZoneCluster[] = [];
    const used = new Set<string>();
    const clusterThreshold = 15; // points — for XAUUSD
    
    const sorted = [...zones].sort((a, b) => a.midpoint - b.midpoint);
    
    for (const zone of sorted) {
      if (used.has(zone.id)) continue;
      
      const overlapping = zones.filter(z => {
        if (used.has(z.id)) return false;
        const overlap = !(z.priceMax < zone.priceMin - clusterThreshold || 
                         z.priceMin > zone.priceMax + clusterThreshold);
        return overlap;
      });
      
      if (overlapping.length > 0) {
        const allZones = [zone, ...overlapping];
        allZones.forEach(z => used.add(z.id));
        
        const priceMin = Math.min(...allZones.map(z => z.priceMin));
        const priceMax = Math.max(...allZones.map(z => z.priceMax));
        const midpoint = (priceMin + priceMax) / 2;
        
        const allConfluences: ZoneConfluence[] = [];
        allZones.forEach(z => allConfluences.push(...z.confluences));
        
        const totalScore = allConfluences.reduce((sum, c) => {
          return sum + (c.strength === 'VERY_HIGH' ? 25 : 
                       c.strength === 'HIGH' ? 20 : 
                       c.strength === 'MEDIUM' ? 10 : 5);
        }, 0);
        
        clusters.push({
          id: `cluster-${clusters.length}`,
          zones: allZones,
          priceMin,
          priceMax,
          midpoint,
          totalConfluence: allConfluences,
          strength: totalScore >= 60 ? 'VERY_HIGH' : 
                   totalScore >= 40 ? 'HIGH' : 
                   totalScore >= 20 ? 'MEDIUM' : 'LOW',
          distanceFromPrice: 0,
          totalScore,
        });
      } else {
        clusters.push({
          id: `cluster-${clusters.length}`,
          zones: [zone],
          priceMin: zone.priceMin,
          priceMax: zone.priceMax,
          midpoint: zone.midpoint,
          totalConfluence: zone.confluences,
          strength: zone.strength,
          distanceFromPrice: 0,
          totalScore: zone.confluences.reduce((sum, c) => {
            return sum + (c.strength === 'VERY_HIGH' ? 25 : 
                         c.strength === 'HIGH' ? 20 : 
                         c.strength === 'MEDIUM' ? 10 : 5);
          }, 0),
        });
        used.add(zone.id);
      }
    }
    
    return clusters;
  }, []);

  // ============================================
  // STEP 8: CALCULATE ZONE DISTANCES + IDENTIFY PRIMARY
  // ============================================
  const rankZones = useCallback((
    clusters: ZoneCluster[],
    manualZone: ManualDailyZone | null,
    price: number
  ): { clusters: ZoneCluster[]; primary: ZoneCluster | ManualDailyZone | null } => {
    const updatedClusters = clusters.map(cluster => ({
      ...cluster,
      distanceFromPrice: Math.abs(price - cluster.midpoint),
    })).sort((a, b) => a.distanceFromPrice - b.distanceFromPrice);
    
    let primary: ZoneCluster | ManualDailyZone | null = null;
    
    if (manualZone && manualZone.zoneMin > 0 && manualZone.zoneMax > 0) {
      const inManualZone = price >= manualZone.zoneMin && price <= manualZone.zoneMax;
      const distToManual = Math.min(
        Math.abs(price - manualZone.zoneMin),
        Math.abs(price - manualZone.zoneMax),
        Math.abs(price - (manualZone.zoneMin + manualZone.zoneMax) / 2)
      );
      
      const closestCluster = updatedClusters[0];
      const closestClusterDist = closestCluster?.distanceFromPrice || Infinity;
      
      if (inManualZone || distToManual <= closestClusterDist) {
        primary = manualZone;
      } else if (closestCluster) {
        primary = closestCluster;
      }
    } else if (updatedClusters[0]) {
      primary = updatedClusters[0];
    }
    
    return { clusters: updatedClusters, primary };
  }, []);

  // ============================================
  // STEP 9: BUILD SIGNAL FACTORS (with correlation collapse)
  // ============================================
  const buildSignalFactors = useCallback((
    data: TwelveDataState,
    structure: MarketStructureData,
    clusters: ZoneCluster[],
    manualZone: ManualDailyZone | null,
    price: number,
    ema200: number | null,
    ema50: number | null,
    ema20: number | null,
    dataQualityScore: DataQualityScore
  ): SignalFactor[] => {
    const factors: SignalFactor[] = [];
    const now = Date.now();
    
    // ---- ZONE FACTORS ----
    if (manualZone && manualZone.zoneMin > 0 && manualZone.zoneMax > 0) {
      const inZone = price >= manualZone.zoneMin && price <= manualZone.zoneMax;
      const approaching = !inZone && 
        Math.abs(price - (manualZone.zoneMin + manualZone.zoneMax) / 2) < config.zoneProximityThreshold;
      
      factors.push({
        name: 'MANUAL_ZONE',
        value: inZone ? 'IN_ZONE' : approaching ? 'APPROACHING' : 'OUTSIDE',
        action: manualZone.direction,
        weight: config.weights.find(w => w.name === 'MANUAL_ZONE')?.baseWeight || 15,
        isCorrelated: false,
        correlationGroup: 'ZONE_CLUSTER',
        source: 'User-defined daily zone',
        timestamp: now,
      });
    }
    
    if (clusters.length > 0) {
      const nearest = clusters[0];
      const distFromPrice = nearest.distanceFromPrice;
      const inCluster = price >= nearest.priceMin && price <= nearest.priceMax;
      
      const clusterWeight = nearest.strength === 'VERY_HIGH' ? 12 :
                           nearest.strength === 'HIGH' ? 10 :
                           nearest.strength === 'MEDIUM' ? 6 : 3;
      
      factors.push({
        name: 'ZONE_CLUSTER',
        value: inCluster ? `IN_CLUSTER (${nearest.totalConfluence.length} confluences)` : 
               `Near cluster (${distFromPrice.toFixed(1)} pts)`,
        action: 'HOLD',
        weight: clusterWeight,
        isCorrelated: false,
        correlationGroup: 'ZONE_CLUSTER',
        source: 'Institutional Zone Cluster',
        timestamp: now,
      });
    }
    
    // ---- STRUCTURE FACTORS ----
    if (structure.htfTrend !== 'NEUTRAL') {
      factors.push({
        name: 'MARKET_STRUCTURE',
        value: `${structure.htfTrend}/${structure.mtfTrend}/${structure.ltfTrend}`,
        action: structure.trend === 'BULLISH' ? 'BUY' : 
               structure.trend === 'BEARISH' ? 'SELL' : 'HOLD',
        weight: config.weights.find(w => w.name === 'MARKET_STRUCTURE')?.baseWeight || 15,
        isCorrelated: false,
        correlationGroup: 'STRUCTURE',
        source: 'Multi-TF Structure Analysis',
        timestamp: now,
      });
    }
    
    if (structure.bosConfirmed) {
      factors.push({
        name: 'BOS',
        value: structure.bosDirection || 'NEUTRAL',
        action: structure.bosDirection === 'BULL' ? 'BUY' : 
               structure.bosDirection === 'BEAR' ? 'SELL' : 'HOLD',
        weight: config.weights.find(w => w.name === 'BOS')?.baseWeight || 10,
        isCorrelated: true,
        correlationGroup: 'STRUCTURE',
        source: 'BOS Detection',
        timestamp: now,
      });
    }
    
    // ---- ORDER FLOW FACTORS ----
    if (data.buyersPercent > 0 && data.buyersPercent < 100) {
      const flowAction = data.buyersPercent > 60 ? 'BUY' : 
                        data.buyersPercent < 40 ? 'SELL' : 'HOLD';
      
      factors.push({
        name: 'ORDER_FLOW',
        value: `${data.buyersPercent}% buyers / Δ${data.volumeDelta}`,
        action: flowAction,
        weight: config.weights.find(w => w.name === 'DELTA')?.baseWeight || 10,
        isCorrelated: false,
        correlationGroup: 'FLOW',
        source: 'Volume Delta Analysis',
        timestamp: now,
      });
    }
    
    if (data.recentTrades.length > 0) {
      const buyTrades = data.recentTrades.filter(t => t.type === 'BUY').length;
      const sellTrades = data.recentTrades.filter(t => t.type === 'SELL').length;
      const total = buyTrades + sellTrades || 1;
      const buyRatio = buyTrades / total;
      
      factors.push({
        name: 'TAPE',
        value: `${buyTrades} B / ${sellTrades} S`,
        action: buyRatio > 0.6 ? 'BUY' : buyRatio < 0.4 ? 'SELL' : 'HOLD',
        weight: config.weights.find(w => w.name === 'TAPE')?.baseWeight || 8,
        isCorrelated: true,
        correlationGroup: 'FLOW',
        source: 'Trade Tape Analysis',
        timestamp: now,
      });
    }
    
    if (data.institutionalPressure !== 'LOW') {
      factors.push({
        name: 'INST_PRESSURE',
        value: data.institutionalPressure,
        action: data.institutionalPressure === 'HIGH' || data.institutionalPressure === 'EXTREME'
          ? (data.volumeDelta > 0 ? 'BUY' : 'SELL')
          : 'HOLD',
        weight: config.weights.find(w => w.name === 'ABSORPTION')?.baseWeight || 8,
        isCorrelated: true,
        correlationGroup: 'FLOW',
        source: 'Institutional Flow Detection',
        timestamp: now,
      });
    }
    
    // ---- EMA FACTORS (CORRELATION-COLLAPSED) ----
    if (data.movingAverages.length > 0) {
      const emas = data.movingAverages.filter(ma => ma.name.includes('EMA'));
      if (emas.length > 0) {
        const buyCount = emas.filter(e => e.action.includes('BUY')).length;
        const sellCount = emas.filter(e => e.action.includes('SELL')).length;
        const total = emas.length || 1;
        
        let emaAction: SignalAction = 'HOLD';
        if (buyCount > sellCount) emaAction = 'BUY';
        else if (sellCount > buyCount) emaAction = 'SELL';
        
        factors.push({
          name: 'EMA_CLOUD',
          value: `${buyCount}/${total} bullish`,
          action: emaAction,
          weight: config.weights
            .filter(w => w.category === 'EMA')
            .reduce((sum, w) => sum + w.baseWeight, 0) * 0.6,
          isCorrelated: false,
          correlationGroup: 'EMA_CLOUD',
          source: 'EMA Cloud (collapsed)',
          timestamp: now,
        });
      }
    }
    
    // ---- OSCILLATOR FACTORS ----
    if (data.oscillators.length > 0) {
      const oscBuyCount = data.oscillators.filter(o => o.action.includes('BUY')).length;
      const oscSellCount = data.oscillators.filter(o => o.action.includes('SELL')).length;
      const total = data.oscillators.length || 1;
      
      let oscAction: SignalAction = 'HOLD';
      if (oscBuyCount > oscSellCount) oscAction = 'BUY';
      else if (oscSellCount > oscBuyCount) oscAction = 'SELL';
      
      factors.push({
        name: 'OSCILLATORS',
        value: `${oscBuyCount}/${total} bullish`,
        action: oscAction,
        weight: config.weights
          .filter(w => w.category === 'OSCILLATOR')
          .reduce((sum, w) => sum + w.baseWeight, 0),
        isCorrelated: false,
        correlationGroup: null,
        source: 'RSI + MACD + Momentum',
        timestamp: now,
      });
    }
    
    return factors;
  }, [config]);

  // ============================================
  // STEP 10: CONFLUENCE CALCULATION (with zone-weight minimum)
  // ============================================
  const calculateConfluence = useCallback((
    factors: SignalFactor[]
  ): ConfluenceResult => {
    const zoneFactors = factors.filter(f => f.correlationGroup === 'ZONE_CLUSTER');
    const supportingFactors = factors.filter(f => f.correlationGroup !== 'ZONE_CLUSTER');
    
    const processedFactors: SignalFactor[] = [];
    const groupMap = new Map<string, SignalFactor[]>();
    
    factors.forEach(f => {
      if (f.correlationGroup) {
        const existing = groupMap.get(f.correlationGroup) || [];
        existing.push(f);
        groupMap.set(f.correlationGroup, existing);
      } else {
        processedFactors.push(f);
      }
    });
    
    groupMap.forEach((groupFactors, group) => {
      const sorted = [...groupFactors].sort((a, b) => b.weight - a.weight);
      processedFactors.push({ ...sorted[0], name: `${group}_REPRESENTATIVE` });
    });
    
    let zoneWeightScore = 0;
    let supportingScore = 0;
    let buyWeight = 0;
    let sellWeight = 0;
    let neutralWeight = 0;
    
    processedFactors.forEach(f => {
      if (f.correlationGroup === 'ZONE_CLUSTER') {
        zoneWeightScore += f.weight;
      } else {
        supportingScore += f.weight;
      }
      
      if (f.action === 'BUY') buyWeight += f.weight;
      else if (f.action === 'SELL') sellWeight += f.weight;
      else neutralWeight += f.weight;
    });
    
    const totalRawScore = zoneWeightScore + supportingScore;
    
    const maxZoneWeight = config.weights
      .filter(w => w.category === 'ZONE')
      .reduce((sum, w) => sum + w.maxWeight, 0);
    const maxSupportingWeight = config.weights
      .filter(w => w.category !== 'ZONE')
      .reduce((sum, w) => sum + w.maxWeight, 0);
    const maxTotal = maxZoneWeight + maxSupportingWeight;
    
    const normalizedZone = maxZoneWeight > 0 ? (zoneWeightScore / maxZoneWeight) * 100 : 0;
    const normalizedSupporting = maxSupportingWeight > 0 ? (supportingScore / maxSupportingWeight) * 100 : 0;
    const normalizedTotal = maxTotal > 0 ? (totalRawScore / maxTotal) * 100 : 0;
    
    const zoneWeightPercentage = normalizedTotal > 0 
      ? Math.round((normalizedZone / normalizedTotal) * 100) 
      : 0;
    
    let dominantAction: SignalAction = 'HOLD';
    if (buyWeight > sellWeight * 1.2 && buyWeight > neutralWeight) {
      dominantAction = 'BUY';
    } else if (sellWeight > buyWeight * 1.2 && sellWeight > neutralWeight) {
      dominantAction = 'SELL';
    }
    
    const buyFactors = processedFactors.filter(f => f.action === 'BUY');
    const sellFactors = processedFactors.filter(f => f.action === 'SELL');
    
    const contradictions = dominantAction === 'BUY'
      ? sellFactors.filter(f => f.weight > 4)
      : dominantAction === 'SELL'
      ? buyFactors.filter(f => f.weight > 4)
      : [];
    
    let conflictSeverity: ConfluenceResult['conflictSeverity'] = 'LOW';
    const contradictionRatio = processedFactors.length > 0 
      ? contradictions.length / processedFactors.length 
      : 0;
    if (contradictionRatio > 0.4) conflictSeverity = 'CRITICAL';
    else if (contradictionRatio > 0.25) conflictSeverity = 'HIGH';
    else if (contradictionRatio > 0.15) conflictSeverity = 'MODERATE';
    
    return {
      totalScore: Math.min(100, Math.round(normalizedTotal)),
      zoneWeightScore: Math.min(100, Math.round(normalizedZone)),
      supportingScore: Math.min(100, Math.round(normalizedSupporting)),
      zoneWeightPercentage,
      factors: processedFactors,
      dominantAction,
      contradictions,
      conflictSeverity,
    };
  }, [config]);

  // ============================================
  // STEP 11: REACTION QUALITY FILTER
  // ============================================
  const evaluateReactionQuality = useCallback((
    price: number,
    primaryZone: ZoneCluster | ManualDailyZone | null,
    delta: number,
    volumeHistory: number[]
  ): { reacted: boolean; quality: 'NONE' | 'WEAK' | 'MODERATE' | 'STRONG' } => {
    if (!primaryZone) return { reacted: false, quality: 'NONE' };
    
    const inZone = 'midpoint' in primaryZone
      ? price >= primaryZone.priceMin && price <= primaryZone.priceMax
      : price >= primaryZone.zoneMin && price <= primaryZone.zoneMax;
    
    if (!inZone) return { reacted: false, quality: 'NONE' };
    
    const avgVolume = volumeHistory.length > 0 
      ? volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length 
      : 0;
    
    const reactionThreshold = Math.max(config.persistence.minReactionSize, avgVolume * 0.5);
    const hasReaction = Math.abs(delta) > reactionThreshold;
    
    let quality: 'NONE' | 'WEAK' | 'MODERATE' | 'STRONG' = 'NONE';
    if (Math.abs(delta) > reactionThreshold * 2) quality = 'STRONG';
    else if (Math.abs(delta) > reactionThreshold * 1.5) quality = 'MODERATE';
    else if (hasReaction) quality = 'WEAK';
    
    return { reacted: hasReaction, quality };
  }, [config.persistence.minReactionSize]);

  // ============================================
  // STEP 12: PERSISTENCE WINDOWS
  // ============================================
  const updatePersistence = useCallback((
    state: MarketState,
    direction: SignalAction,
    ticksMap: Map<string, number>,
    windowSize: number
  ): { stateMet: boolean; directionMet: boolean } => {
    const stateKey = `state_${state}`;
    const dirKey = `dir_${direction}`;
    
    const currentStateTicks = ticksMap.get(stateKey) || 0;
    const currentDirTicks = ticksMap.get(dirKey) || 0;
    
    ticksMap.set(stateKey, currentStateTicks + 1);
    ticksMap.set(dirKey, currentDirTicks + 1);
    
    return {
      stateMet: currentStateTicks + 1 >= windowSize,
      directionMet: currentDirTicks + 1 >= windowSize,
    };
  }, []);

  // ============================================
  // STEP 13: STATE MACHINE
  // ============================================
  const determineState = useCallback((
    price: number,
    primaryZone: ZoneCluster | ManualDailyZone | null,
    confluence: ConfluenceResult,
    gate0Trend: MarketStructure,
    manualZone: ManualDailyZone | null,
    reactionQuality: { reacted: boolean; quality: string },
    dataQuality: DataQualityScore
  ): MarketState => {
    if (!primaryZone) return 'WAITING';
    
    const distToZone = 'midpoint' in primaryZone
      ? Math.abs(price - primaryZone.midpoint)
      : Math.abs(price - (primaryZone.zoneMin + primaryZone.zoneMax) / 2);
    
    const inZone = 'midpoint' in primaryZone
      ? price >= primaryZone.priceMin && price <= primaryZone.priceMax
      : price >= primaryZone.zoneMin && price <= primaryZone.zoneMax;
    
    let trendAligned = true;
    if (manualZone) {
      trendAligned = (manualZone.direction === 'BUY' && gate0Trend === 'BULLISH') ||
                     (manualZone.direction === 'SELL' && gate0Trend === 'BEARISH') ||
                     gate0Trend === 'NEUTRAL';
    }
    
    if (!inZone && distToZone > config.zoneProximityThreshold * 2) {
      return 'WAITING';
    }
    
    if (!inZone && distToZone > config.zoneEntryThreshold) {
      return 'APPROACHING_ZONE';
    }
    
    if (!inZone && distToZone <= config.zoneEntryThreshold) {
      return 'ENTERING_ZONE';
    }
    
    if (inZone) {
      if (reactionQuality.quality === 'NONE' || reactionQuality.quality === 'WEAK') {
        return 'IN_ZONE';
      }
      
      if (confluence.totalScore < 40) {
        return 'IN_ZONE';
      }
      
      if (confluence.totalScore < 60) {
        return 'ANALYZING';
      }
      
      if (confluence.totalScore >= 60 && confluence.zoneWeightPercentage < 50) {
        return 'ANALYZING';
      }
      
      if (!trendAligned) {
        return 'ANALYZING';
      }
      
      if (confluence.totalScore >= 80 && confluence.zoneWeightPercentage >= 50 && trendAligned) {
        if (confluence.conflictSeverity === 'HIGH' || confluence.conflictSeverity === 'CRITICAL') {
          return 'ANALYZING';
        }
        return 'HIGH_CONFLUENCE';
      }
      
      if (confluence.totalScore >= 70 && confluence.zoneWeightPercentage >= 50) {
        return 'CONFIRMATION';
      }
      
      return 'ANALYZING';
    }
    
    return 'WAITING';
  }, [config.zoneProximityThreshold, config.zoneEntryThreshold]);

  // ============================================
  // MAIN ENGINE UPDATE
  // ============================================
  const updateEngine = useCallback(() => {
    const price = marketData.price;
    if (price <= 0) return;
    
    priceHistoryRef.current = [...priceHistoryRef.current.slice(-499), price];
    
    // ---- STEP 1: DATA QUALITY ----
    const dataQuality = assessDataQuality(marketData);
    
    // ---- STEP 2: EMA CALCULATIONS ----
    const ema200 = calculateEMA(priceHistoryRef.current, config.ema200Period);
    const ema50 = calculateEMA(priceHistoryRef.current, 50);
    const ema20 = calculateEMA(priceHistoryRef.current, 20);
    
    // ---- STEP 3: GATE 0 (EMA200) ----
    const gate0 = evaluateGate0(price, ema200, engineState.manualZone);
    
    let updatedManualZone = engineState.manualZone;
    if (updatedManualZone && ema200 !== null) {
      const priceAboveEma = price > ema200;
      const dirMatches = (updatedManualZone.direction === 'BUY' && priceAboveEma) ||
                         (updatedManualZone.direction === 'SELL' && !priceAboveEma);
      updatedManualZone = {
        ...updatedManualZone,
        ema200Aligned: dirMatches,
        ema200Conflict: !dirMatches,
      };
    }
    
    // ---- STEP 4: MARKET STRUCTURE ----
    const structure = analyzeMarketStructure(price, priceHistoryRef.current, ema200, ema50, ema20);
    
    // ---- STEP 5: ZONE DETECTION ----
    const rawZones = detectZones(
      price,
      priceHistoryRef.current,
      { bids: marketData.bids, asks: marketData.asks },
      marketData.recentTrades
    );
    
    const allZones = [...rawZones];
    if (updatedManualZone && updatedManualZone.zoneMin > 0 && updatedManualZone.zoneMax > 0) {
      allZones.push({
        id: updatedManualZone.id,
        type: 'MANUAL',
        priceMin: updatedManualZone.zoneMin,
        priceMax: updatedManualZone.zoneMax,
        midpoint: (updatedManualZone.zoneMin + updatedManualZone.zoneMax) / 2,
        strength: 'VERY_HIGH',
        confluences: [{ type: 'MANUAL', strength: 'VERY_HIGH', timeframe: 'HTF' }],
        source: 'User-defined daily zone',
        createdAt: updatedManualZone.createdAt,
        updatedAt: Date.now(),
        status: 'ACTIVE',
        timeframe: 'HTF',
        touches: 0,
        absorptionEvents: 0,
        invalidationPrice: updatedManualZone.direction === 'BUY' 
          ? updatedManualZone.zoneMin - 50
          : updatedManualZone.zoneMax + 50,
        volumeAtFormation: null,
        isClustered: false,
        clusterId: null,
      });
    }
    
    // ---- STEP 6: INVALIDATE ZONES ----
    const activeZones = invalidateZones(allZones, price);
    
    // ---- STEP 7: CLUSTER ZONES ----
    const clusters = clusterZones(activeZones);
    
    // ---- STEP 8: RANK BY PROXIMITY ----
    const { clusters: rankedClusters, primary } = rankZones(clusters, updatedManualZone, price);
    
    // ---- STEP 9: BUILD SIGNAL FACTORS ----
    const factors = buildSignalFactors(
      marketData,
      structure,
      rankedClusters,
      updatedManualZone,
      price,
      ema200,
      ema50,
      ema20,
      dataQuality
    );
    
    // ---- STEP 10: CALCULATE CONFLUENCE ----
    const confluence = calculateConfluence(factors);
    
    // ---- STEP 11: REACTION QUALITY ----
    const volumeHist = volumeHistoryRef.current.slice(-30);
    const reactionQuality = evaluateReactionQuality(
      price, primary, marketData.volumeDelta, volumeHist
    );
    
    // ---- STEP 12: PERSISTENCE TRACKING ----
    const ticksMap = new Map(consecutiveTicksRef.current);
    
    const provisionalState = determineState(
      price, primary, confluence, gate0.trend, updatedManualZone, reactionQuality, dataQuality
    );
    
    const persistenceWindow = 
      provisionalState === 'CONFIRMATION' || provisionalState === 'HIGH_CONFLUENCE'
        ? config.persistence.zoneWindow
        : config.persistence.orderFlowWindow;
    
    const persistenceResult = updatePersistence(
      provisionalState, 
      confluence.dominantAction, 
      ticksMap, 
      persistenceWindow
    );
    
    consecutiveTicksRef.current = ticksMap;
    
    const persistenceMet = persistenceResult.stateMet && persistenceResult.directionMet;
    
    // ---- STEP 13: FINAL STATE ----
    let finalState = provisionalState;
    
    if (!persistenceMet && (provisionalState === 'CONFIRMATION' || provisionalState === 'HIGH_CONFLUENCE')) {
      finalState = 'ANALYZING';
    }
    
    // ---- STEP 14: GATE CHECKS ----
    const gate0Passed = gate0.blocks === null || 
                        confluence.dominantAction !== gate0.blocks ||
                        confluence.dominantAction === 'HOLD';
    
    const zoneWeightMet = confluence.zoneWeightPercentage >= config.minZoneWeightPercentage;
    const thresholdMet = confluence.totalScore >= config.minConfluenceThreshold;
    const reactionMet = reactionQuality.reacted;
    
    // ---- STEP 15: IS_TRADEABLE ----
    const isTradeable = 
      gate0Passed && 
      zoneWeightMet && 
      thresholdMet && 
      persistenceMet && 
      reactionMet &&
      ['CONFIRMATION', 'HIGH_CONFLUENCE'].includes(finalState) &&
      dataQuality.overall >= 60;
    
    // ---- BUILD WARNINGS ----
    const warnings: string[] = [];
    if (!gate0Passed) warnings.push(`Gate 0 blocked: ${gate0.blocks} contradicts EMA200 (${gate0.trend})`);
    if (!zoneWeightMet) warnings.push(`Zone weight ${confluence.zoneWeightPercentage}% < ${config.minZoneWeightPercentage}% required`);
    if (!thresholdMet) warnings.push(`Confluence ${confluence.totalScore}% < ${config.minConfluenceThreshold}% required`);
    if (!persistenceMet) warnings.push('Signal not yet persistent');
    if (!reactionMet) warnings.push('Zone touch without meaningful reaction');
    if (dataQuality.overall < 70) warnings.push(`Low data quality: ${dataQuality.overall}%`);
    if (confluence.conflictSeverity === 'HIGH' || confluence.conflictSeverity === 'CRITICAL') {
      warnings.push(`High conflict severity: ${confluence.conflictSeverity}`);
    }
    if (updatedManualZone?.ema200Conflict) {
      warnings.push('Manual zone contradicts EMA200 master trend');
    }
    if (gate0.conflicts.length > 0) {
      warnings.push(...gate0.conflicts);
    }
    
    // ---- BUILD DECISION ----
    const decision: MarketContextDecision = {
      state: finalState,
      contextScore: confluence.totalScore,
      calibratedProbability: null,
      confidence: confluence.totalScore >= 80 && persistenceMet && zoneWeightMet ? 'VERY_HIGH' :
                  confluence.totalScore >= 60 && persistenceMet ? 'HIGH' :
                  confluence.totalScore >= 40 ? 'MEDIUM' : 'LOW',
      gate0Passed,
      gate0Trend: gate0.trend,
      zoneWeightMet,
      thresholdMet,
      persistenceMet,
      primaryZone: primary,
      nearbyZones: activeZones,
      zoneClusters: rankedClusters,
      structure,
      confluence,
      dataQuality,
      manualZone: updatedManualZone,
      stateHistory: engineState.stateHistory,
      timestamp: Date.now(),
      isTradeable,
      warnings,
    };
    
    let stateHistory = engineState.stateHistory;
    if (finalState !== engineState.state) {
      stateHistory = [
        ...stateHistory.slice(-20),
        {
          from: engineState.state,
          to: finalState,
          trigger: 'Tick Update',
          timestamp: Date.now(),
          reason: `Score: ${confluence.totalScore}%, Zone: ${confluence.zoneWeightPercentage}%, Reaction: ${reactionQuality.quality}`,
        },
      ];
      lastStateChangeRef.current = Date.now();
    }
    
    setEngineState({
      decision,
      manualZone: updatedManualZone,
      activeZones,
      zoneClusters: rankedClusters,
      state: finalState,
      persistenceWindows: new Map(),
      stateHistory,
      lastPrice: price,
      priceHistory: priceHistoryRef.current,
      volumeHistory: volumeHistoryRef.current,
      ema200Value: ema200,
      ema50Value: ema50,
      ema20Value: ema20,
      dataQuality,
      isInitialized: true,
      stateConsecutiveTicks: new Map(),
      directionConsecutiveTicks: new Map(),
      zoneEntryTicks: engineState.zoneEntryTicks,
      lastZoneEntryPrice: engineState.lastZoneEntryPrice,
      zoneEntryConfirmed: engineState.zoneEntryConfirmed,
      lastPriceUpdateTime: Date.now(),
    });
  }, [
    marketData,
    config,
    engineState.manualZone,
    engineState.state,
    engineState.stateHistory,
    assessDataQuality,
    calculateEMA,
    evaluateGate0,
    analyzeMarketStructure,
    detectZones,
    invalidateZones,
    clusterZones,
    rankZones,
    buildSignalFactors,
    calculateConfluence,
    evaluateReactionQuality,
    updatePersistence,
    determineState,
  ]);

  useEffect(() => {
    if (marketData.price > 0) {
      updateEngine();
    }
  }, [marketData.price, marketData.volumeDelta, marketData.buyersPercent, updateEngine]);

  const getUICompatibleSummary = useCallback(() => {
    const decision = engineState.decision;
    if (!decision) {
      return {
        buyCount: 0,
        neutralCount: 0,
        sellCount: 0,
        score: 50,
        verdict: 'MONITORING',
        state: 'WAITING' as MarketState,
        isTradeable: false,
        gate0Passed: true,
        zoneWeightMet: false,
        thresholdMet: false,
        persistenceMet: false,
        dataQuality: engineState.dataQuality,
        warnings: [] as string[],
        primaryZone: null,
        confluence: null,
        structure: null,
      };
    }
    
    const buyFactors = decision.confluence.factors.filter(f => f.action === 'BUY');
    const sellFactors = decision.confluence.factors.filter(f => f.action === 'SELL');
    const neutralFactors = decision.confluence.factors.filter(f => f.action === 'HOLD');
    
    const buyScore = buyFactors.reduce((sum, f) => sum + f.weight, 0);
    const sellScore = sellFactors.reduce((sum, f) => sum + f.weight, 0);
    const totalScore = buyScore + sellScore + neutralFactors.reduce((sum, f) => sum + f.weight, 0);
    
    let verdict: string;
    if (decision.state === 'WAITING') {
      verdict = 'MONITORING';
    } else if (decision.state === 'APPROACHING_ZONE') {
      verdict = 'APPROACHING';
    } else if (decision.state === 'ENTERING_ZONE') {
      verdict = 'ENTERING';
    } else if (decision.state === 'IN_ZONE') {
      verdict = 'IN_ZONE';
    } else if (decision.state === 'ANALYZING') {
      verdict = 'ANALYZING';
    } else if (decision.state === 'HIGH_CONFLUENCE' && decision.isTradeable) {
      verdict = 'STRONG BUY';
    } else if (decision.state === 'CONFIRMATION' && decision.isTradeable) {
      verdict = 'BUY';
    } else if (decision.confluence.conflictSeverity === 'CRITICAL') {
      verdict = 'CONFLICT';
    } else if (buyScore > sellScore * 1.3 && decision.state !== 'WAITING') {
      verdict = 'WEAK BUY';
    } else if (sellScore > buyScore * 1.3 && decision.state !== 'WAITING') {
      verdict = 'WEAK SELL';
    } else {
      verdict = 'NEUTRAL';
    }
    
    return {
      buyCount: Math.round((buyScore / (totalScore || 1)) * 100),
      neutralCount: Math.round((neutralFactors.reduce((sum, f) => sum + f.weight, 0) / (totalScore || 1)) * 100),
      sellCount: Math.round((sellScore / (totalScore || 1)) * 100),
      score: decision.contextScore,
      verdict,
      state: decision.state,
      isTradeable: decision.isTradeable,
      gate0Passed: decision.gate0Passed,
      zoneWeightMet: decision.zoneWeightMet,
      thresholdMet: decision.thresholdMet,
      persistenceMet: decision.persistenceMet,
      dataQuality: decision.dataQuality,
      warnings: decision.warnings,
      primaryZone: decision.primaryZone,
      confluence: decision.confluence,
      structure: decision.structure,
    };
  }, [engineState.decision, engineState.dataQuality]);

  return {
    decision: engineState.decision,
    state: engineState.state,
    dataQuality: engineState.dataQuality,
    isInitialized: engineState.isInitialized,
    ema200Value: engineState.ema200Value,
    uiSummary: getUICompatibleSummary(),
    manualZone: engineState.manualZone,
    activeZones: engineState.activeZones,
    zoneClusters: engineState.zoneClusters,
    stateHistory: engineState.stateHistory,
    setManualZone: (zone: ManualDailyZone) => {
      const ema200 = engineState.ema200Value;
      const price = engineState.lastPrice;
      
      let ema200Aligned = true;
      let ema200Conflict = false;
      
      if (ema200 && price > 0) {
        const priceAboveEma = price > ema200;
        ema200Aligned = (zone.direction === 'BUY' && priceAboveEma) || 
                        (zone.direction === 'SELL' && !priceAboveEma);
        ema200Conflict = !ema200Aligned;
      }
      
      const updatedZone = { ...zone, ema200Aligned, ema200Conflict };
      
      setEngineState(prev => ({
        ...prev,
        manualZone: updatedZone,
      }));
      
      localStorage.setItem(`tradingConfig_MGC1!`, JSON.stringify({
        direction: updatedZone.direction,
        startTime: updatedZone.startTime,
        endTime: updatedZone.endTime,
        minPrice: updatedZone.zoneMin,
        maxPrice: updatedZone.zoneMax,
        stopLoss: updatedZone.stopLoss,
        takeProfit: updatedZone.takeProfit,
      }));
    },
  };
};