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

  const rsi = calculateRSI(prices, 14);
  oscillators.push({
    name: 'RSI (14)',
    value: rsi.toFixed(1),
    action: rsi > 70 ? 'STRONG SELL' : rsi > 60 ? 'SELL' : rsi < 30 ? 'STRONG BUY' : rsi < 40 ? 'BUY' : 'NEUTRAL',
  });

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

  const momentum = prices.length >= 10 ? prices[prices.length - 1] - prices[prices.length - 10] : 0;
  oscillators.push({
    name: 'Price Momentum',
    value: `${momentum >= 0 ? '+' : ''}${momentum.toFixed(2)}`,
    action: momentum > 1 ? 'STRONG BUY' : momentum > 0 ? 'BUY' : momentum < -1 ? 'STRONG SELL' : momentum < 0 ? 'SELL' : 'NEUTRAL',
  });

  const sma20 = calculateSMA(prices, 20);
  const stdDev = Math.sqrt(prices.slice(-20).reduce((sq, n) => sq + Math.pow(n - sma20, 2), 0) / 20) || 1;
  const bbUpper = sma20 + stdDev * 2;
  const bbLower = sma20 - stdDev * 2;

  oscillators.push({
    name: 'Bands de Bollinger',
    value: currentPrice > bbUpper ? 'Sobrecomprado' : currentPrice < bbLower ? 'Sobrevendido' : 'Dentro da Banda',
    action: currentPrice > bbUpper ? 'SELL' : currentPrice < bbLower ? 'BUY' : 'NEUTRAL',
  });

  const periods = [10, 20, 50, 100, 200];

  periods.forEach(period => {
    const ema = calculateEMA(prices, period);
    const label = period === 200 ? 'EMA 200 (Institutional Base)' :
                  period === 100 ? 'EMA 100 (Major Trend)' :
                  period === 50 ? 'EMA 50 (Trend Line)' :
                  period === 20 ? 'EMA 20 (Fast)' : 'EMA 10 (Quick)';
    
    movingAverages.push({
      name: `EMA ${period}`,
      value: value.toFixed(precision),
      action: currentPrice > ema ? 'BUY' : 'SELL',
    });
  });

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

// Safe numeric helpers — never return NaN
function safeNum(val: number | undefined | null, fallback: number): number {
  if (val === undefined || val === null || isNaN(val) || !isFinite(val)) return fallback;
  return val;
}

function safePercentChange(current: number, prev: number): number {
  if (!current || !prev || current === 0 || prev === 0 || isNaN(current) || isNaN(prev)) return 0;
  const pct = ((current - prev) / prev) * 100;
  return isNaN(pct) || !isFinite(pct) ? 0 : pct;
}

export const useRefinedTradingData = (selectedSymbol = 'MGC1!') => {
  // Track which asset the current data belongs to — prevents stale WS messages
  // from the previous asset leaking in after a switch.
  const activeAssetRef = useRef<string>(selectedSymbol);
  
  // Loading state — true while fetching initial data
  const [isLoading, setIsLoading] = useState(true);
  
  const [state, setState] = useState<TwelveDataState>({
    symbol: selectedSymbol,
    price: 0,
    change: 0,
    percentChange: 0,
    high: 0,
    low: 0,
    open: 0,
    previousClose: 0,
    datetime: '',
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

  // All mutable state lives in refs so they don't cause re-renders
  const priceHistoryRef = useRef<number[]>([]);
  const volumeAccumulatorRef = useRef<{ buyers: number; sellers: number }>({ buyers: 0, sellers: 0 });
  const tradeHistoryRef = useRef<{ price: number; size: number; isBuyer: boolean; time: number }[]>([]);
  const lastTradeTimeRef = useRef<number>(0);
  
  // SMOOTHED buyer/seller values
  const smoothedBuyersPctRef = useRef<number>(50);
  const smoothedSellersPctRef = useRef<number>(50);
  const smoothedDeltaRef = useRef<number>(0);
  
  const MAX_PCT_CHANGE_PER_UPDATE = 5;
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  
  const activeConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];
  const precision = activeConfig.precision;
  const binanceSymbol = activeConfig.binanceSymbol || 'PAXGUSDT';

  // SP500 rescaling constants
  const SP500_REFERENCE = 5200;
  const SP500_BTC_REFERENCE = 65000;
  const SP500_BTC_BETA = 0.25;

  // ---- Cancel any pending reconnect ----
  const cancelReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // ---- Clean disconnect ----
  const disconnect = useCallback(() => {
    cancelReconnect();
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect loop
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [cancelReconnect]);

  // ---- Reset all per-asset state ----
  const resetPerAssetState = useCallback(() => {
    priceHistoryRef.current = [];
    volumeAccumulatorRef.current = { buyers: 0, sellers: 0 };
    tradeHistoryRef.current = [];
    lastTradeTimeRef.current = 0;
    smoothedBuyersPctRef.current = 50;
    smoothedSellersPctRef.current = 50;
    smoothedDeltaRef.current = 0;
    reconnectAttemptRef.current = 0;
    setIsLoading(true);
  }, []);

  // ---- Fetch and apply initial kline data ----
  const loadInitialData = useCallback(async (symbol: string, binanceSym: string, prec: number) => {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=1m&limit=200`
      );
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      if (!Array.isArray(data) || !isMountedRef.current) return;
      
      const closes = data.map((k: any[]) => safeNum(parseFloat(k[4]), 0));
      // CLEAR old price history and set fresh for this asset
      priceHistoryRef.current = closes;
      
      const currentPrice = closes[closes.length - 1] || 0;
      const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(closes, currentPrice, prec);
      
      const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];
      const overallSummary = buildSummary(allSignals);
      const oscillatorsSummary = buildSummary(oscillators);
      const maSummary = buildSummary(movingAverages);
      const orderFlowSummary = buildSummary(orderFlowIndicators);

      // Fetch ticker for 24h stats
      try {
        const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSym}`);
        const tickerData = await tickerRes.json();
        
        let displayPrice = safeNum(parseFloat(tickerData.lastPrice), currentPrice);
        let displayChange = safeNum(parseFloat(tickerData.priceChange), 0);
        let displayPctChange = safeNum(parseFloat(tickerData.priceChangePercent), 0);
        let displayHigh = safeNum(parseFloat(tickerData.highPrice), 0);
        let displayLow = safeNum(parseFloat(tickerData.lowPrice), 0);
        let displayOpen = safeNum(parseFloat(tickerData.openPrice), 0);
        let displayPrevClose = safeNum(parseFloat(tickerData.prevClosePrice), 0);
        
        if (symbol === 'ES1!') {
          const btcPrice = safeNum(parseFloat(tickerData.lastPrice), 0);
          const btcOpen = safeNum(parseFloat(tickerData.openPrice), SP500_BTC_REFERENCE);
          const btcHigh = safeNum(parseFloat(tickerData.highPrice), SP500_BTC_REFERENCE);
          const btcLow = safeNum(parseFloat(tickerData.lowPrice), SP500_BTC_REFERENCE);
          
          const sp500Price = SP500_REFERENCE + (btcPrice - SP500_BTC_REFERENCE) * SP500_BTC_BETA;
          displayPrice = sp500Price;
          displayChange = (btcPrice - btcOpen) * SP500_BTC_BETA;
          displayPctChange = safePercentChange(btcPrice, btcOpen);
          displayHigh = SP500_REFERENCE + (btcHigh - SP500_BTC_REFERENCE) * SP500_BTC_BETA;
          displayLow = SP500_REFERENCE + (btcLow - SP500_BTC_REFERENCE) * SP500_BTC_BETA;
          displayOpen = SP500_REFERENCE + (btcOpen - SP500_BTC_REFERENCE) * SP500_BTC_BETA;
          displayPrevClose = displayOpen;
        }
        
        if (isMountedRef.current) {
          setState({
            symbol,
            price: displayPrice,
            change: displayChange,
            percentChange: displayPctChange,
            high: displayHigh,
            low: displayLow,
            open: displayOpen,
            previousClose: displayPrevClose,
            datetime: new Date().toLocaleTimeString(),
            isLive: false,
            isMarketOpen: true,
            oscillators,
            movingAverages,
            orderFlowIndicators,
            overallSummary,
            oscillatorsSummary,
            maSummary,
            orderFlowSummary,
            buyersPercent: 50,
            sellersPercent: 50,
            volumeDelta: 0,
            institutionalPressure: 'LOW',
            bids: [],
            asks: [],
            recentTrades: [],
          });
          setIsLoading(false);
        }
      } catch {
        if (isMountedRef.current) {
          setState(prev => ({
            ...prev,
            symbol,
            price: currentPrice,
            high: Math.max(...closes.slice(-60)),
            low: Math.min(...closes.slice(-60)),
            isLive: false,
            isMarketOpen: true,
            oscillators,
            movingAverages,
            orderFlowIndicators,
            overallSummary,
            oscillatorsSummary,
            maSummary,
            orderFlowSummary,
          }));
          setIsLoading(false);
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
      if (isMountedRef.current) {
        const fallback = Array.from({ length: 100 }, (_, i) => 
          symbol === 'MGC1!'
            ? 2950 + Math.sin(i / 5) * 5 + (Math.random() - 0.5) * 2 + i * 0.05
            : SP500_REFERENCE + Math.sin(i / 5) * 10 + (Math.random() - 0.5) * 4 + i * 0.1
        );
        priceHistoryRef.current = fallback;
        const lastPrice = fallback[fallback.length - 1];
        const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(fallback, lastPrice, precision);
        const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];
        if (isMountedRef.current) {
          setState(prev => ({
            ...prev,
            symbol,
            price: lastPrice,
            high: Math.max(...fallback.slice(-60)),
            low: Math.min(...fallback.slice(-60)),
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
          setIsLoading(false);
        }
      }
    }
  }, [precision]);

  // ---- When asset changes: reset state, disconnect old WS, load new data ----
  useEffect(() => {
    isMountedRef.current = true;
    resetPerAssetState();
    disconnect();
    
    // Mark this ref immediately so stale WS messages are dropped
    activeAssetRef.current = selectedSymbol;
    
    loadInitialData(selectedSymbol, binanceSymbol, precision);

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [selectedSymbol, binanceSymbol, precision, loadInitialData, disconnect, resetPerAssetState]);

  // ---- WebSocket live feed ----
  useEffect(() => {
    // Wait for initial load to finish before connecting WS
    if (isLoading) return;
    
    let reconnectDelay = 1000;
    const MAX_DELAY = 15000;

    const connectWebSocket = () => {
      if (!isMountedRef.current) return;
      
      const streams = [
        `${binanceSymbol.toLowerCase()}@ticker`,
        `${binanceSymbol.toLowerCase()}@depth10@100ms`,
        `${binanceSymbol.toLowerCase()}@aggTrade`,
      ].join('/');

      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        reconnectDelay = 1000;
        if (isMountedRef.current) {
          setState(prev => ({ ...prev, isLive: true }));
        }
      };

      ws.onmessage = (event) => {
        // DROP messages from the wrong asset (race condition on fast switch)
        if (!isMountedRef.current || activeAssetRef.current !== selectedSymbol) return;
        
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.e === '24hrTicker') {
            const newBtcPrice = safeNum(parseFloat(msg.c), 0);
            
            let displayPrice = newBtcPrice;
            if (selectedSymbol === 'ES1!') {
              displayPrice = SP500_REFERENCE + (newBtcPrice - SP500_BTC_REFERENCE) * SP500_BTC_BETA;
            }
            
            // Only append if not a duplicate (WS can send the same tick twice)
            const lastPrice = priceHistoryRef.current[priceHistoryRef.current.length - 1];
            if (displayPrice !== lastPrice) {
              priceHistoryRef.current = [...priceHistoryRef.current.slice(-499), displayPrice];
            }
            
            const prices = priceHistoryRef.current;
            if (prices.length < 2) return;
            
            const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(
              prices, displayPrice, precision
            );
            
            const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];
            
            // Safe ticker fields
            const tickerChange = safeNum(parseFloat(msg.p), 0);
            const tickerPct = safeNum(parseFloat(msg.P), 0);
            const tickerHigh = safeNum(parseFloat(msg.h), 0);
            const tickerLow = safeNum(parseFloat(msg.l), 0);
            
            if (isMountedRef.current && activeAssetRef.current === selectedSymbol) {
              setState(prev => ({
                ...prev,
                price: displayPrice,
                change: selectedSymbol === 'ES1!' ? tickerChange * SP500_BTC_BETA : tickerChange,
                percentChange: selectedSymbol === 'ES1!' ? tickerPct : tickerPct,
                high: selectedSymbol === 'ES1!' ? tickerHigh * SP500_BTC_BETA : tickerHigh,
                low: selectedSymbol === 'ES1!' ? tickerLow * SP500_BTC_BETA : tickerLow,
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
          }
          
          else if (msg.bids && msg.asks) {
            let maxSize = 0;
            
            const newBids: OrderBookLevel[] = msg.bids.slice(0, 10).map((b: string[]) => {
              const size = safeNum(parseFloat(b[1]), 0);
              if (size > maxSize) maxSize = size;
              return { price: safeNum(parseFloat(b[0]), 0), size, cumulativeSize: 0, percentage: 0 };
            });
            
            const newAsks: OrderBookLevel[] = msg.asks.slice(0, 10).map((a: string[]) => {
              const size = safeNum(parseFloat(a[1]), 0);
              if (size > maxSize) maxSize = size;
              return { price: safeNum(parseFloat(a[0]), 0), size, cumulativeSize: 0, percentage: 0 };
            });
            
            const finalBids = newBids.map(b => ({
              ...b,
              percentage: maxSize > 0 ? Math.min(100, (b.size / maxSize) * 100) : 0,
            }));
            
            const finalAsks = newAsks.map(a => ({
              ...a,
              percentage: maxSize > 0 ? Math.min(100, (a.size / maxSize) * 100) : 0,
            }));
            
            if (isMountedRef.current && activeAssetRef.current === selectedSymbol) {
              setState(prev => ({ ...prev, bids: finalBids, asks: finalAsks }));
            }
          }
          
          else if (msg.e === 'aggTrade') {
            const tradePrice = safeNum(parseFloat(msg.p), 0);
            const tradeSize = safeNum(parseFloat(msg.q), 0);
            const isBuyerMaker = Boolean(msg.m);
            
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
            
            const time = new Date(safeNum(msg.T, now));
            const timeStr = time.toTimeString().split(' ')[0] + '.' + Math.floor(time.getMilliseconds() / 100);
            
            const trade: TradeFeedItem = {
              id: String(safeNum(msg.a, now)),
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
            
            const totalVol = volumeAccumulatorRef.current.buyers + volumeAccumulatorRef.current.sellers || 1;
            const rawBuyersPct = Math.round((volumeAccumulatorRef.current.buyers / totalVol) * 100);
            const rawSellersPct = 100 - rawBuyersPct;
            const rawDelta = Math.round(volumeAccumulatorRef.current.buyers - volumeAccumulatorRef.current.sellers);
            
            // Cap change at MAX_PCT_CHANGE_PER_UPDATE
            const buyersDelta = rawBuyersPct - smoothedBuyersPctRef.current;
            const clampedBuyersDelta = Math.max(-MAX_PCT_CHANGE_PER_UPDATE, Math.min(MAX_PCT_CHANGE_PER_UPDATE, buyersDelta));
            const newSmoothedBuyersPct = Math.max(0, Math.min(100, smoothedBuyersPctRef.current + clampedBuyersDelta));
            const newSmoothedSellersPct = 100 - newSmoothedBuyersPct;
            
            const deltaDelta = rawDelta - smoothedDeltaRef.current;
            const clampedDelta = Math.max(-50, Math.min(50, deltaDelta));
            const newSmoothedDelta = smoothedDeltaRef.current + clampedDelta;
            
            smoothedBuyersPctRef.current = newSmoothedBuyersPct;
            smoothedSellersPctRef.current = newSmoothedSellersPct;
            smoothedDeltaRef.current = newSmoothedDelta;
            
            let instPressure: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'LOW';
            const absDelta = Math.abs(newSmoothedDelta);
            if (absDelta > 500) instPressure = 'EXTREME';
            else if (absDelta > 200) instPressure = 'HIGH';
            else if (absDelta > 50) instPressure = 'MEDIUM';
            
            if (isMountedRef.current && activeAssetRef.current === selectedSymbol) {
              setState(prev => ({
                ...prev,
                buyersPercent: newSmoothedBuyersPct,
                sellersPercent: newSmoothedSellersPct,
                volumeDelta: newSmoothedDelta,
                institutionalPressure: instPressure,
                recentTrades: [trade, ...prev.recentTrades.slice(0, 49)],
              }));
            }
          }
        } catch (e) {
          // Drop parse errors silently
        }
      };

      ws.onerror = () => {
        // Let onclose handle reconnect
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        
        setState(prev => ({ ...prev, isLive: false }));
        
        // NO CAP — keep reconnecting forever with cap on delay
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptRef.current++;
          reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_DELAY);
          connectWebSocket();
        }, reconnectDelay);
      };
    };

    connectWebSocket();

    return () => {
      disconnect();
    };
  }, [binanceSymbol, precision, selectedSymbol, isLoading, disconnect]);

  return { ...state, isLoading };
};