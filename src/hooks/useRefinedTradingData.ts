import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TwelveDataState,
  SUPPORTED_ASSETS,
  IndicatorSignal,
  IndicatorSummary,
  OrderBookLevel,
  TradeFeedItem,
} from '../types/trading';

// Helper function to safely convert to number
const safeNum = (val: number, defaultVal: number): number =>
  Number.isNaN(val) || !Number.isFinite(val) ? defaultVal : val;

// Helper function to calculate percent change
const safePercentChange = (newVal: number, oldVal: number): number => {
  if (oldVal === 0) return 0;
  return ((newVal - oldVal) / oldVal) * 100;
};

// Helper function to build indicator signals from price history
const buildIndicatorSignals = (prices: number[], currentPrice: number, precision: number) => {
  // Calculate simple indicators
  const rsi = 50 + (Math.random() - 0.5) * 30; // Mock RSI
  const macdVal = (Math.random() - 0.5) * 10; // Mock MACD
  
  const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
  const stdDev = Math.sqrt(prices.slice(-20).reduce((sq, n) => sq + Math.pow(n - sma20, 2), 0) / Math.min(20, prices.length)) || 1;
  const bbUpper = sma20 + stdDev * 2;
  const bbLower = sma20 - stdDev * 2;

  const oscillators: IndicatorSignal[] = [
    {
      name: 'RSI (14)',
      value: rsi.toFixed(1),
      action: rsi > 70 ? 'STRONG SELL' : rsi > 60 ? 'SELL' : rsi < 30 ? 'STRONG BUY' : rsi < 40 ? 'BUY' : 'NEUTRAL'
    },
    {
      name: 'MACD (12, 26)',
      value: macdVal.toFixed(2),
      action: macdVal > 0 ? 'BUY' : 'SELL'
    },
    {
      name: 'Bollinger Bands',
      value: currentPrice > bbUpper ? 'Overbought' : currentPrice < bbLower ? 'Oversold' : 'Inside Band',
      action: currentPrice > bbUpper ? 'SELL' : currentPrice < bbLower ? 'BUY' : 'NEUTRAL'
    },
    {
      name: 'Momentum (10)',
      value: (currentPrice - (prices[prices.length - 10] || currentPrice)).toFixed(2),
      action: currentPrice > (prices[prices.length - 10] || currentPrice) ? 'BUY' : 'SELL'
    }
  ];

  // Moving Averages - simplified mock values
  const movingAverages: IndicatorSignal[] = [
    { name: 'EMA 10', value: (currentPrice * 0.998).toFixed(precision), action: currentPrice > currentPrice * 0.998 ? 'BUY' : 'SELL' },
    { name: 'EMA 20', value: (currentPrice * 0.995).toFixed(precision), action: currentPrice > currentPrice * 0.995 ? 'BUY' : 'SELL' },
    { name: 'EMA 50', value: (currentPrice * 0.99).toFixed(precision), action: currentPrice > currentPrice * 0.99 ? 'STRONG BUY' : 'STRONG SELL' },
    { name: 'SMA 50', value: (currentPrice * 0.992).toFixed(precision), action: currentPrice > currentPrice * 0.992 ? 'BUY' : 'SELL' },
    { name: 'EMA 200', value: (currentPrice * 0.98).toFixed(precision), action: currentPrice > currentPrice * 0.98 ? 'STRONG BUY' : 'STRONG SELL' },
  ];

  const orderFlowIndicators: IndicatorSignal[] = [];

  return { oscillators, movingAverages, orderFlowIndicators };
};

// Helper function to build summary from indicator signals
const buildSummary = (list: IndicatorSignal[]): IndicatorSummary => {
  let buy = 0;
  let neutral = 0;
  let sell = 0;

  list.forEach(i => {
    if (i.action.includes('STRONG BUY')) buy += 2;
    else if (i.action.includes('BUY')) buy += 1;
    else if (i.action.includes('STRONG SELL')) sell += 2;
    else if (i.action.includes('SELL')) sell += 1;
    else neutral += 1;
  });

  const total = buy + neutral + sell || 1;
  const score = Math.round((buy / total) * 100);

  let verdict: IndicatorSummary['verdict'] = 'NEUTRAL';
  if (score >= 75) verdict = 'STRONG BUY';
  else if (score >= 55) verdict = 'BUY';
  else if (score <= 25) verdict = 'STRONG SELL';
  else if (score <= 45) verdict = 'SELL';

  return {
    buyCount: buy,
    neutralCount: neutral,
    sellCount: sell,
    score,
    verdict
  };
};

export const useRefinedTradingData = (selectedSymbol = 'MGC1!') => {
  const [isLoading, setIsLoading] = useState(true);

  const activeConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];
  const precision = activeConfig.precision;
  const binanceSymbol = activeConfig.binanceSymbol || 'PAXGUSDT';

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

  const priceHistoryRef = useRef<number[]>([]);
  const lastUpdateRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  const loadInitialData = useCallback(async () => {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1m&limit=200`
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid data');

      const closes = data.map((k: any[]) => safeNum(parseFloat(k[4]), 0));
      priceHistoryRef.current = closes;

      const currentPrice = closes[closes.length - 1] || 0;
      const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(closes, currentPrice, precision);

      const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];
      const overallSummary = buildSummary(allSignals);
      const oscillatorsSummary = buildSummary(oscillators);
      const maSummary = buildSummary(movingAverages);
      const orderFlowSummary = buildSummary(orderFlowIndicators);

      try {
        const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`);
        const tickerData = await tickerRes.json();

        setState({
          symbol: selectedSymbol,
          price: safeNum(parseFloat(tickerData.lastPrice), currentPrice),
          change: safeNum(parseFloat(tickerData.priceChange), 0),
          percentChange: safeNum(parseFloat(tickerData.priceChangePercent), 0),
          high: safeNum(parseFloat(tickerData.highPrice), 0),
          low: safeNum(parseFloat(tickerData.lowPrice), 0),
          open: safeNum(parseFloat(tickerData.openPrice), 0),
          previousClose: safeNum(parseFloat(tickerData.prevClosePrice), 0),
          datetime: new Date().toLocaleTimeString(),
          isLive: false,
          isMarketOpen: true,
          oscillators,
          movingAverages,
          orderFlowIndicators,
          recentTrades: [],
          bids: [],
          asks: [],
          overallSummary,
          oscillatorsSummary,
          maSummary,
          orderFlowSummary,
          buyersPercent: 50,
          sellersPercent: 50,
          volumeDelta: 0,
          institutionalPressure: 'LOW',
        });
      } catch {
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

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load initial data:', err);
      
      // Fallback to mock data
      const fallback = Array.from({ length: 100 }, (_, i) =>
        selectedSymbol === 'MGC1!'
          ? 2950 + Math.sin(i / 5) * 5 + (Math.random() - 0.5) * 2 + i * 0.05
          : 5200 + Math.sin(i / 5) * 10 + (Math.random() - 0.5) * 4 + i * 0.1
      );
      priceHistoryRef.current = fallback;
      const lastPrice = fallback[fallback.length - 1];
      const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(fallback, lastPrice, precision);

      setState(prev => ({
        ...prev,
        symbol: selectedSymbol,
        price: lastPrice,
        high: Math.max(...fallback.slice(-60)),
        low: Math.min(...fallback.slice(-60)),
        isLive: false,
        isMarketOpen: true,
        oscillators,
        movingAverages,
        orderFlowIndicators,
        recentTrades: [],
        bids: [],
        asks: [],
        overallSummary: buildSummary([...oscillators, ...movingAverages, ...orderFlowIndicators]),
        oscillatorsSummary: buildSummary(oscillators),
        maSummary: buildSummary(movingAverages),
        orderFlowSummary: buildSummary(orderFlowIndicators),
      }));
      setIsLoading(false);
    }
  }, [binanceSymbol, precision, selectedSymbol]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (isLoading) return;

    const connectWebSocket = () => {
      const streams = [
        `${binanceSymbol.toLowerCase()}@ticker`,
        `${binanceSymbol.toLowerCase()}@depth10@100ms`,
        `${binanceSymbol.toLowerCase()}@aggTrade`,
      ].join('/');

      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({ ...prev, isLive: true }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.e === '24hrTicker') {
            const newPrice = safeNum(parseFloat(msg.c), 0);
            const lastPrice = priceHistoryRef.current[priceHistoryRef.current.length - 1];
            
            if (newPrice !== lastPrice) {
              priceHistoryRef.current = [...priceHistoryRef.current.slice(-499), newPrice];
            }

            const prices = priceHistoryRef.current;
            if (prices.length < 2) return;

            const { oscillators, movingAverages, orderFlowIndicators } = buildIndicatorSignals(prices, newPrice, precision);
            const allSignals = [...oscillators, ...movingAverages, ...orderFlowIndicators];

            setState(prev => ({
              ...prev,
              price: newPrice,
              change: safeNum(parseFloat(msg.p), 0),
              percentChange: safeNum(parseFloat(msg.P), 0),
              high: safeNum(parseFloat(msg.h), 0),
              low: safeNum(parseFloat(msg.l), 0),
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

            setState(prev => ({ ...prev, bids: finalBids, asks: finalAsks }));
          }

          else if (msg.e === 'aggTrade') {
            const tradePrice = safeNum(parseFloat(msg.p), 0);
            const tradeSize = safeNum(parseFloat(msg.q), 0);
            const isBuyerMaker = Boolean(msg.m);

            const time = new Date(safeNum(msg.T, Date.now()));
            const timeStr = time.toTimeString().split(' ')[0] + '.' + Math.floor(time.getMilliseconds() / 100);

            const trade: TradeFeedItem = {
              id: String(safeNum(msg.a, Date.now())),
              price: tradePrice,
              size: tradeSize,
              time: timeStr,
              type: isBuyerMaker ? 'SELL' : 'BUY',
              aggressor: isBuyerMaker ? 'SELL_AGGR' : 'BUY_AGGR',
            };

            setState(prev => ({
              ...prev,
              recentTrades: [trade, ...prev.recentTrades.slice(0, 49)],
            }));
          }
        } catch (e) {
          // Silent parse error
        }
      };

      ws.onclose = () => {
        setState(prev => ({ ...prev, isLive: false }));
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [binanceSymbol, precision, isLoading]);

  return {
    ...state,
    dataQuality: {
      overall: state.isLive ? 100 : 50,
      orderBookWeight: state.bids.length > 0 && state.asks.length > 0 ? 20 : 0,
      tapeWeight: state.recentTrades.length > 0 ? 15 : 0,
      volumeWeight: state.volumeDelta !== 0 ? 15 : 0,
      tradesWeight: state.recentTrades.length > 0 ? 10 : 0,
      indicatorsWeight: state.oscillators.length > 0 && state.movingAverages.length > 0 ? 40 : 0,
      metrics: {
        orderBookComplete: state.bids.length >= 3 && state.asks.length >= 3,
        tapeAvailable: state.recentTrades.length > 0,
        volumeAvailable: state.volumeDelta !== undefined,
        tradesAvailable: state.recentTrades.length > 0,
        indicatorsValid: state.oscillators.length >= 2 && state.movingAverages.length >= 3,
        websocketConnected: state.isLive,
        lastUpdateTime: Date.now(),
        latencyMs: 0,
        freshness: state.isLive ? 'LIVE' : 'DELAYED',
      },
    }
  };
};