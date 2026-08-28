import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TwelveDataState, 
  SUPPORTED_ASSETS, 
  IndicatorSignal, 
  IndicatorSummary, 
  OrderBookLevel, 
  TradeFeedItem,
} from '../types/trading';
import { 
  calculateRSI, 
  calculateEMA, 
  calculateSMA, 
  calculateBollingerPosition 
} from '../utils/indicators';

// ---- Signal Builder ----
function buildIndicatorSignals(
  prices: number[],
  currentPrice: number,
  precision: number
): {
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  orderFlowIndicators: IndicatorSignal[];
} {
  const oscillators: IndicatorSignal[] = [];
  const movingAverages: IndicatorSignal[] = [];
  const orderFlowIndicators: IndicatorSignal[] = [];

  // RSI — using the robust version that never returns 0.0 or 100.0
  const rsi = calculateRSI(prices, 14);
  oscillators.push({
    name: 'RSI (14)',
    value: rsi.toFixed(1),
    action: rsi > 70 ? 'STRONG SELL' : rsi > 60 ? 'SELL' : rsi < 30 ? 'STRONG BUY' : rsi < 40 ? 'BUY' : 'NEUTRAL',
  });

  // MACD
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdVal = ema12 - ema26;
  const signalLine = calculateEMA(prices.slice(-20), 9);
  const histogram = macdVal - signalLine;

  oscillators.push({
    name: 'MACD (12, 26)',
    value: `${macdVal >= 0 ? '+' : ''}${macdVal.toFixed(2)}`,
    action: histogram > 0 ? 'BUY' : histogram < 0 ? 'SELL' : 'NEUTRAL',
  });

  // Momentum
  const momentum = prices.length >= 10 ? prices[prices.length - 1] - prices[prices.length - 10] : 0;
  oscillators.push({
    name: 'Price Momentum',
    value: `${momentum >= 0 ? '+' : ''}${momentum.toFixed(2)}`,
    action: momentum > 1 ? 'STRONG BUY' : momentum > 0 ? 'BUY' : momentum < -1 ? 'STRONG SELL' : momentum < 0 ? 'SELL' : 'NEUTRAL',
  });

  // Bollinger Bands
  const sma20 = calculateSMA(prices, 20);
  const stdDev = Math.sqrt(prices.slice(-20).reduce((sq, n) => sq + Math.pow(n - sma20, 2), 0) / 20) || 1;
  const bbUpper = sma20 + stdDev * 2;
  const bbLower = sma20 - stdDev * 2;

  oscillators.push({
    name: 'Bands de Bollinger',
    value: currentPrice > bbUpper ? 'Sobrecomprado' : currentPrice < bbLower ? 'Sobrevendido' : 'Dentro da Banda',
    action: currentPrice > bbUpper ? 'SELL' : currentPrice < bbLower ? 'BUY' : 'NEUTRAL',
  });

  // Moving Averages
  const periods = [10, 20, 50, 100, 200];
  const emaValues: { period: number; value: number; action: string }[] = [];

  periods.forEach(period => {
    const ema = calculateEMA(prices, period);
    emaValues.push({ period, value: ema, action: currentPrice > ema ? 'BUY' : 'SELL' });
  });

  emaValues.forEach(({ period, value, action }) => {
    const label = period === 200 ? 'EMA 200 (Institutional Base)' :
                  period === 100 ? 'EMA 100 (Major Trend)' :
                  period === 50 ? 'EMA 50 (Trend Line)' :
                  period === 20 ? 'EMA 20 (Fast)' : 'EMA 10 (Quick)';
    
    movingAverages.push({
      name: `EMA ${period}`,
      value: value.toFixed(precision),
      action: action as IndicatorSignal['action'],
    });
  });

  // EMA Cloud analysis
  const ema10 = calculateEMA(prices, 10);
  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);
  const ema200 = calculateEMA(prices, 200);

  let emaCloudAction: IndicatorSignal['action'] = 'NEUTRAL';
  if (currentPrice > ema200 && currentPrice > ema50 && currentPrice > ema20) {
    emaCloudAction = 'STRONG BUY';
  } else if (currentPrice < ema200 && currentPrice < ema50 && currentPrice < ema20) {
    emaCloudAction = 'STRONG SELL';
  } else if (currentPrice > ema200 || currentPrice > ema50) {
    emaCloudAction = 'BUY';
  } else if (currentPrice < ema200 || currentPrice < ema50) {
    emaCloudAction = 'SELL';
  }

  orderFlowIndicators.push({
    name: 'EMA Cloud Analysis',
    value: `${ema10 > ema20 ? 'Bullish Stack' : 'Bearish Stack'}`,
    action: emaCloudAction,
  });

  return { oscillators, movingAverages, orderFlowIndicators };
}

function buildSummary(signals: IndicatorSignal[]): IndicatorSummary {
  let buy = 0;
  let neutral = 0;
  let sell = 0;

  signals.forEach(s => {
    if (s.action.includes('STRONG BUY')) buy += 2;
    else if (s.action === 'BUY') buy += 1;
    else if (s.action.includes('STRONG SELL')) sell += 2;
    else if (s.action === 'SELL') sell += 1;
    else neutral += 1;
  });

  const totalWeight = buy + neutral + sell || 1;
  const score = Math.max(5, Math.min(95, Math.round((buy / totalWeight) * 100)));

  let verdict: IndicatorSummary['verdict'] = 'NEUTRAL';
  if (score >= 75) verdict = 'STRONG BUY';
  else if (score >= 55) verdict = 'BUY';
  else if (score <= 25) verdict = 'STRONG SELL';
  else if (score <= 45) verdict = 'SELL';

  return { buyCount: buy, neutralCount: neutral, sellCount: sell, score, verdict };
}

export const useRefinedTradingData = (selectedSymbol = 'MGC1!') => {
  const [state, setState] = useState<TwelveDataState>({
    symbol: 'MGC1!',
    price: 2954.80,
    change: 14.20,
    percentChange: 0.48,
    high: 2965.20,
    low: 2940.10,
    open: 2940.60,
    previousClose: 2940.60,
    datetime: new Date().toLocaleTimeString(),
    isLive: false,
    isMarketOpen: true,
    oscillators: [],
    movingAverages: [],
    orderFlowIndicators: [],
    buyersPercent: 50,
    sellersPercent: 50,
    volumeDelta: 0,
    institutionalPressure: 'LOW',
    bids: [],
    asks: [],
    recentTrades: [],
    overallSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    oscillatorsSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    maSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    orderFlowSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
  });

  const priceHistoryRef = useRef<number[]>([]);
  const volumeAccumulatorRef = useRef<{ buyers: number; sellers: number }>({ buyers: 0, sellers: 0 });
  const tradeHistoryRef = useRef<{ price: number; size: number; isBuyer: boolean; time: number }[]>([]);
  const lastTradeTimeRef = useRef<number>(0);
  
  // SMOOTHED buyers/sellers percentage — these are what the UI displays
  const smoothedBuyersPctRef = useRef<number>(50);
  const smoothedSellersPctRef = useRef<number>(50);
  const smoothedDeltaRef = useRef<number>(0);
  
  // Maximum allowed change per update cycle (percentage points)
  const MAX_PCT_CHANGE_PER_UPDATE = 5;
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const activeConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];
  const precision = activeConfig.precision;
  const binanceSymbol = activeConfig.binanceSymbol || 'PAXGUSDT';

  // Initialize with historical data
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1m&limit=200`
        );
        
        if (!response.ok) throw new Error('Failed to fetch klines');
        
        const data = await response.json();
        
        if (Array.isArray(data) && isMounted) {
          const closes = data.map((k: any[]) => parseFloat(k[4]));
          priceHistoryRef.current = closes;
          
          const currentPrice = closes[closes.length - 1];
          const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(closes, currentPrice, precision);
          
          const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];
          const overallSummary = buildSummary(allSignals);
          const oscillatorsSummary = buildSummary(oscillators);
          const maSummary = buildSummary(movingAverages);
          const orderFlowSummary = buildSummary(orderFlowIndicators);

          try {
            const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`);
            const tickerData = await tickerRes.json();
            
            setState(prev => ({
              ...prev,
              symbol: selectedSymbol,
              price: parseFloat(tickerData.lastPrice),
              change: parseFloat(tickerData.priceChange),
              percentChange: parseFloat(tickerData.priceChangePercent),
              high: parseFloat(tickerData.highPrice),
              low: parseFloat(tickerData.lowPrice),
              open: parseFloat(tickerData.openPrice),
              previousClose: parseFloat(tickerData.prevClosePrice),
              isLive: false,
              oscillators,
              movingAverages,
              orderFlowIndicators,
              overallSummary,
              oscillatorsSummary,
              maSummary,
              orderFlowSummary,
            }));
          } catch {
            setState(prev => ({
              ...prev,
              symbol: selectedAsset,
              price: currentPrice,
              high: Math.max(...closes.slice(-60)),
              low: Math.min(...closes.slice(-60)),
              isLive: false,
              oscillators,
              movingAverages,
              orderFlowIndicators,
              overallSummary,
              oscillatorsSummary,
              maSummary,
              orderFlowSummary,
            }));
          }
        }
      } catch (err) {
        console.error('Error loading initial data:', err);
        
        if (isMounted) {
          const fallback = Array.from({ length: 100 }, (_, i) => 
            2950 + Math.sin(i / 5) * 5 + (Math.random() - 0.5) * 2 + i * 0.05
          );
          priceHistoryRef.current = fallback;
          
          const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(
            fallback, 
            fallback[fallback.length - 1], 
            precision
          );
          
          const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];
          
          setState(prev => ({
            ...prev,
            symbol: selectedSymbol,
            price: fallback[fallback.length - 1],
            isLive: false,
            isMarketOpen: true,
            oscillators,
            movingAverages,
            orderFlowIndicators,
            overallSummary: buildSummary(allSignals),
            oscillatorsSummary: buildSummary(oscillators),
            maSummary: buildSummary(movingAverages),
            orderFlowSummary: buildSummary(orderFlowIndicators),
          }));
        }
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [selectedSymbol, binanceSymbol, precision]);

  // WebSocket connection
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    let reconnectDelay = 1000;

    const connectWebSocket = () => {
      const streams = [
        `${binanceSymbol.toLowerCase()}@ticker`,
        `${binanceSymbol.toLowerCase()}@depth10@100ms`,
        `${binanceSymbol.toLowerCase()}@aggTrade`,
      ].join('/');

      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        reconnectDelay = 1000;
        
        setState(prev => ({ ...prev, isLive: true }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.e === '24hrTicker') {
            const newPrice = parseFloat(msg.c);
            
            priceHistoryRef.current = [...priceHistoryRef.current.slice(-499), newPrice];
            
            const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(
              priceHistoryRef.current,
              newPrice,
              precision
            );
            
            const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];
            
            setState(prev => ({
              ...prev,
              price: newPrice,
              change: parseFloat(msg.p),
              percentChange: parseFloat(msg.P),
              high: parseFloat(msg.h),
              low: parseFloat(msg.l),
              datetime: new Date().toLocaleTimeString(),
              isLive: true,
              oscillators,
              movingAverages,
              orderFlowIndicators,
              overallSummary: buildSummary(allSignals),
              oscillatorsSummary: buildSummary(oscillators),
              maSummary: buildSummary(movingAverages),
              orderFlowSummary: buildSummary(orderFlowIndicators),
            }));
          }
          
          else if (msg.bids && msg.asks) {
            let maxSize = 0;
            
            const newBids: OrderBookLevel[] = msg.bids.slice(0, 10).map((b: string[], idx: number) => {
              const size = parseFloat(b[1]);
              if (size > maxSize) maxSize = size;
              return {
                price: parseFloat(b[0]),
                size,
                cumulativeSize: 0,
                percentage: 0,
              };
            });
            
            const newAsks: OrderBookLevel[] = msg.asks.slice(0, 10).map((a: string[]) => {
              const size = parseFloat(a[1]);
              if (size > maxSize) maxSize = size;
              return {
                price: parseFloat(a[0]),
                size,
                cumulativeSize: 0,
                percentage: 0,
              };
            });
            
            const finalBids = newBids.map(b => ({
              ...b,
              percentage: Math.min(100, (b.size / (maxSize || 1)) * 100),
            }));
            
            const finalAsks = newAsks.map(a => ({
              ...a,
              percentage: Math.min(100, (a.size / (maxSize || 1)) * 100),
            }));
            
            setState(prev => ({
              ...prev,
              bids: finalBids,
              asks: finalAsks,
            }));
          }
          
          else if (msg.e === 'aggTrade') {
            const tradePrice = parseFloat(msg.p);
            const tradeSize = parseFloat(msg.q);
            const isBuyerMaker = msg.m;
            
            const now = Date.now();
            const timeSinceLastTrade = now - lastTradeTimeRef.current;
            
            if (timeSinceLastTrade > 5000) {
              volumeAccumulatorRef.current = { buyers: 0, sellers: 0 };
            }
            
            lastTradeTimeRef.current = now;
            
            if (isBuyerMaker) {
              volumeAccumulatorRef.current.sellers += tradeSize;
            } else {
              volumeAccumulatorRef.current.buyers += tradeSize;
            }
            
            const time = new Date(msg.T);
            const timeStr = time.toTimeString().split(' ')[0] + '.' + Math.floor(time.getMilliseconds() / 100);
            
            const trade: TradeFeedItem = {
              id: String(msg.a),
              price: tradePrice,
              size: tradeSize,
              time: timeStr,
              type: isBuyerMaker ? 'SELL' : 'BUY',
              aggressor: isBuyerMaker ? 'SELL_AGGR' : 'BUY_AGGR',
            };
            
            tradeHistoryRef.current = [...tradeHistoryRef.current.slice(-49), {
              price: tradePrice,
              size: tradeSize,
              isBuyer: !isBuyerMaker,
              time: now,
            }];
            
            // Raw (unsmoothed) percentages from the accumulator
            const totalVol = volumeAccumulatorRef.current.buyers + volumeAccumulatorRef.current.sellers || 1;
            const rawBuyersPct = Math.round((volumeAccumulatorRef.current.buyers / totalVol) * 100);
            const rawSellersPct = 100 - rawBuyersPct;
            const rawDelta = Math.round(volumeAccumulatorRef.current.buyers - volumeAccumulatorRef.current.sellers);
            
            // APPLY CHANGE-CAP SMOOTHING
            // The UI is only ever fed the smoothed value, not the raw one.
            // Max change per update = MAX_PCT_CHANGE_PER_UPDATE percentage points.
            const buyersDelta = rawBuyersPct - smoothedBuyersPctRef.current;
            const clampedBuyersDelta = Math.max(-MAX_PCT_CHANGE_PER_UPDATE, Math.min(MAX_PCT_CHANGE_PER_UPDATE, buyersDelta));
            const newSmoothedBuyersPct = Math.round(smoothedBuyersPctRef.current + clampedBuyersDelta);
            const newSmoothedSellersPct = 100 - newSmoothedBuyersPct;
            
            // Same for delta
            const deltaDelta = rawDelta - smoothedDeltaRef.current;
            const clampedDelta = Math.max(-50, Math.min(50, deltaDelta));
            const newSmoothedDelta = Math.round(smoothedDeltaRef.current + clampedDelta);
            
            smoothedBuyersPctRef.current = newSmoothedBuyersPct;
            smoothedSellersPctRef.current = newSmoothedSellersPct;
            smoothedDeltaRef.current = newSmoothedDelta;
            
            // Institutional pressure from smoothed delta
            let instPressure: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'LOW';
            const absDelta = Math.abs(newSmoothedDelta);
            if (absDelta > 500) instPressure = 'EXTREME';
            else if (absDelta > 200) instPressure = 'HIGH';
            else if (absDelta > 50) instPressure = 'MEDIUM';
            
            setState(prev => ({
              ...prev,
              buyersPercent: newSmoothedBuyersPct,    // SMOOTHED
              sellersPercent: newSmoothedSellersPct,  // SMOOTHED
              volumeDelta: newSmoothedDelta,          // SMOOTHED
              institutionalPressure: instPressure,
              recentTrades: [trade, ...prev.recentTrades.slice(0, 49)],
            }));
          }
        } catch (e) {
          // Silent fail
        }
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        setState(prev => ({ ...prev, isLive: false }));
        
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
            connectWebSocket();
          }, reconnectDelay);
        }
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [binanceSymbol, precision]);

  return state;
};