import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TwelveDataState, 
  SUPPORTED_ASSETS, 
  IndicatorSignal, 
  IndicatorSummary, 
  OrderBookLevel, 
  TradeFeedItem 
} from '../types/trading';

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

export const useTwelveData = (selectedSymbol = 'MGC1!') => {
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
    isLive: true,
    isMarketOpen: true,
    oscillators: [],
    movingAverages: [],
    orderFlowIndicators: [],
    buyersPercent: 65,
    sellersPercent: 35,
    volumeDelta: 1420,
    institutionalPressure: 'HIGH',
    bids: [],
    asks: [],
    recentTrades: [],
    overallSummary: { buyCount: 7, neutralCount: 1, sellCount: 0, score: 85, verdict: 'STRONG BUY' },
    oscillatorsSummary: { buyCount: 3, neutralCount: 1, sellCount: 0, score: 75, verdict: 'STRONG BUY' },
    maSummary: { buyCount: 4, neutralCount: 0, sellCount: 0, score: 100, verdict: 'STRONG BUY' },
    orderFlowSummary: { buyCount: 3, neutralCount: 0, sellCount: 0, score: 90, verdict: 'STRONG BUY' },
  });

  const priceHistoryRef = useRef<number[]>([]);
  const buyerVolRef = useRef<number>(240);
  const sellerVolRef = useRef<number>(110);
  const wsRef = useRef<WebSocket | null>(null);

  // Load initial candles for MGC1!
  useEffect(() => {
    let isMounted = true;

    async function loadInitialCandles() {
      try {
        const res = await fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=100');
        const data = await res.json();
        if (Array.isArray(data) && isMounted) {
          const closes = data.map((k: any) => parseFloat(k[4]));
          priceHistoryRef.current = closes;
          if (closes.length > 0) {
            updateCalculations(closes[closes.length - 1]);
          }
        }
      } catch (err) {
        const fallback = Array.from({ length: 60 }, (_, i) => 2950 + Math.sin(i / 4) * 4 + i * 0.1);
        priceHistoryRef.current = fallback;
        updateCalculations(fallback[fallback.length - 1]);
      }
    }

    loadInitialCandles();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateCalculations = useCallback((currentPrice: number) => {
    const prices = [...priceHistoryRef.current.slice(-100), currentPrice];
    priceHistoryRef.current = prices;

    // Oscillators
    const rsi = calculateRSI(prices, 14);
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdVal = ema12 - ema26;
    const momentum = currentPrice - (prices[prices.length - 10] || currentPrice);

    const oscillators: IndicatorSignal[] = [
      {
        name: 'RSI (14)',
        value: rsi.toFixed(1),
        action: rsi > 70 ? 'STRONG SELL' : rsi > 58 ? 'BUY' : rsi < 30 ? 'STRONG BUY' : rsi < 42 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'MACD (12, 26, 9)',
        value: `${macdVal >= 0 ? '+' : ''}${macdVal.toFixed(2)}`,
        action: macdVal > 0.5 ? 'STRONG BUY' : macdVal > 0 ? 'BUY' : macdVal < -0.5 ? 'STRONG SELL' : 'SELL'
      },
      {
        name: 'Price Momentum',
        value: `${momentum >= 0 ? '+' : ''}${momentum.toFixed(2)}`,
        action: momentum > 1.5 ? 'STRONG BUY' : momentum > 0 ? 'BUY' : momentum < -1.5 ? 'STRONG SELL' : 'SELL'
      }
    ];

    // Moving Averages
    const ema10 = calculateEMA(prices, 10);
    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const ema200 = calculateEMA(prices, 200);

    const movingAverages: IndicatorSignal[] = [
      { name: 'EMA 10 (Fast)', value: ema10.toFixed(2), action: currentPrice > ema10 ? 'BUY' : 'SELL' },
      { name: 'EMA 20 (Intermediate)', value: ema20.toFixed(2), action: currentPrice > ema20 ? 'BUY' : 'SELL' },
      { name: 'EMA 50 (Trend Line)', value: ema50.toFixed(2), action: currentPrice > ema50 ? 'STRONG BUY' : 'STRONG SELL' },
      { name: 'EMA 200 (Institutional Base)', value: ema200.toFixed(2), action: currentPrice > ema200 ? 'STRONG BUY' : 'STRONG SELL' },
    ];

    // Order Flow
    const totalVol = buyerVolRef.current + sellerVolRef.current || 1;
    const buyerRatio = Math.round((buyerVolRef.current / totalVol) * 100);
    const sellerRatio = 100 - buyerRatio;
    const delta = Math.round(buyerVolRef.current - sellerVolRef.current);

    const absDelta = Math.abs(delta);
    const instPressure = absDelta > 200 ? 'EXTREME' : absDelta > 100 ? 'HIGH' : absDelta > 40 ? 'MEDIUM' : 'LOW';

    const orderFlowIndicators: IndicatorSignal[] = [
      {
        name: 'Order Flow Dominance',
        value: `${buyerRatio}% Aggressive Buyers`,
        action: buyerRatio > 65 ? 'STRONG BUY' : buyerRatio > 52 ? 'BUY' : buyerRatio < 35 ? 'STRONG SELL' : buyerRatio < 48 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'Tape Delta',
        value: `${delta >= 0 ? '+' : ''}${delta}`,
        action: delta > 80 ? 'STRONG BUY' : delta > 0 ? 'BUY' : delta < -80 ? 'STRONG SELL' : 'SELL'
      },
      {
        name: 'Institutional Flow',
        value: `Pressure: ${instPressure}`,
        action: instPressure === 'EXTREME' || instPressure === 'HIGH' ? (delta > 0 ? 'STRONG BUY' : 'STRONG SELL') : 'NEUTRAL'
      }
    ];

    // Summaries
    const buildSummary = (list: IndicatorSignal[]): IndicatorSummary => {
      let buy = 0;
      let neutral = 0;
      let sell = 0;

      list.forEach(i => {
        if (i.action.includes('STRONG BUY')) buy += 2;
        else if (i.action === 'BUY') buy += 1;
        else if (i.action.includes('STRONG SELL')) sell += 2;
        else if (i.action === 'SELL') sell += 1;
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
    };

    const oscSummary = buildSummary(oscillators);
    const maSummary = buildSummary(movingAverages);
    const ofSummary = buildSummary(orderFlowIndicators);
    const overallSummary = buildSummary([...oscillators, ...movingAverages, ...orderFlowIndicators]);

    setState(prev => ({
      ...prev,
      price: currentPrice,
      datetime: new Date().toLocaleTimeString(),
      oscillators,
      movingAverages,
      orderFlowIndicators,
      buyersPercent: buyerRatio,
      sellersPercent: sellerRatio,
      volumeDelta: delta,
      institutionalPressure: instPressure,
      overallSummary,
      oscillatorsSummary: oscSummary,
      maSummary,
      orderFlowSummary: ofSummary
    }));
  }, []);

  // WebSocket Live Stream for MGC1! proxy
  useEffect(() => {
    let reconnectTimeout: any;

    const connectWebSocket = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/paxgusdt@ticker/paxgusdt@depth10@100ms/paxgusdt@aggTrade`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Ticker
          if (msg.e === '24hrTicker') {
            const curPrice = parseFloat(msg.c);
            const change = parseFloat(msg.p);
            const percentChange = parseFloat(msg.P);
            const high = parseFloat(msg.h);
            const low = parseFloat(msg.l);
            const open = parseFloat(msg.o);

            setState(prev => ({
              ...prev,
              price: curPrice,
              change,
              percentChange,
              high,
              low,
              open,
              isLive: true,
            }));

            updateCalculations(curPrice);
          }

          // Depth with cumulative size
          if (msg.bids && msg.asks) {
            let runningBidCum = 0;
            let runningAskCum = 0;
            let maxTotal = 1;

            const newBids: OrderBookLevel[] = msg.bids.slice(0, 6).map((b: string[]) => {
              const p = parseFloat(b[0]);
              const s = parseFloat(b[1]);
              runningBidCum += s;
              if (s > maxTotal) maxTotal = s;
              return { price: p, size: s, cumulativeSize: runningBidCum, percentage: 0 };
            });

            const newAsks: OrderBookLevel[] = msg.asks.slice(0, 6).map((a: string[]) => {
              const p = parseFloat(a[0]);
              const s = parseFloat(a[1]);
              runningAskCum += s;
              if (s > maxTotal) maxTotal = s;
              return { price: p, size: s, cumulativeSize: runningAskCum, percentage: 0 };
            });

            const finalBids = newBids.map(b => ({ ...b, percentage: Math.min(100, Math.round((b.size / maxTotal) * 100)) }));
            const finalAsks = newAsks.map(a => ({ ...a, percentage: Math.min(100, Math.round((a.size / maxTotal) * 100)) }));

            setState(prev => ({
              ...prev,
              bids: finalBids,
              asks: finalAsks
            }));
          }

          // Trades with aggressor side (Taker Buy vs Taker Sell)
          if (msg.e === 'aggTrade') {
            const p = parseFloat(msg.p);
            const q = parseFloat(msg.q);
            const isMaker = msg.m; // true = Taker Sell (Maker Buy), false = Taker Buy (Maker Sell)

            if (isMaker) {
              sellerVolRef.current += q * 12;
            } else {
              buyerVolRef.current += q * 12;
            }

            const d = new Date(msg.T);
            const timeStr = d.toTimeString().split(' ')[0] + '.' + Math.floor(d.getMilliseconds() / 100);

            const tradeItem: TradeFeedItem = {
              id: `${msg.a}`,
              price: p,
              size: parseFloat(q.toFixed(2)),
              time: timeStr,
              type: isMaker ? 'SELL' : 'BUY',
              aggressor: isMaker ? 'SELL_AGGR' : 'BUY_AGGR'
            };

            setState(prev => ({
              ...prev,
              recentTrades: [tradeItem, ...prev.recentTrades.slice(0, 19)]
            }));
          }
        } catch (e) {
          // ignore parsing glitch
        }
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [updateCalculations]);

  return state;
};