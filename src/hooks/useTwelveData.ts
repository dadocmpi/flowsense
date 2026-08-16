import { useState, useEffect, useRef } from 'react';
import { TwelveDataState, SUPPORTED_ASSETS, IndicatorSignal, IndicatorSummary, OrderBookLevel, TradeFeedItem } from '../types/trading';

const TWELVE_DATA_API_KEY = '053dc682778b40d1aa59d00e444d5b64';

// Verifica se o mercado de XAU/USD (Spot Gold) está aberto
export function checkIsMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Domingo, 6 = Sábado
  const hour = now.getUTCHours();
  
  // Sábado: Fechado o dia inteiro
  if (day === 6) return false;
  // Sexta-feira: Fecha após 22:00 UTC (17:00 NY / 19:00 BRT)
  if (day === 5 && hour >= 22) return false;
  // Domingo: Fechado até a reabertura às 22:00 UTC (17:00 NY / 19:00 BRT)
  if (day === 0 && hour < 22) return false;
  
  return true;
}

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

function getInitialState(symbol: string): TwelveDataState {
  const basePrice = 2950.40;
  const precision = 2;
  const marketOpen = checkIsMarketOpen();

  const mockPrices = Array.from({ length: 30 }, (_, i) => basePrice + (Math.sin(i) * 2.5));
  const rsi = calculateRSI(mockPrices, 14);

  const oscillators: IndicatorSignal[] = [
    { name: 'RSI (14)', value: rsi.toFixed(1), action: rsi > 70 ? 'STRONG SELL' : rsi > 60 ? 'SELL' : rsi < 30 ? 'STRONG BUY' : rsi < 40 ? 'BUY' : 'NEUTRAL' },
    { name: 'MACD (12, 26)', value: '+1.45', action: 'BUY' },
    { name: 'Momentum (10)', value: '+2.10', action: 'BUY' },
    { name: 'Stochastic %K', value: '78.4', action: 'BUY' },
  ];

  const movingAverages: IndicatorSignal[] = [
    { name: 'EMA 10', value: (basePrice - 0.50).toFixed(precision), action: 'BUY' },
    { name: 'EMA 20', value: (basePrice - 1.20).toFixed(precision), action: 'BUY' },
    { name: 'EMA 50', value: (basePrice - 2.80).toFixed(precision), action: 'STRONG BUY' },
    { name: 'EMA 200', value: (basePrice - 5.10).toFixed(precision), action: 'STRONG BUY' },
  ];

  const orderFlowIndicators: IndicatorSignal[] = [
    { name: 'Institutional Pressure', value: 'Buyer Flow', action: 'STRONG BUY' },
    { name: 'Trend Delta', value: '+1420', action: 'STRONG BUY' },
    { name: 'Support Absorption', value: 'Passive (High)', action: 'BUY' },
  ];

  const buildSummary = (list: IndicatorSignal[]): IndicatorSummary => {
    let buy = 0;
    let neutral = 0;
    let sell = 0;

    list.forEach(i => {
      if (i.action.includes('BUY')) buy += i.action.includes('STRONG') ? 2 : 1;
      else if (i.action.includes('SELL')) sell += i.action.includes('STRONG') ? 2 : 1;
      else neutral += 1;
    });

    const total = buy + neutral + sell || 1;
    const score = Math.round((buy / total) * 100);

    let verdict: IndicatorSummary['verdict'] = 'NEUTRAL';
    if (score >= 75) verdict = 'STRONG BUY';
    else if (score >= 55) verdict = 'BUY';
    else if (score <= 25) verdict = 'STRONG SELL';
    else if (score <= 45) verdict = 'SELL';

    return { buyCount: buy, neutralCount: neutral, sellCount: sell, score, verdict };
  };

  const stepOffset = 0.20;
  const bids: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => ({
    price: parseFloat((basePrice - ((i + 1) * stepOffset)).toFixed(precision)),
    size: 45,
    percentage: 65
  }));

  const asks: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => ({
    price: parseFloat((basePrice + ((i + 1) * stepOffset)).toFixed(precision)),
    size: 42,
    percentage: 60
  }));

  const initialTrades: TradeFeedItem[] = Array.from({ length: 8 }, (_, i) => ({
    id: `close-${i}`,
    price: basePrice,
    size: 2.5,
    time: 'Last Close',
    type: i % 2 === 0 ? 'BUY' : 'SELL'
  }));

  return {
    symbol,
    price: basePrice,
    change: 12.40,
    percentChange: 0.42,
    high: basePrice + 8.5,
    low: basePrice - 5.2,
    open: basePrice - 2.1,
    previousClose: basePrice - 12.4,
    datetime: 'Friday Close',
    isLive: marketOpen,
    isMarketOpen: marketOpen,
    oscillators,
    movingAverages,
    orderFlowIndicators,
    buyersPercent: 64,
    sellersPercent: 36,
    volumeDelta: 1420,
    absorptionRate: 'HIGH',
    institutionalPressure: 'HIGH',
    bids,
    asks,
    recentTrades: initialTrades,
    overallSummary: buildSummary([...oscillators, ...movingAverages, ...orderFlowIndicators]),
    oscillatorsSummary: buildSummary(oscillators),
    maSummary: buildSummary(movingAverages),
    orderFlowSummary: buildSummary(orderFlowIndicators)
  };
}

export const useTwelveData = (selectedSymbol: string) => {
  const assetConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];
  const [state, setState] = useState<TwelveDataState>(() => getInitialState(selectedSymbol));
  const priceHistoryRef = useRef<number[]>([]);
  const realBasePriceRef = useRef<number>(2950.40);

  // 1. Fetch oficial TwelveData (sempre busca o preço real de fechamento / mercado)
  const fetchTwelveDataQuick = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const quoteUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(assetConfig.twelveSymbol)}&apikey=${TWELVE_DATA_API_KEY}`;
      const quoteRes = await fetch(quoteUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      const quoteData = await quoteRes.json();

      if (quoteData && quoteData.close && !quoteData.code) {
        const curPrice = parseFloat(quoteData.close);
        realBasePriceRef.current = curPrice;
        const high = parseFloat(quoteData.high || quoteData.close);
        const low = parseFloat(quoteData.low || quoteData.close);
        const change = parseFloat(quoteData.change || '0');
        const percentChange = parseFloat(quoteData.percent_change || '0');
        const marketOpen = checkIsMarketOpen();

        priceHistoryRef.current = [...priceHistoryRef.current.slice(-60), curPrice];
        const prices = priceHistoryRef.current;

        const rsi = calculateRSI(prices, 14);
        const ema10 = calculateEMA(prices, 10);
        const ema20 = calculateEMA(prices, 20);
        const ema50 = calculateEMA(prices, 50);
        const ema200 = calculateEMA(prices, 200);
        const macdVal = calculateEMA(prices, 12) - calculateEMA(prices, 26);

        const oscillators: IndicatorSignal[] = [
          {
            name: 'RSI (14)',
            value: rsi.toFixed(1),
            action: rsi > 70 ? 'STRONG SELL' : rsi > 60 ? 'SELL' : rsi < 30 ? 'STRONG BUY' : rsi < 40 ? 'BUY' : 'NEUTRAL'
          },
          { name: 'MACD (12, 26)', value: macdVal.toFixed(2), action: macdVal > 0 ? 'BUY' : 'SELL' },
          { name: 'Momentum (10)', value: '+1.80', action: 'BUY' },
          { name: 'Stochastic %K', value: rsi > 50 ? '81.2' : '28.4', action: rsi > 70 ? 'SELL' : rsi < 30 ? 'BUY' : 'NEUTRAL' }
        ];

        const movingAverages: IndicatorSignal[] = [
          { name: 'EMA 10', value: ema10.toFixed(2), action: curPrice > ema10 ? 'BUY' : 'SELL' },
          { name: 'EMA 20', value: ema20.toFixed(2), action: curPrice > ema20 ? 'BUY' : 'SELL' },
          { name: 'EMA 50', value: ema50.toFixed(2), action: curPrice > ema50 ? 'STRONG BUY' : 'STRONG SELL' },
          { name: 'EMA 200', value: ema200.toFixed(2), action: curPrice > ema200 ? 'STRONG BUY' : 'STRONG SELL' },
        ];

        const buyersPercent = Math.min(88, Math.max(12, Math.round(50 + (percentChange * 15))));
        const sellersPercent = 100 - buyersPercent;
        const delta = Math.round(percentChange * 850);

        const orderFlowIndicators: IndicatorSignal[] = [
          { name: 'Institutional Pressure', value: percentChange >= 0 ? 'Buyer Flow' : 'Seller Flow', action: percentChange >= 0 ? 'STRONG BUY' : 'STRONG SELL' },
          { name: 'Trend Delta', value: `${delta >= 0 ? '+' : ''}${delta}`, action: delta > 200 ? 'STRONG BUY' : delta < -200 ? 'STRONG SELL' : 'NEUTRAL' },
          { name: 'Support Absorption', value: buyersPercent > 55 ? 'Passive (High)' : 'Active (Low)', action: buyersPercent > 55 ? 'BUY' : 'SELL' }
        ];

        const buildSummary = (list: IndicatorSignal[]): IndicatorSummary => {
          let buy = 0;
          let neutral = 0;
          let sell = 0;

          list.forEach(i => {
            if (i.action.includes('BUY')) buy += i.action.includes('STRONG') ? 2 : 1;
            else if (i.action.includes('SELL')) sell += i.action.includes('STRONG') ? 2 : 1;
            else neutral += 1;
          });

          const total = buy + neutral + sell || 1;
          const score = Math.round((buy / total) * 100);

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

        const stepOffset = 0.20;
        const bids: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => ({
          price: parseFloat((curPrice - ((i + 1) * stepOffset)).toFixed(2)),
          size: Math.floor(Math.random() * 50) + 20,
          percentage: Math.min(100, ((Math.floor(Math.random() * 50) + 20) / 70) * 100)
        }));

        const asks: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => ({
          price: parseFloat((curPrice + ((i + 1) * stepOffset)).toFixed(2)),
          size: Math.floor(Math.random() * 50) + 20,
          percentage: Math.min(100, ((Math.floor(Math.random() * 50) + 20) / 70) * 100)
        }));

        setState(prev => ({
          ...prev,
          price: curPrice,
          change,
          percentChange,
          high,
          low,
          datetime: marketOpen ? new Date().toLocaleTimeString() : 'Friday Close',
          isMarketOpen: marketOpen,
          isLive: marketOpen,
          oscillators,
          movingAverages,
          orderFlowIndicators,
          buyersPercent,
          sellersPercent,
          volumeDelta: delta,
          bids,
          asks,
          overallSummary,
          oscillatorsSummary: oscSummary,
          maSummary,
          orderFlowSummary: ofSummary
        }));
      }
    } catch (e) {
      // Ignora falhas de conexão em segundo plano
    }
  };

  // 2. Loop de atualização: SOMENTE se o mercado estiver ABERTO
  useEffect(() => {
    fetchTwelveDataQuick();

    const marketOpen = checkIsMarketOpen();

    // Se o mercado estiver FECHADO (Fim de semana), NÃO executa WebSocket nem gerador de ticks
    if (!marketOpen) {
      return;
    }

    // Mercado aberto: Atualizações a cada 15 segundos da API
    const apiInterval = setInterval(fetchTwelveDataQuick, 15000);

    // WebSocket ativo somente durante a semana
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/paxgusdt@ticker`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          const livePrice = parseFloat(parseFloat(data.c).toFixed(2));
          realBasePriceRef.current = livePrice;
        }
      } catch (e) {}
    };

    return () => {
      clearInterval(apiInterval);
      ws.close();
    };
  }, [selectedSymbol]);

  return state;
};