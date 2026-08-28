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
// MARKET CONTEXT ENGINE
// ============================================

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
  ema200Value: number | null;
  ema50Value: number | null;
  dataQuality: DataQualityScore;
  isInitialized: boolean;
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
  ema200Value: null,
  ema50Value: null,
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
};

export const useMarketContextEngine = (
  marketData: TwelveDataState,
  config: MarketContextConfig = DEFAULT_CONTEXT_CONFIG
) => {
  const [engineState, setEngineState] = useState<EngineState>(initialState);
  
  // Refs for real-time calculations
  const priceHistoryRef = useRef<number[]>([]);
  const lastStateChangeRef = useRef<number>(Date.now());
  const consecutiveTicksRef = useRef<Map<string, number>>(new Map());

  // ---- Load Manual Zone from localStorage ----
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(`tradingConfig_MGC1!`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert to ManualDailyZone format
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
          ema200Aligned: false, // Will be calculated
          ema200Conflict: false,
        };
        
        setEngineState(prev => ({ ...prev, manualZone }));
      } catch (e) {
        console.error('Failed to load manual zone:', e);
      }
    }
  }, []);

  // ---- EMA Calculation ----
  const calculateEMA = useCallback((prices: number[], period: number): number => {
    if (prices.length === 0) return 0;
    if (prices.length < period) {
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    }
    
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    
    return ema;
  }, []);

  // ---- Gate 0: EMA200 Master Trend ----
  const evaluateGate0 = useCallback((price: number, ema200: number | null): { passed: boolean; trend: MarketStructure } => {
    if (!config.ema200Enabled || ema200 === null) {
      return { passed: true, trend: 'NEUTRAL' };
    }
    
    const trend: MarketStructure = price > ema200 ? 'BULLISH' : price < ema200 ? 'BEARISH' : 'NEUTRAL';
    
    return {
      passed: true, // Gate doesn't block, it constrains direction
      trend,
    };
  }, [config.ema200Enabled]);

  // ---- Data Quality Assessment ----
  const assessDataQuality = useCallback((data: TwelveDataState): DataQualityScore => {
    const metrics: DataQualityMetrics = {
      orderBookComplete: data.bids.length >= 3 && data.asks.length >= 3,
      tapeAvailable: data.recentTrades.length > 0,
      volumeAvailable: data.volumeDelta !== undefined,
      tradesAvailable: data.recentTrades.length > 0,
      indicatorsValid: data.oscillators.length > 0 && data.movingAverages.length > 0,
      websocketConnected: data.isLive,
      lastUpdateTime: Date.now(),
      latencyMs: 0,
      freshness: data.isLive ? 'LIVE' : 'DELAYED',
    };

    let overall = 100;
    
    // Deduct for missing/incomplete data
    if (!metrics.orderBookComplete) overall -= config.dataQualityDecay;
    if (!metrics.tapeAvailable) overall -= 10;
    if (!metrics.volumeAvailable) overall -= 8;
    if (!metrics.tradesAvailable) overall -= 8;
    if (!metrics.indicatorsValid) overall -= 15;
    if (!metrics.websocketConnected) overall -= 25;
    
    // Deduct for market closed
    if (!data.isMarketOpen) overall -= 10;

    return {
      overall: Math.max(0, overall),
      orderBookWeight: metrics.orderBookComplete ? 20 : 0,
      tapeWeight: metrics.tapeAvailable ? 15 : 0,
      volumeWeight: metrics.volumeAvailable ? 15 : 0,
      tradesWeight: metrics.tradesAvailable ? 10 : 0,
      indicatorsWeight: metrics.indicatorsValid ? 40 : 0,
      metrics,
    };
  }, [config.dataQualityDecay]);

  // ---- Detect Institutional Zones ----
  const detectZones = useCallback((
    price: number,
    priceHistory: number[],
    orderBook: OrderBookLevel[],
    trades: TradeFeedItem[]
  ): InstitutionalZone[] => {
    const zones: InstitutionalZone[] = [];
    const now = Date.now();

    // 1. FVG Detection (Fair Value Gap)
    // A 3-candle FVG: gap between high of candle 1 and low of candle 3
    if (priceHistory.length >= 3) {
      const last3 = priceHistory.slice(-3);
      const gapUp = last3[2] > last3[0] + (last3[0] * 0.001); // Small threshold
      const gapDown = last3[2] < last3[0] - (last3[0] * 0.001);
      
      if (gapUp) {
        const fvgMid = (last3[0] + last3[2]) / 2;
        if (Math.abs(price - fvgMid) < config.zoneProximityThreshold * 3) {
          zones.push({
            id: `fvg-${now}`,
            type: 'FVG',
            priceMin: last3[2],
            priceMax: last3[0],
            midpoint: fvgMid,
            strength: 'HIGH',
            confluences: [{ type: 'FVG', strength: 'HIGH', timeframe: 'LTF' }],
            source: 'FVG Detection',
            createdAt: now,
            updatedAt: now,
            status: 'ACTIVE',
            timeframe: 'LTF',
            touches: 0,
            absorptionEvents: 0,
            invalidationPrice: last3[2],
            volumeAtFormation: null,
            isClustered: false,
            clusterId: null,
          });
        }
      }
    }

    // 2. POC (Point of Control) - Estimate from order book
    if (orderBook.length > 0) {
      let maxSize = 0;
      let pocPrice = 0;
      
      [...orderBook.bids, ...orderBook.asks].forEach(level => {
        if (level.size > maxSize) {
          maxSize = level.size;
          pocPrice = level.price;
        }
      });
      
      if (pocPrice > 0) {
        const spread = orderBook.asks[0]?.price - orderBook.bids[0]?.price || 0;
        zones.push({
          id: `poc-${now}`,
          type: 'POC',
          priceMin: pocPrice - spread * 0.5,
          priceMax: pocPrice + spread * 0.5,
          midpoint: pocPrice,
          strength: 'MEDIUM',
          confluences: [{ type: 'POC', strength: 'MEDIUM', timeframe: 'MTF' }],
          source: 'Order Book Analysis',
          createdAt: now,
          updatedAt: now,
          status: 'ACTIVE',
          timeframe: 'MTF',
          touches: 1,
          absorptionEvents: 0,
          invalidationPrice: pocPrice - spread * 2,
          volumeAtFormation: maxSize,
          isClustered: false,
          clusterId: null,
        });
      }
    }

    // 3. Swing High/Low zones
    if (priceHistory.length >= 20) {
      const recentPrices = priceHistory.slice(-20);
      const max = Math.max(...recentPrices);
      const min = Math.min(...recentPrices);
      const range = max - min;
      
      // Recent swing high
      const swingHighIdx = recentPrices.indexOf(max);
      if (swingHighIdx >= 0 && Math.abs(price - max) < config.zoneProximityThreshold * 2) {
        zones.push({
          id: `swing-high-${now}`,
          type: 'SWING',
          priceMin: max - range * 0.02,
          priceMax: max + range * 0.01,
          midpoint: max,
          strength: 'MEDIUM',
          confluences: [{ type: 'SWING', strength: 'MEDIUM', timeframe: 'MTF' }],
          source: 'Swing High Detection',
          createdAt: now - (20 - swingHighIdx) * 60000, // Approximate time
          updatedAt: now,
          status: 'ACTIVE',
          timeframe: 'MTF',
          touches: 0,
          absorptionEvents: 0,
          invalidationPrice: max + range * 0.03,
          volumeAtFormation: null,
          isClustered: false,
          clusterId: null,
        });
      }
      
      // Recent swing low
      const swingLowIdx = recentPrices.indexOf(min);
      if (swingLowIdx >= 0 && Math.abs(price - min) < config.zoneProximityThreshold * 2) {
        zones.push({
          id: `swing-low-${now}`,
          type: 'SWING',
          priceMin: min - range * 0.01,
          priceMax: min + range * 0.02,
          midpoint: min,
          strength: 'MEDIUM',
          confluences: [{ type: 'SWING', strength: 'MEDIUM', timeframe: 'MTF' }],
          source: 'Swing Low Detection',
          createdAt: now - (20 - swingLowIdx) * 60000,
          updatedAt: now,
          status: 'ACTIVE',
          timeframe: 'MTF',
          touches: 0,
          absorptionEvents: 0,
          invalidationPrice: min - range * 0.03,
          volumeAtFormation: null,
          isClustered: false,
          clusterId: null,
        });
      }
    }

    return zones;
  }, [config.zoneProximityThreshold]);

  // ---- Cluster Overlapping Zones ----
  const clusterZones = useCallback((zones: InstitutionalZone[]): ZoneCluster[] => {
    if (zones.length === 0) return [];
    
    const clusters: ZoneCluster[] = [];
    const used = new Set<string>();
    
    // Sort zones by midpoint
    const sorted = [...zones].sort((a, b) => a.midpoint - b.midpoint);
    
    for (const zone of sorted) {
      if (used.has(zone.id)) continue;
      
      const overlapping = zones.filter(z => {
        if (used.has(z.id)) return false;
        // Check if zones overlap (within 10 points for XAUUSD)
        const overlap = !(z.priceMax < zone.priceMin - 10 || z.priceMin > zone.priceMax + 10);
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
          return sum + (c.strength === 'VERY_HIGH' ? 25 : c.strength === 'HIGH' ? 20 : c.strength === 'MEDIUM' ? 10 : 5);
        }, 0);
        
        clusters.push({
          id: `cluster-${clusters.length}`,
          zones: allZones,
          priceMin,
          priceMax,
          midpoint,
          totalConfluence: allConfluences,
          strength: totalScore >= 40 ? 'VERY_HIGH' : totalScore >= 25 ? 'HIGH' : 'MEDIUM',
          distanceFromPrice: 0, // Will be calculated later
          totalScore,
        });
      }
    }
    
    return clusters;
  }, []);

  // ---- Calculate Zone Distance from Price ----
  const calculateZoneDistances = useCallback((
    clusters: ZoneCluster[],
    manualZone: ManualDailyZone | null,
    price: number
  ): { clusters: ZoneCluster[]; primary: ZoneCluster | ManualDailyZone | null } => {
    // Calculate distances for clusters
    const updatedClusters = clusters.map(cluster => ({
      ...cluster,
      distanceFromPrice: Math.abs(price - cluster.midpoint),
    })).sort((a, b) => a.distanceFromPrice - b.distanceFromPrice);
    
    // Add manual zone to consideration
    let primary: ZoneCluster | ManualDailyZone | null = null;
    
    if (manualZone && manualZone.zoneMin > 0 && manualZone.zoneMax > 0) {
      const inManualZone = price >= manualZone.zoneMin && price <= manualZone.zoneMax;
      const distToManual = Math.min(
        Math.abs(price - manualZone.zoneMin),
        Math.abs(price - manualZone.zoneMax),
        Math.abs(price - (manualZone.zoneMin + manualZone.zoneMax) / 2)
      );
      
      // Manual zone is primary if price is in it or it's closer than any cluster
      if (inManualZone || distToManual < (updatedClusters[0]?.distanceFromPrice || Infinity)) {
        primary = manualZone;
      } else if (updatedClusters[0]) {
        primary = updatedClusters[0];
      }
    } else if (updatedClusters[0]) {
      primary = updatedClusters[0];
    }
    
    return { clusters: updatedClusters, primary };
  }, []);

  // ---- Market Structure Analysis ----
  const analyzeMarketStructure = useCallback((
    price: number,
    priceHistory: number[],
    ema200: number | null,
    ema50: number | null
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
    
    // Find swing highs and lows in recent history
    const recentPrices = priceHistory.slice(-50);
    const swingHighs: { price: number; idx: number }[] = [];
    const swingLows: { price: number; idx: number }[] = [];
    
    for (let i = 2; i < recentPrices.length - 2; i++) {
      // Swing high: higher than neighbors
      if (recentPrices[i] > recentPrices[i - 1] && 
          recentPrices[i] > recentPrices[i - 2] &&
          recentPrices[i] > recentPrices[i + 1] && 
          recentPrices[i] > recentPrices[i + 2]) {
        swingHighs.push({ price: recentPrices[i], idx: i });
      }
      // Swing low: lower than neighbors
      if (recentPrices[i] < recentPrices[i - 1] && 
          recentPrices[i] < recentPrices[i - 2] &&
          recentPrices[i] < recentPrices[i + 1] && 
          recentPrices[i] < recentPrices[i + 2]) {
        swingLows.push({ price: recentPrices[i], idx: i });
      }
    }
    
    // Determine HH/HL or LH/LL pattern
    let structureState: MarketStructureData['structureState'] = 'NEUTRAL';
    let bosDirection: MarketStructureData['bosDirection'] = null;
    let bosConfirmed = false;
    
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const last2Highs = swingHighs.slice(-2);
      const last2Lows = swingLows.slice(-2);
      
      if (last2Highs[1].price > last2Highs[0].price && last2Lows[1].price > last2Lows[0].price) {
        structureState = 'HH_HL';
        // Check for BOS Bull
        if (last2Lows[1].price > last2Lows[0].price + 5) {
          bosDirection = 'BULL';
          bosConfirmed = true;
        }
      } else if (last2Highs[1].price < last2Highs[0].price && last2Lows[1].price < last2Lows[0].price) {
        structureState = 'LH_LL';
        // Check for BOS Bear
        if (last2Lows[1].price < last2Lows[0].price - 5) {
          bosDirection = 'BEAR';
          bosConfirmed = true;
        }
      }
    }
    
    // Determine trends
    const htfTrend: MarketStructure = ema200 ? (price > ema200 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';
    const mtfTrend: MarketStructure = ema50 ? (price > ema50 ? 'BULLISH' : price < ema50 ? 'BEARISH' : 'NEUTRAL') : 'NEUTRAL';
    const ltfTrend: MarketStructure = priceHistory.length >= 5 
      ? (recentPrices[recentPrices.length - 1] > recentPrices[recentPrices.length - 5] ? 'BULLISH' : 'BEARISH')
      : 'NEUTRAL';
    
    const overallTrend: MarketStructure = 
      htfTrend === 'BULLISH' && mtfTrend === 'BULLISH' ? 'BULLISH' :
      htfTrend === 'BEARISH' && mtfTrend === 'BEARISH' ? 'BEARISH' :
      'NEUTRAL';
    
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

  // ---- Build Signal Factors from Market Data ----
  const buildSignalFactors = useCallback((
    data: TwelveDataState,
    structure: MarketStructureData,
    zones: ZoneCluster[],
    manualZone: ManualDailyZone | null,
    price: number,
    ema200: number | null
  ): SignalFactor[] => {
    const factors: SignalFactor[] = [];
    
    // 1. EMA200 Position (Gate 0)
    if (ema200) {
      const aboveEma = price > ema200;
      factors.push({
        name: 'EMA_200',
        value: ema200.toFixed(2),
        action: aboveEma ? 'BUY' : 'SELL',
        weight: config.weights.find(w => w.name === 'EMA_200')?.baseWeight || 12,
        isCorrelated: false,
        correlationGroup: 'EMA_CLOUD',
        source: 'EMA Calculation',
        timestamp: Date.now(),
      });
    }
    
    // 2. EMA Cluster (correlated)
    const emas = data.movingAverages.filter(ma => ma.name.includes('EMA'));
    if (emas.length > 0) {
      const emaActions = emas.map(ema => ema.action);
      const buyCount = emaActions.filter(a => a.includes('BUY')).length;
      const sellCount = emaActions.filter(a => a.includes('SELL')).length;
      
      factors.push({
        name: 'EMA_CLUSTER',
        value: `${buyCount} B / ${sellCount} S`,
        action: buyCount > sellCount ? 'BUY' : buyCount < sellCount ? 'SELL' : 'HOLD',
        weight: config.weights.filter(w => w.category === 'EMA').reduce((sum, w) => sum + w.baseWeight, 0) * 0.8, // Reduced for correlation
        isCorrelated: true,
        correlationGroup: 'EMA_CLOUD',
        source: 'EMA Cluster Analysis',
        timestamp: Date.now(),
      });
    }
    
    // 3. Market Structure
    factors.push({
      name: 'MARKET_STRUCTURE',
      value: structure.trend,
      action: structure.trend === 'BULLISH' ? 'BUY' : structure.trend === 'BEARISH' ? 'SELL' : 'HOLD',
      weight: config.weights.find(w => w.name === 'MARKET_STRUCTURE')?.baseWeight || 15,
      isCorrelated: false,
      correlationGroup: 'STRUCTURE',
      source: 'Structure Analysis',
      timestamp: Date.now(),
    });
    
    // 4. BOS Confirmation
    if (structure.bosConfirmed) {
      factors.push({
        name: 'BOS',
        value: structure.bosDirection || 'NEUTRAL',
        action: structure.bosDirection === 'BULL' ? 'BUY' : structure.bosDirection === 'BEAR' ? 'SELL' : 'HOLD',
        weight: config.weights.find(w => w.name === 'BOS')?.baseWeight || 10,
        isCorrelated: false,
        correlationGroup: 'STRUCTURE',
        source: 'BOS Detection',
        timestamp: Date.now(),
      });
    }
    
    // 5. Order Flow / Delta
    const buyersPct = data.buyersPercent;
    const delta = data.volumeDelta;
    
    factors.push({
      name: 'ORDER_FLOW',
      value: `${buyersPct}% / Δ${delta}`,
      action: buyersPct > 55 ? 'BUY' : buyersPct < 45 ? 'SELL' : 'HOLD',
      weight: config.weights.find(w => w.name === 'DELTA')?.baseWeight || 10,
      isCorrelated: false,
      correlationGroup: 'FLOW',
      source: 'Volume Delta Analysis',
      timestamp: Date.now(),
    });
    
    // 6. Tape / Aggression
    if (data.recentTrades.length > 0) {
      const buyAggression = data.recentTrades.filter(t => t.type === 'BUY').length;
      const sellAggression = data.recentTrades.filter(t => t.type === 'SELL').length;
      
      factors.push({
        name: 'TAPE',
        value: `${buyAggression} B / ${sellAggression} S`,
        action: buyAggression > sellAggression ? 'BUY' : sellAggression > buyAggression ? 'SELL' : 'HOLD',
        weight: config.weights.find(w => w.name === 'TAPE')?.baseWeight || 8,
        isCorrelated: false,
        correlationGroup: 'FLOW',
        source: 'Trade Tape Analysis',
        timestamp: Date.now(),
      });
    }
    
    // 7. Oscillators
    const oscBuyCount = data.oscillators.filter(o => o.action.includes('BUY')).length;
    const oscSellCount = data.oscillators.filter(o => o.action.includes('SELL')).length;
    
    factors.push({
      name: 'OSCILLATORS',
      value: `${oscBuyCount} B / ${oscSellCount} S`,
      action: oscBuyCount > oscSellCount ? 'BUY' : oscSellCount > oscBuyCount ? 'SELL' : 'HOLD',
      weight: config.weights.filter(w => w.category === 'OSCILLATOR').reduce((sum, w) => sum + w.baseWeight, 0),
      isCorrelated: false,
      correlationGroup: null,
      source: 'RSI/MACD/Momentum',
      timestamp: Date.now(),
    });
    
    // 8. Zone Proximity (if zones exist)
    if (zones.length > 0) {
      const nearestZone = zones[0];
      const distFromPrice = nearestZone.distanceFromPrice;
      
      factors.push({
        name: 'ZONE_PROXIMITY',
        value: distFromPrice.toFixed(1),
        action: 'HOLD', // Zone proximity doesn't indicate direction
        weight: 5,
        isCorrelated: false,
        correlationGroup: null,
        source: 'Zone Detection',
        timestamp: Date.now(),
      });
    }
    
    // 9. Manual Zone
    if (manualZone && manualZone.zoneMin > 0 && manualZone.zoneMax > 0) {
      const inZone = price >= manualZone.zoneMin && price <= manualZone.zoneMax;
      const approaching = !inZone && distFromPrice < config.zoneProximityThreshold;
      
      factors.push({
        name: 'MANUAL_ZONE',
        value: inZone ? 'IN_ZONE' : approaching ? 'APPROACHING' : 'OUTSIDE',
        action: manualZone.direction,
        weight: config.weights.find(w => w.name === 'MANUAL_ZONE')?.baseWeight || 15,
        isCorrelated: false,
        correlationGroup: 'ZONE_CLUSTER',
        source: 'Manual Daily Zone',
        timestamp: Date.now(),
      });
    }
    
    // 10. Institutional Pressure
    factors.push({
      name: 'INSTITUTIONAL_PRESSURE',
      value: data.institutionalPressure,
      action: data.institutionalPressure === 'EXTREME' || data.institutionalPressure === 'HIGH' 
        ? (data.volumeDelta > 0 ? 'BUY' : 'SELL')
        : 'HOLD',
      weight: config.weights.find(w => w.name === 'ABSORPTION')?.baseWeight || 8,
      isCorrelated: false,
      correlationGroup: 'FLOW',
      source: 'Institutional Flow Analysis',
      timestamp: Date.now(),
    });
    
    return factors;
  }, [config]);

  // ---- Calculate Confluence ----
  const calculateConfluence = useCallback((
    factors: SignalFactor[],
    zones: ZoneCluster[],
    manualZone: ManualDailyZone | null
  ): ConfluenceResult => {
    // Separate zone factors from supporting factors
    const zoneFactors = factors.filter(f => 
      f.correlationGroup === 'ZONE_CLUSTER' || 
      f.name === 'MANUAL_ZONE' ||
      f.name === 'ZONE_PROXIMITY'
    );
    const supportingFactors = factors.filter(f => !zoneFactors.includes(f));
    
    // Collapse correlated factors
    const correlationGroups = new Map<string, SignalFactor[]>();
    factors.forEach(f => {
      if (f.correlationGroup && !f.isCorrelated) {
        const existing = correlationGroups.get(f.correlationGroup) || [];
        existing.push(f);
        correlationGroups.set(f.correlationGroup, existing);
      }
    });
    
    let totalScore = 0;
    let zoneWeightScore = 0;
    let supportingScore = 0;
    const allFactors: SignalFactor[] = [];
    
    // Add uncorrelated factors directly
    factors.filter(f => !f.correlationGroup || f.isCorrelated).forEach(f => {
      totalScore += f.weight;
      if (zoneFactors.includes(f)) {
        zoneWeightScore += f.weight;
      } else {
        supportingScore += f.weight;
      }
      allFactors.push(f);
    });
    
    // Add collapsed correlated factors (take the one with highest weight)
    correlationGroups.forEach((groupFactors, groupName) => {
      if (groupFactors.length > 1) {
        // Sort by weight descending, take top one
        const best = groupFactors.sort((a, b) => b.weight - a.weight)[0];
        totalScore += best.weight;
        if (zoneFactors.includes(best)) {
          zoneWeightScore += best.weight;
        } else {
          supportingScore += best.weight;
        }
        allFactors.push({ ...best, name: `${groupName}_CLUSTER` });
      }
    });
    
    // Normalize to 0-100
    const maxPossibleScore = factors.reduce((sum, f) => sum + f.maxWeight || f.weight * 1.5, 0);
    const normalizedTotal = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
    const normalizedZone = maxPossibleScore > 0 ? (zoneWeightScore / maxPossibleScore) * 100 : 0;
    const normalizedSupporting = maxPossibleScore > 0 ? (supportingScore / maxPossibleScore) * 100 : 0;
    
    // Count buy vs sell signals
    const buySignals = allFactors.filter(f => f.action === 'BUY');
    const sellSignals = allFactors.filter(f => f.action === 'SELL');
    
    // Determine dominant action
    let dominantAction: SignalAction = 'HOLD';
    const buyWeight = buySignals.reduce((sum, f) => sum + f.weight, 0);
    const sellWeight = sellSignals.reduce((sum, f) => sum + f.weight, 0);
    
    if (buyWeight > sellWeight * 1.2) {
      dominantAction = 'BUY';
    } else if (sellWeight > buyWeight * 1.2) {
      dominantAction = 'SELL';
    }
    
    // Find contradictions (factors going opposite to dominant)
    const contradictions = dominantAction === 'BUY'
      ? sellSignals.filter(f => f.weight > 5) // Significant sell signals
      : dominantAction === 'SELL'
      ? buySignals.filter(f => f.weight > 5)
      : [];
    
    // Calculate conflict severity
    let conflictSeverity: ConfluenceResult['conflictSeverity'] = 'LOW';
    const contradictionRatio = contradictions.length / (allFactors.length || 1);
    if (contradictionRatio > 0.4) {
      conflictSeverity = 'CRITICAL';
    } else if (contradictionRatio > 0.25) {
      conflictSeverity = 'HIGH';
    } else if (contradictionRatio > 0.15) {
      conflictSeverity = 'MODERATE';
    }
    
    return {
      totalScore: Math.min(100, Math.round(normalizedTotal)),
      zoneWeightScore: Math.min(100, Math.round(normalizedZone)),
      supportingScore: Math.min(100, Math.round(normalizedSupporting)),
      zoneWeightPercentage: normalizedTotal > 0 ? Math.round((normalizedZone / normalizedTotal) * 100) : 0,
      factors: allFactors,
      dominantAction,
      contradictions,
      conflictSeverity,
    };
  }, []);

  // ---- Persistence Check ----
  const checkPersistence = useCallback((
    confluence: ConfluenceResult,
    previousState: MarketState,
    ticksMap: Map<string, number>,
    requiredTicks: number
  ): boolean => {
    if (confluence.dominantAction === 'HOLD') return false;
    
    const key = `${confluence.dominantAction}_${previousState}`;
    const currentTicks = ticksMap.get(key) || 0;
    
    return currentTicks >= requiredTicks;
  }, []);

  // ---- Determine Market State ----
  const determineState = useCallback((
    price: number,
    primaryZone: ZoneCluster | ManualDailyZone | null,
    confluence: ConfluenceResult,
    ema200Trend: MarketStructure,
    manualZone: ManualDailyZone | null
  ): MarketState => {
    const distToZone = primaryZone 
      ? 'midpoint' in primaryZone 
        ? Math.abs(price - primaryZone.midpoint)
        : Math.abs(price - (primaryZone.zoneMin + primaryZone.zoneMax) / 2)
      : Infinity;
    
    const inZone = primaryZone
      ? 'midpoint' in primaryZone
        ? price >= primaryZone.priceMin && price <= primaryZone.priceMax
        : price >= primaryZone.zoneMin && price <= primaryZone.zoneMax
      : false;
    
    // Check if manual zone direction aligns with EMA200
    const manualDirection = manualZone?.direction;
    const trendAligned = manualDirection 
      ? (manualDirection === 'BUY' && ema200Trend === 'BULLISH') ||
        (manualDirection === 'SELL' && ema200Trend === 'BEARISH')
      : true;
    
    // State machine logic
    if (!primaryZone || distToZone > config.zoneProximityThreshold * 2) {
      return 'WAITING';
    }
    
    if (distToZone <= config.zoneProximityThreshold * 2 && distToZone > config.zoneEntryThreshold) {
      return 'APPROACHING_ZONE';
    }
    
    if (inZone) {
      if (confluence.totalScore >= 80 && confluence.zoneWeightPercentage >= 50 && trendAligned) {
        return 'HIGH_CONFLUENCE';
      }
      if (confluence.totalScore >= 60) {
        return 'CONFIRMATION';
      }
      if (confluence.totalScore >= 40) {
        return 'ANALYZING';
      }
      return 'IN_ZONE';
    }
    
    // Price approaching but not in zone
    if (confluence.totalScore >= 50) {
      return 'ENTERING_ZONE';
    }
    
    return 'APPROACHING_ZONE';
  }, [config.zoneProximityThreshold, config.zoneEntryThreshold]);

  // ---- Main Engine Update ----
  const updateEngine = useCallback(() => {
    const price = marketData.price;
    
    if (price <= 0) return;
    
    // Update price history
    priceHistoryRef.current = [...priceHistoryRef.current.slice(-500), price];
    
    // Calculate EMAs
    const ema200 = calculateEMA(priceHistoryRef.current, config.ema200Period);
    const ema50 = calculateEMA(priceHistoryRef.current, 50);
    
    // Gate 0 evaluation
    const gate0 = evaluateGate0(price, ema200);
    
    // Data quality
    const dataQuality = assessDataQuality(marketData);
    
    // Detect zones
    const detectedZones = detectZones(
      price,
      priceHistoryRef.current,
      { bids: marketData.bids, asks: marketData.asks },
      marketData.recentTrades
    );
    
    // Cluster zones
    const clusters = clusterZones(detectedZones);
    
    // Calculate distances
    const { clusters: updatedClusters, primary } = calculateZoneDistances(
      clusters,
      engineState.manualZone,
      price
    );
    
    // Analyze structure
    const structure = analyzeMarketStructure(
      price,
      priceHistoryRef.current,
      ema200,
      ema50
    );
    
    // Build signal factors
    const factors = buildSignalFactors(
      marketData,
      structure,
      updatedClusters,
      engineState.manualZone,
      price,
      ema200
    );
    
    // Calculate confluence
    const confluence = calculateConfluence(factors, updatedClusters, engineState.manualZone);
    
    // Determine state
    const newState = determineState(
      price,
      primary,
      confluence,
      gate0.trend,
      engineState.manualZone
    );
    
    // Update persistence tracking
    const ticksMap = new Map(consecutiveTicksRef.current);
    const persistenceKey = `${confluence.dominantAction}_${newState}`;
    const currentTicks = ticksMap.get(persistenceKey) || 0;
    
    if (confluence.dominantAction !== 'HOLD') {
      ticksMap.set(persistenceKey, currentTicks + 1);
    } else {
      // Reset counter if no clear direction
      ticksMap.delete(persistenceKey);
    }
    consecutiveTicksRef.current = ticksMap;
    
    // Check persistence
    const persistenceMet = checkPersistence(
      confluence,
      newState,
      ticksMap,
      config.persistence.zoneWindow
    );
    
    // Determine if tradeable
    const gate0Passed = gate0.trend === 'NEUTRAL' || 
      (engineState.manualZone?.direction === 'BUY' && gate0.trend === 'BULLISH') ||
      (engineState.manualZone?.direction === 'SELL' && gate0.trend === 'BEARISH');
    
    const zoneWeightMet = confluence.zoneWeightPercentage >= config.minZoneWeightPercentage;
    const thresholdMet = confluence.totalScore >= config.minConfluenceThreshold;
    
    const isTradeable = 
      gate0Passed && 
      zoneWeightMet && 
      thresholdMet && 
      persistenceMet &&
      ['CONFIRMATION', 'HIGH_CONFLUENCE'].includes(newState);
    
    // Build warnings
    const warnings: string[] = [];
    if (!gate0Passed) warnings.push('Direction conflicts with EMA200 trend');
    if (!zoneWeightMet) warnings.push(`Zone weight ${confluence.zoneWeightPercentage}% below ${config.minZoneWeightPercentage}% minimum`);
    if (!thresholdMet) warnings.push(`Confluence ${confluence.totalScore}% below ${config.minConfluenceThreshold}% threshold`);
    if (!persistenceMet) warnings.push('Signal not yet persistent');
    if (dataQuality.overall < 70) warnings.push(`Low data quality: ${dataQuality.overall}%`);
    if (confluence.conflictSeverity === 'HIGH' || confluence.conflictSeverity === 'CRITICAL') {
      warnings.push(`High conflict severity: ${confluence.conflictSeverity}`);
    }
    if (engineState.manualZone?.ema200Conflict) {
      warnings.push('Manual zone direction conflicts with EMA200');
    }
    
    // Build decision
    const decision: MarketContextDecision = {
      state: newState,
      contextScore: confluence.totalScore,
      calibratedProbability: null,
      confidence: confluence.totalScore >= 80 ? 'VERY_HIGH' : 
                  confluence.totalScore >= 60 ? 'HIGH' :
                  confluence.totalScore >= 40 ? 'MEDIUM' : 'LOW',
      gate0Passed,
      gate0Trend: gate0.trend,
      zoneWeightMet,
      thresholdMet,
      persistenceMet,
      primaryZone: primary,
      nearbyZones: detectedZones,
      zoneClusters: updatedClusters,
      structure,
      confluence,
      dataQuality,
      manualZone: engineState.manualZone,
      stateHistory: engineState.stateHistory,
      timestamp: Date.now(),
      isTradeable,
      warnings,
    };
    
    // Update state history if state changed
    let stateHistory = engineState.stateHistory;
    if (newState !== engineState.state) {
      stateHistory = [
        ...stateHistory.slice(-20),
        {
          from: engineState.state,
          to: newState,
          trigger: 'Tick Update',
          timestamp: Date.now(),
          reason: `Price: ${price.toFixed(2)}, Score: ${confluence.totalScore}%`,
        },
      ];
      lastStateChangeRef.current = Date.now();
    }
    
    setEngineState({
      decision,
      manualZone: engineState.manualZone,
      activeZones: detectedZones,
      zoneClusters: updatedClusters,
      state: newState,
      persistenceWindows: new Map(),
      stateHistory,
      lastPrice: price,
      priceHistory: priceHistoryRef.current,
      ema200Value: ema200,
      ema50Value: ema50,
      dataQuality,
      isInitialized: true,
    });
  }, [
    marketData,
    config,
    engineState.manualZone,
    engineState.state,
    engineState.stateHistory,
    calculateEMA,
    evaluateGate0,
    assessDataQuality,
    detectZones,
    clusterZones,
    calculateZoneDistances,
    analyzeMarketStructure,
    buildSignalFactors,
    calculateConfluence,
    determineState,
    checkPersistence,
  ]);

  // ---- Run engine on data updates ----
  useEffect(() => {
    if (marketData.price > 0) {
      updateEngine();
    }
  }, [marketData.price, marketData.volumeDelta, marketData.buyersPercent, updateEngine]);

  // ---- Convert engine decision to UI format ----
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
    
    // Map our factors to UI format
    const buyFactors = decision.confluence.factors.filter(f => f.action === 'BUY');
    const sellFactors = decision.confluence.factors.filter(f => f.action === 'SELL');
    const neutralFactors = decision.confluence.factors.filter(f => f.action === 'HOLD');
    
    // Calculate weighted counts
    const buyScore = buyFactors.reduce((sum, f) => sum + f.weight, 0);
    const sellScore = sellFactors.reduce((sum, f) => sum + f.weight, 0);
    const totalScore = buyScore + sellScore + neutralFactors.reduce((sum, f) => sum + f.weight, 0);
    
    // Determine verdict based on contextual rules, not just counts
    let verdict: string;
    if (decision.state === 'WAITING') {
      verdict = 'MONITORING';
    } else if (decision.state === 'APPROACHING_ZONE') {
      verdict = 'APPROACHING';
    } else if (decision.state === 'IN_ZONE' || decision.state === 'ANALYZING') {
      verdict = 'ANALYZING';
    } else if (decision.isTradeable && decision.confluence.zoneWeightPercentage >= 50) {
      if (decision.confluence.totalScore >= 85) {
        verdict = 'STRONG BUY';
      } else if (decision.confluence.totalScore >= 75) {
        verdict = 'BUY';
      } else {
        verdict = 'SETUP';
      }
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
    // Method to update manual zone
    setManualZone: (zone: ManualDailyZone) => {
      // Check EMA200 alignment
      const ema200 = engineState.ema200Value;
      const price = engineState.lastPrice;
      
      let ema200Aligned = true;
      let ema200Conflict = false;
      
      if (ema200 && price > 0) {
        const priceAboveEma = price > ema200;
        const zoneDirection = zone.direction;
        
        ema200Aligned = (zoneDirection === 'BUY' && priceAboveEma) || 
                        (zoneDirection === 'SELL' && !priceAboveEma);
        ema200Conflict = !ema200Aligned;
      }
      
      const updatedZone = { ...zone, ema200Aligned, ema200Conflict };
      
      setEngineState(prev => ({
        ...prev,
        manualZone: updatedZone,
      }));
      
      // Save to localStorage
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