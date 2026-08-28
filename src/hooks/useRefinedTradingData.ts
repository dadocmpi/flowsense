import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TwelveDataState, 
  SUPPORTED_ASSETS, 
  IndicatorSignal, 
  IndicatorSummary, 
  OrderBookLevel, 
  TradeFeedItem,
  RealOrderBookLevel,
  LiveTrade,
} from '../types/trading';

// ---- Technical Indicator Calculations ----
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

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

  // RSI
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

  // Add individual EMAs
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

// ---- Summary Builder ----
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

// ---- Main Hook ----
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
  
  // Volume tracking with persistence for anti-flicker
  const volumeAccumulatorRef = useRef<{ buyers: number; sellers: number }>({ buyers: 0, sellers: 0 });
  const tradeHistoryRef = useRef<{ price: number; size: number; isBuyer: boolean; time: number }[]>([]);
  const lastTradeTimeRef = useRef<number>(0);
  
  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Get asset config
  const activeConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];
  const precision = activeConfig.precision;
  const binanceSymbol = activeConfig.binanceSymbol || 'PAXGUSDT';

  // Initialize with historical data
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        // Fetch historical klines
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

          // Get 24h ticker data
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
            // Fallback without 24h data
            setState(prev => ({
              ...prev,
              symbol: selectedSymbol,
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
        
        // Generate fallback data
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
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    let reconnectDelay = 1000;

    const connectWebSocket = () => {
      // Use combined streams for efficiency
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
          
          // Handle different message types
          if (msg.e === '24hrTicker') {
            // 24hr ticker update
            const newPrice = parseFloat(msg.c);
            
            // Update price history (keep last 500)
            priceHistoryRef.current = [...priceHistoryRef.current.slice(-499), newPrice];
            
            // Recalculate indicators
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
            // Depth update
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
            
            // Calculate percentages
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
            // Aggregate trade - actual executed trade
            const tradePrice = parseFloat(msg.p);
            const tradeSize = parseFloat(msg.q);
            const isBuyerMaker = msg.m; // true = sell order was taker, false = buy order was taker
            
            // Update volume accumulator (with decay to prevent stale data)
            const now = Date.now();
            const timeSinceLastTrade = now - lastTradeTimeRef.current;
            
            // If more than 5 seconds since last trade, reset accumulator
            if (timeSinceLastTrade > 5000) {
              volumeAccumulatorRef.current = { buyers: 0, sellers: 0 };
            }
            
            lastTradeTimeRef.current = now;
            
            // isBuyerMaker = true means the aggressor was a seller (sell order filled)
            // isBuyerMaker = false means the aggressor was a buyer (buy order filled)
            if (isBuyerMaker) {
              volumeAccumulatorRef.current.sellers += tradeSize;
            } else {
              volumeAccumulatorRef.current.buyers += tradeSize;
            }
            
            // Add to trade history
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
            
            // Update trade history (keep last 50)
            tradeHistoryRef.current = [...tradeHistoryRef.current.slice(-49), {
              price: tradePrice,
              size: tradeSize,
              isBuyer: !isBuyerMaker,
              time: now,
            }];
            
            // Calculate buyers/sellers percentage with smoothing
            const totalVol = volumeAccumulatorRef.current.buyers + volumeAccumulatorRef.current.sellers || 1;
            const buyersPct = Math.round((volumeAccumulatorRef.current.buyers / totalVol) * 100);
            const sellersPct = 100 - buyersPct;
            
            // Calculate volume delta with persistence
            const delta = Math.round(volumeAccumulatorRef.current.buyers - volumeAccumulatorRef.current.sellers);
            
            // Determine institutional pressure
            let instPressure: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'LOW';
            const absDelta = Math.abs(delta);
            if (absDelta > 500) instPressure = 'EXTREME';
            else if (absDelta > 200) instPressure = 'HIGH';
            else if (absDelta > 50) instPressure = 'MEDIUM';
            
            setState(prev => ({
              ...prev,
              buyersPercent: buyersPct,
              sellersPercent: sellersPct,
              volumeDelta: delta,
              institutionalPressure: instPressure,
              recentTrades: [trade, ...prev.recentTrades.slice(0, 49)],
            }));
          }
        } catch (e) {
          // Silent fail on parse error
        }
      };

      ws.onerror = () => {
        // Will trigger onclose
      };

      ws.onclose = () => {
        setState(prev => ({ ...prev, isLive: false }));
        
        // Attempt reconnection
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