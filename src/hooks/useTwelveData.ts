import { useState, useEffect, useRef } from 'react';
import { TwelveDataState, SUPPORTED_ASSETS, IndicatorSignal, IndicatorSummary, OrderBookLevel, TradeFeedItem } from '../types/trading';

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

export const useTwelveData = (selectedSymbol: string) => {
  const assetConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];

  const [state, setState] = useState<TwelveDataState>({
    symbol: 'XAU/USD',
    price: 2954.20,
    change: 14.30,
    percentChange: 0.49,
    high: 2962.80,
    low: 2941.50,
    open: 2939.90,
    previousClose: 2939.90,
    datetime: new Date().toLocaleTimeString(),
    isLive: true,
    isMarketOpen: true,
    oscillators: [],
    movingAverages: [],
    orderFlowIndicators: [],
    buyersPercent: 62,
    sellersPercent: 38,
    volumeDelta: 850,
    absorptionRate: 'ALTA',
    institutionalPressure: 'HIGH',
    bids: [],
    asks: [],
    recentTrades: [],
    overallSummary: { buyCount: 6, neutralCount: 2, sellCount: 1, score: 72, verdict: 'BUY' },
    oscillatorsSummary: { buyCount: 3, neutralCount: 1, sellCount: 0, score: 75, verdict: 'STRONG BUY' },
    maSummary: { buyCount: 4, neutralCount: 0, sellCount: 0, score: 100, verdict: 'STRONG BUY' },
    orderFlowSummary: { buyCount: 2, neutralCount: 1, sellCount: 0, score: 80, verdict: 'STRONG BUY' },
  });

  const priceHistoryRef = useRef<number[]>([]);
  const buyerVolumeRef = useRef<number>(120);
  const sellerVolumeRef = useRef<number>(80);
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Carregar Histórico Real Inicial de Candles 1m de Ouro
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
        console.warn("Usando candles de fallback");
        const fallback = Array.from({ length: 60 }, (_, i) => 2950 + Math.sin(i / 4) * 5 + i * 0.1);
        priceHistoryRef.current = fallback;
        updateCalculations(fallback[fallback.length - 1]);
      }
    }

    loadInitialCandles();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Função de recálculo técnico completo e atualização do painel
  const updateCalculations = (currentPrice: number) => {
    const prices = [...priceHistoryRef.current.slice(-100), currentPrice];
    priceHistoryRef.current = prices;

    // Osciladores
    const rsi = calculateRSI(prices, 14);
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdVal = ema12 - ema26;
    const sma20 = calculateSMA(prices, 20);
    const stdDev = Math.sqrt(prices.slice(-20).reduce((acc, p) => acc + Math.pow(p - sma20, 2), 0) / 20) || 1.2;
    const bbUpper = sma20 + stdDev * 2;
    const bbLower = sma20 - stdDev * 2;
    const momentum = currentPrice - (prices[prices.length - 10] || currentPrice);

    const oscillators: IndicatorSignal[] = [
      {
        name: 'RSI (14)',
        value: rsi.toFixed(1),
        action: rsi > 70 ? 'STRONG SELL' : rsi > 58 ? 'BUY' : rsi < 30 ? 'STRONG BUY' : rsi < 42 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'MACD (12, 26)',
        value: `${macdVal >= 0 ? '+' : ''}${macdVal.toFixed(2)}`,
        action: macdVal > 0.5 ? 'STRONG BUY' : macdVal > 0 ? 'BUY' : macdVal < -0.5 ? 'STRONG SELL' : 'SELL'
      },
      {
        name: 'Bollinger Bands',
        value: currentPrice > bbUpper ? 'Upper Bound' : currentPrice < bbLower ? 'Lower Bound' : 'Equilibrium',
        action: currentPrice > bbUpper ? 'SELL' : currentPrice < bbLower ? 'BUY' : 'NEUTRAL'
      },
      {
        name: 'Momentum (10)',
        value: `${momentum >= 0 ? '+' : ''}${momentum.toFixed(2)}`,
        action: momentum > 1.5 ? 'STRONG BUY' : momentum > 0 ? 'BUY' : momentum < -1.5 ? 'STRONG SELL' : 'SELL'
      }
    ];

    // Médias Móveis
    const ema10 = calculateEMA(prices, 10);
    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const ema200 = calculateEMA(prices, 200);

    const movingAverages: IndicatorSignal[] = [
      { name: 'EMA 10', value: ema10.toFixed(2), action: currentPrice > ema10 ? 'BUY' : 'SELL' },
      { name: 'EMA 20', value: ema20.toFixed(2), action: currentPrice > ema20 ? 'BUY' : 'SELL' },
      { name: 'EMA 50', value: ema50.toFixed(2), action: currentPrice > ema50 ? 'STRONG BUY' : 'STRONG SELL' },
      { name: 'EMA 200', value: ema200.toFixed(2), action: currentPrice > ema200 ? 'STRONG BUY' : 'STRONG SELL' },
    ];

    // Order Flow
    const totalVol = buyerVolumeRef.current + sellerVolumeRef.current || 1;
    const buyerRatio = Math.round((buyerVolumeRef.current / totalVol) * 100);
    const sellerRatio = 100 - buyerRatio;
    const delta = Math.round(buyerVolumeRef.current - sellerVolumeRef.current);

    const orderFlowIndicators: IndicatorSignal[] = [
      {
        name: 'Order Flow Dominance',
        value: `${buyerRatio}% Buyers`,
        action: buyerRatio > 65 ? 'STRONG BUY' : buyerRatio > 52 ? 'BUY' : buyerRatio < 35 ? 'STRONG SELL' : buyerRatio < 48 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'Volume Delta',
        value: `${delta >= 0 ? '+' : ''}${delta}`,
        action: delta > 50 ? 'STRONG BUY' : delta > 0 ? 'BUY' : delta < -50 ? 'STRONG SELL' : 'SELL'
      },
      {
        name: 'Institutional Pressure',
        value: Math.abs(delta) > 80 ? 'Heavy Flow' : 'Normal Flow',
        action: delta > 80 ? 'STRONG BUY' : delta < -80 ? 'STRONG SELL' : 'NEUTRAL'
      }
    ];

    // Construtor do Score da Bússola
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
      absorptionRate: Math.abs(delta) > 50 ? 'HIGH' : 'NORMAL',
      institutionalPressure: Math.abs(delta) > 60 ? 'HIGH' : 'MEDIUM',
      overallSummary,
      oscillatorsSummary: oscSummary,
      maSummary,
      orderFlowSummary: ofSummary
    }));
  };

  // 3. Conectar Stream WebSocket em Tempo Real (PAXG/USDT = Ouro Físico 1oz)
  useEffect(() => {
    let reconnectTimeout: any;

    const connectWebSocket = () => {
      const streamUrl = `wss://stream.binance.com:9443/ws/paxgusdt@ticker/paxgusdt@depth10@100ms/paxgusdt@aggTrade`;
      const ws = new WebSocket(streamUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // 1. Ticker Event
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
              isMarketOpen: true,
            }));

            updateCalculations(curPrice);
          }

          // 2. Order Book Depth Event
          if (msg.bids && msg.asks) {
            let maxTotal = 0;
            const newBids: OrderBookLevel[] = msg.bids.slice(0, 6).map((b: string[]) => {
              const p = parseFloat(b[0]);
              const s = parseFloat(b[1]);
              const tot = p * s;
              if (tot > maxTotal) maxTotal = tot;
              return { price: p, size: s, percentage: 0 };
            });

            const newAsks: OrderBookLevel[] = msg.asks.slice(0, 6).map((a: string[]) => {
              const p = parseFloat(a[0]);
              const s = parseFloat(a[1]);
              const tot = p * s;
              if (tot > maxTotal) maxTotal = tot;
              return { price: p, size: s, percentage: 0 };
            });

            const finalBids = newBids.map(b => ({ ...b, percentage: Math.min(100, Math.round(((b.price * b.size) / (maxTotal || 1)) * 100)) }));
            const finalAsks = newAsks.map(a => ({ ...a, percentage: Math.min(100, Math.round(((a.price * a.size) / (maxTotal || 1)) * 100)) }));

            setState(prev => ({
              ...prev,
              bids: finalBids,
              asks: finalAsks
            }));
          }

          // 3. Executed Trades Event
          if (msg.e === 'aggTrade') {
            const p = parseFloat(msg.p);
            const q = parseFloat(msg.q);
            const isMaker = msg.m; // true = SELL, false = BUY

            if (isMaker) {
              sellerVolumeRef.current += q * 10;
            } else {
              buyerVolumeRef.current += q * 10;
            }

            const d = new Date(msg.T);
            const timeStr = d.toTimeString().split(' ')[0] + '.' + Math.floor(d.getMilliseconds() / 100);

            const tradeItem: TradeFeedItem = {
              id: `${msg.a}`,
              price: p,
              size: parseFloat(q.toFixed(3)),
              time: timeStr,
              type: isMaker ? 'SELL' : 'BUY'
            };

            setState(prev => ({
              ...prev,
              recentTrades: [tradeItem, ...prev.recentTrades.slice(0, 15)]
            }));
          }
        } catch (e) {
          // Erro de parse
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return state;
};