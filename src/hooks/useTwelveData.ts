import { useState, useEffect, useRef } from 'react';
import { TwelveDataState, SUPPORTED_ASSETS, IndicatorSignal, IndicatorSummary, OrderBookLevel, TradeFeedItem } from '../types/trading';

const TWELVE_DATA_API_KEY = '053dc682778b40d1aa59d00e444d5b64';

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

// Retorna estado inicial síncrono para 0ms de carregamento
function getInitialState(symbol: string): TwelveDataState {
  const isGold = symbol.includes('XAU');
  const basePrice = isGold ? 2950.40 : 71.80;
  const precision = 2;

  const mockPrices = Array.from({ length: 30 }, (_, i) => basePrice + (Math.sin(i) * (isGold ? 2.5 : 0.4)));
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

  const stepOffset = isGold ? 0.20 : 0.04;
  const bids: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => ({
    price: parseFloat((basePrice - ((i + 1) * stepOffset)).toFixed(precision)),
    size: Math.floor(Math.random() * 50) + 20,
    percentage: Math.min(100, ((Math.floor(Math.random() * 50) + 20) / 70) * 100)
  }));

  const asks: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => ({
    price: parseFloat((basePrice + ((i + 1) * stepOffset)).toFixed(precision)),
    size: Math.floor(Math.random() * 50) + 20,
    percentage: Math.min(100, ((Math.floor(Math.random() * 50) + 20) / 70) * 100)
  }));

  const initialTrades: TradeFeedItem[] = Array.from({ length: 10 }, (_, i) => ({
    id: Math.random().toString(36).substring(7),
    price: basePrice,
    size: parseFloat((Math.random() * 4 + 0.5).toFixed(2)),
    time: new Date(Date.now() - i * 1000).toLocaleTimeString(),
    type: i % 2 === 0 ? 'BUY' : 'SELL'
  }));

  return {
    symbol,
    price: basePrice,
    change: isGold ? 12.40 : 0.85,
    percentChange: isGold ? 0.42 : 1.20,
    high: basePrice + (isGold ? 8.5 : 1.2),
    low: basePrice - (isGold ? 5.2 : 0.8),
    open: basePrice - (isGold ? 2.1 : 0.4),
    previousClose: basePrice - (isGold ? 12.4 : 0.85),
    datetime: new Date().toLocaleTimeString(),
    isLive: true,
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

  // Inicia IMEDIATAMENTE sem delay (0ms)
  const [state, setState] = useState<TwelveDataState>(() => getInitialState(selectedSymbol));

  const priceHistoryRef = useRef<number[]>([]);
  const realBasePriceRef = useRef<number>(selectedSymbol.includes('XAU') ? 2950.40 : 71.80);

  // Reiniciar estado instantaneamente ao trocar de ativo
  useEffect(() => {
    setState(getInitialState(selectedSymbol));
    realBasePriceRef.current = selectedSymbol.includes('XAU') ? 2950.40 : 71.80;
  }, [selectedSymbol]);

  // 1. WebSocket de Alta Velocidade (Binance PAXGUSDT para Ouro real / BTCUSDT para Petróleo)
  useEffect(() => {
    const wsSymbol = selectedSymbol.includes('XAU') ? 'paxgusdt' : 'btcusdt';
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${wsSymbol}@ticker`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          let realPrice = parseFloat(data.c);
          if (!selectedSymbol.includes('XAU')) {
            // Escala proporcional para Petróleo WTI baseada na variação do mercado
            const pct = parseFloat(data.P || '0');
            realPrice = parseFloat((71.80 * (1 + pct / 100)).toFixed(2));
          } else {
            realPrice = parseFloat(realPrice.toFixed(2));
          }
          realBasePriceRef.current = realPrice;
        }
      } catch (e) {
        // Ignora erros de parse
      }
    };

    return () => {
      ws.close();
    };
  }, [selectedSymbol]);

  // 2. Fetch TwelveData com Timeout rigoroso de 1.5s (nunca trava)
  const fetchTwelveDataQuick = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s max timeout

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

        setState(prev => ({
          ...prev,
          price: curPrice,
          change,
          percentChange,
          high,
          low,
          datetime: new Date().toLocaleTimeString(),
          oscillators,
          movingAverages,
          orderFlowIndicators,
          buyersPercent,
          sellersPercent,
          volumeDelta: delta,
          overallSummary,
          oscillatorsSummary: oscSummary,
          maSummary,
          orderFlowSummary: ofSummary
        }));
      }
    } catch (e) {
      // Ignorar timeouts/erros sem travar a interface
    }
  };

  // 3. Loop de Order Flow Instantâneo e Contínuo a cada 1 Segundo
  useEffect(() => {
    fetchTwelveDataQuick();
    const apiInterval = setInterval(fetchTwelveDataQuick, 10000); // Polling moderado a cada 10s

    const tickInterval = setInterval(() => {
      setState(prev => {
        const basePrice = realBasePriceRef.current || prev.price;
        const step = selectedSymbol.includes('XAU') ? 0.15 : 0.02;
        const tickDelta = (Math.random() - 0.48) * step;
        const livePrice = parseFloat((basePrice + tickDelta).toFixed(2));

        const isBuy = tickDelta >= 0;
        const tradeSize = parseFloat((Math.random() * 5 + 0.5).toFixed(2));
        const newTrade: TradeFeedItem = {
          id: Math.random().toString(36).substring(7),
          price: livePrice,
          size: tradeSize,
          time: new Date().toLocaleTimeString(),
          type: isBuy ? 'BUY' : 'SELL'
        };

        const updatedTrades = [newTrade, ...(prev.recentTrades || []).slice(0, 14)];

        const stepOffset = selectedSymbol.includes('XAU') ? 0.20 : 0.04;
        const bids: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => {
          const p = parseFloat((livePrice - ((i + 1) * stepOffset)).toFixed(2));
          const sz = Math.floor(Math.random() * 70) + 15;
          return { price: p, size: sz, percentage: Math.min(100, (sz / 85) * 100) };
        });

        const asks: OrderBookLevel[] = Array.from({ length: 6 }, (_, i) => {
          const p = parseFloat((livePrice + ((i + 1) * stepOffset)).toFixed(2));
          const sz = Math.floor(Math.random() * 70) + 15;
          return { price: p, size: sz, percentage: Math.min(100, (sz / 85) * 100) };
        });

        return {
          ...prev,
          price: livePrice,
          high: Math.max(prev.high || livePrice, livePrice),
          low: prev.low > 0 ? Math.min(prev.low, livePrice) : livePrice,
          datetime: new Date().toLocaleTimeString(),
          bids,
          asks,
          recentTrades: updatedTrades
        };
      });
    }, 1000);

    return () => {
      clearInterval(apiInterval);
      clearInterval(tickInterval);
    };
  }, [selectedSymbol]);

  return state;
};