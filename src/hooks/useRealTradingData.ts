import { useState, useEffect, useRef } from 'react';
import { 
  RealTradingState, 
  SUPPORTED_SYMBOLS, 
  IndicatorSignal, 
  IndicatorSummary, 
  RealOrderBookLevel, 
  LiveTrade 
} from '../types/trading';

// Real Technical Indicator Calculations on Price Series
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

export const useRealTradingData = (selectedSymbol: string) => {
  const symbolConfig = SUPPORTED_SYMBOLS.find(s => s.symbol === selectedSymbol) || SUPPORTED_SYMBOLS[0];
  const binanceSymbol = symbolConfig.binanceSymbol.toLowerCase();

  const [data, setData] = useState<RealTradingState>({
    symbol: selectedSymbol,
    price: 0,
    priceChange24h: 0,
    high24h: 0,
    low24h: 0,
    volume24h: 0,
    bids: [],
    asks: [],
    recentTrades: [],
    buyerVolume: 0,
    sellerVolume: 0,
    volumeDelta: 0,
    oscillators: [],
    movingAverages: [],
    orderFlowIndicators: [],
    overallSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    oscillatorsSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    maSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    orderFlowSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
  });

  const priceHistoryRef = useRef<number[]>([]);
  const buyerVolRef = useRef<number>(0);
  const sellerVolRef = useRef<number>(0);

  // 1. Load Initial Historical Candles for Precise Calculations
  useEffect(() => {
    let isMounted = true;

    async function fetchInitialKlines() {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbolConfig.binanceSymbol}&interval=1m&limit=200`);
        const json = await res.json();
        if (Array.isArray(json) && isMounted) {
          const closes = json.map(item => parseFloat(item[4]));
          priceHistoryRef.current = closes;
          if (closes.length > 0) {
            recalculateAnalysis(closes[closes.length - 1]);
          }
        }
      } catch (e) {
        console.error("Error loading kline data:", e);
      }
    }

    fetchInitialKlines();

    return () => {
      isMounted = false;
    };
  }, [symbolConfig.binanceSymbol]);

  // Recalculate EVERYTHING from prices and flows
  const recalculateAnalysis = (currentPrice: number) => {
    const prices = [...priceHistoryRef.current, currentPrice];
    
    // Real Oscillators
    const rsi = calculateRSI(prices, 14);
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdVal = ema12 - ema26;
    const sma20 = calculateSMA(prices, 20);
    const stdDev = Math.sqrt(prices.slice(-20).reduce((sq, n) => sq + Math.pow(n - sma20, 2), 0) / 20) || 1;
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

    // Real Moving Averages
    const ema10 = calculateEMA(prices, 10);
    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const ema200 = calculateEMA(prices, 200);
    const sma50 = calculateSMA(prices, 50);

    const movingAverages: IndicatorSignal[] = [
      { name: 'EMA 10', value: ema10.toFixed(symbolConfig.precision), action: currentPrice > ema10 ? 'BUY' : 'SELL' },
      { name: 'EMA 20', value: ema20.toFixed(symbolConfig.precision), action: currentPrice > ema20 ? 'BUY' : 'SELL' },
      { name: 'EMA 50', value: ema50.toFixed(symbolConfig.precision), action: currentPrice > ema50 ? 'STRONG BUY' : 'STRONG SELL' },
      { name: 'SMA 50', value: sma50.toFixed(symbolConfig.precision), action: currentPrice > sma50 ? 'BUY' : 'SELL' },
      { name: 'EMA 200', value: ema200.toFixed(symbolConfig.precision), action: currentPrice > ema200 ? 'STRONG BUY' : 'STRONG SELL' },
    ];

    // Order Flow Indicators
    const totVol = buyerVolRef.current + sellerVolRef.current || 1;
    const buyerRatio = (buyerVolRef.current / totVol) * 100;
    const delta = buyerVolRef.current - sellerVolRef.current;

    const orderFlowIndicators: IndicatorSignal[] = [
      {
        name: 'Buy Dominance',
        value: `${buyerRatio.toFixed(1)}%`,
        action: buyerRatio > 65 ? 'STRONG BUY' : buyerRatio > 52 ? 'BUY' : buyerRatio < 35 ? 'STRONG SELL' : buyerRatio < 48 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'Instant Volume Delta',
        value: `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
        action: delta > 5 ? 'STRONG BUY' : delta > 0 ? 'BUY' : delta < -5 ? 'STRONG SELL' : delta < 0 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'Institutional Pressure',
        value: Math.abs(delta) > 10 ? 'Active Absorption' : 'Balanced',
        action: delta > 10 ? 'STRONG BUY' : delta < -10 ? 'STRONG SELL' : 'NEUTRAL'
      }
    ];

    // Build Summaries for the Compass
    const buildSummary = (list: IndicatorSignal[]): IndicatorSummary => {
      let buy = 0;
      let neutral = 0;
      let sell = 0;

      list.forEach(i => {
        if (i.action.includes('STRONG BUY')) buy += i.action.includes('FORTE') ? 2 : 2;
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

    const oscSummary = buildSummary(oscillators);
    const maSummary = buildSummary(movingAverages);
    const ofSummary = buildSummary(orderFlowIndicators);
    const overallSummary = buildSummary([...oscillators, ...movingAverages, ...orderFlowIndicators]);

    setData(prev => ({
      ...prev,
      price: currentPrice,
      oscillators,
      movingAverages,
      orderFlowIndicators,
      oscillatorsSummary: oscSummary,
      maSummary,
      orderFlowSummary: ofSummary,
      overallSummary,
      buyerVolume: buyerVolRef.current,
      sellerVolume: sellerVolRef.current,
      volumeDelta: delta
    }));
  };

  // 2. WebSocket Connection to Binance (Ticker + Order Book + Trades)
  useEffect(() => {
    buyerVolRef.current = 0;
    sellerVolRef.current = 0;

    // Combined stream URL
    const streamUrl = `wss://stream.binance.com:9443/ws/${binanceSymbol}@ticker/${binanceSymbol}@depth10@100ms/${binanceSymbol}@aggTrade`;
    const ws = new WebSocket(streamUrl);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      // Ticker Event (Current price and 24h stats)
      if (msg.e === '24hrTicker') {
        const curPrice = parseFloat(msg.c);
        const change = parseFloat(msg.P);
        const high = parseFloat(msg.h);
        const low = parseFloat(msg.l);
        const vol = parseFloat(msg.v);

        setData(prev => ({
          ...prev,
          priceChange24h: change,
          high24h: high,
          low24h: low,
          volume24h: vol
        }));

        recalculateAnalysis(curPrice);
      }

      // Order Book Event (Depth 10)
      if (msg.bids && msg.asks) {
        let maxVol = 0;
        const newBids: RealOrderBookLevel[] = msg.bids.map((b: string[]) => {
          const p = parseFloat(b[0]);
          const s = parseFloat(b[1]);
          const tot = p * s;
          if (tot > maxVol) maxVol = tot;
          return { price: p, size: s, total: tot, percentage: 0 };
        });

        const newAsks: RealOrderBookLevel[] = msg.asks.map((a: string[]) => {
          const p = parseFloat(a[0]);
          const s = parseFloat(a[1]);
          const tot = p * s;
          if (tot > maxVol) maxVol = tot;
          return { price: p, size: s, total: tot, percentage: 0 };
        });

        const finalBids = newBids.map(b => ({ ...b, percentage: Math.min(100, (b.total / (maxVol || 1)) * 100) }));
        const finalAsks = newAsks.map(a => ({ ...a, percentage: Math.min(100, (a.total / (maxVol || 1)) * 100) }));

        setData(prev => ({
          ...prev,
          bids: finalBids,
          asks: finalAsks
        }));
      }

      // Live Trades Event (aggTrade)
      if (msg.e === 'aggTrade') {
        const p = parseFloat(msg.p);
        const q = parseFloat(msg.q);
        const isMaker = msg.m; // true = Sell order executed, false = Buy order executed

        if (isMaker) {
          sellerVolRef.current += q;
        } else {
          buyerVolRef.current += q;
        }

        const date = new Date(msg.T);
        const timeStr = date.toTimeString().split(' ')[0] + '.' + Math.floor(date.getMilliseconds() / 100);

        const newTrade: LiveTrade = {
          id: msg.a,
          price: p,
          size: q,
          time: timeStr,
          isBuyerMaker: isMaker
        };

        setData(prev => ({
          ...prev,
          recentTrades: [newTrade, ...prev.recentTrades.slice(0, 19)]
        }));
      }
    };

    return () => {
      ws.close();
    };
  }, [binanceSymbol]);

  return data;
};