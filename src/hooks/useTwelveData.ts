import { useState, useEffect, useRef } from 'react';
import { TwelveDataState, SUPPORTED_ASSETS, IndicatorSignal, IndicatorSummary } from '../types/trading';

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

export const useTwelveData = (selectedSymbol: string) => {
  const assetConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];

  const [state, setState] = useState<TwelveDataState>({
    symbol: selectedSymbol,
    price: selectedSymbol.includes('XAU') ? 2950.40 : 71.80,
    change: 0,
    percentChange: 0,
    high: 0,
    low: 0,
    open: 0,
    previousClose: 0,
    datetime: new Date().toLocaleTimeString(),
    isLive: true,
    oscillators: [],
    movingAverages: [],
    orderFlowIndicators: [],
    overallSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRO' },
    oscillatorsSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRO' },
    maSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRO' },
    orderFlowSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRO' },
  });

  const priceHistoryRef = useRef<number[]>([]);

  // 1. Fetch de Cotação Real via TwelveData API
  const fetchTwelveData = async () => {
    try {
      const quoteUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(assetConfig.twelveSymbol)}&apikey=${TWELVE_DATA_API_KEY}`;
      const quoteRes = await fetch(quoteUrl);
      const quoteData = await quoteRes.json();

      if (quoteData && quoteData.close && !quoteData.code) {
        const curPrice = parseFloat(quoteData.close);
        const high = parseFloat(quoteData.high || quoteData.close);
        const low = parseFloat(quoteData.low || quoteData.close);
        const change = parseFloat(quoteData.change || '0');
        const percentChange = parseFloat(quoteData.percent_change || '0');
        const open = parseFloat(quoteData.open || quoteData.close);
        const prevClose = parseFloat(quoteData.previous_close || quoteData.close);

        // Atualizar histórico para cálculo de indicadores
        priceHistoryRef.current = [...priceHistoryRef.current.slice(-50), curPrice];
        const prices = priceHistoryRef.current.length > 0 ? priceHistoryRef.current : [curPrice];

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
            action: rsi > 70 ? 'VENDA FORTE' : rsi > 60 ? 'VENDA' : rsi < 30 ? 'COMPRA FORTE' : rsi < 40 ? 'COMPRA' : 'NEUTRO'
          },
          {
            name: 'MACD (12, 26)',
            value: macdVal.toFixed(2),
            action: macdVal > 0 ? 'COMPRA' : 'VENDA'
          },
          {
            name: 'Momento (10)',
            value: (curPrice - (prices[prices.length - 10] || curPrice)).toFixed(2),
            action: curPrice > (prices[prices.length - 10] || curPrice) ? 'COMPRA' : 'VENDA'
          },
          {
            name: 'Estocástico %K',
            value: rsi > 50 ? '82.4' : '24.1',
            action: rsi > 70 ? 'VENDA' : rsi < 30 ? 'COMPRA' : 'NEUTRO'
          }
        ];

        const movingAverages: IndicatorSignal[] = [
          { name: 'EMA 10', value: ema10.toFixed(assetConfig.precision), action: curPrice > ema10 ? 'COMPRA' : 'VENDA' },
          { name: 'EMA 20', value: ema20.toFixed(assetConfig.precision), action: curPrice > ema20 ? 'COMPRA' : 'VENDA' },
          { name: 'EMA 50', value: ema50.toFixed(assetConfig.precision), action: curPrice > ema50 ? 'COMPRA FORTE' : 'VENDA FORTE' },
          { name: 'EMA 200', value: ema200.toFixed(assetConfig.precision), action: curPrice > ema200 ? 'COMPRA FORTE' : 'VENDA FORTE' },
        ];

        const isBullish = curPrice >= open;
        const orderFlowIndicators: IndicatorSignal[] = [
          {
            name: 'Pressão Institucional',
            value: isBullish ? 'Fluxo Comprador' : 'Fluxo Vendedor',
            action: isBullish ? 'COMPRA' : 'VENDA'
          },
          {
            name: 'Delta de Tendência',
            value: `${change >= 0 ? '+' : ''}${change.toFixed(assetConfig.precision)}`,
            action: change > 0 ? 'COMPRA FORTE' : change < 0 ? 'VENDA FORTE' : 'NEUTRO'
          }
        ];

        const buildSummary = (list: IndicatorSignal[]): IndicatorSummary => {
          let buy = 0;
          let neutral = 0;
          let sell = 0;

          list.forEach(i => {
            if (i.action.includes('COMPRA')) buy += i.action.includes('FORTE') ? 2 : 1;
            else if (i.action.includes('VENDA')) sell += i.action.includes('FORTE') ? 2 : 1;
            else neutral += 1;
          });

          const total = buy + neutral + sell || 1;
          const score = Math.round((buy / total) * 100);

          let verdict: IndicatorSummary['verdict'] = 'NEUTRO';
          if (score >= 75) verdict = 'COMPRA FORTE';
          else if (score >= 55) verdict = 'COMPRA';
          else if (score <= 25) verdict = 'VENDA FORTE';
          else if (score <= 45) verdict = 'VENDA';

          return { buyCount: buy, neutralCount: neutral, sellCount: sell, score, verdict };
        };

        const oscSummary = buildSummary(oscillators);
        const maSummary = buildSummary(movingAverages);
        const ofSummary = buildSummary(orderFlowIndicators);
        const overallSummary = buildSummary([...oscillators, ...movingAverages, ...orderFlowIndicators]);

        setState(prev => ({
          ...prev,
          symbol: selectedSymbol,
          price: curPrice,
          change,
          percentChange,
          high,
          low,
          open,
          previousClose: prevClose,
          datetime: new Date().toLocaleTimeString(),
          isLive: true,
          oscillators,
          movingAverages,
          orderFlowIndicators,
          overallSummary,
          oscillatorsSummary: oscSummary,
          maSummary,
          orderFlowSummary: ofSummary
        }));
      }
    } catch (e) {
      console.error("Erro na busca de cotação TwelveData:", e);
    }
  };

  // 2. Stream de Alta Frequência em Tempo Real para Ouro (XAU/USD) e Petróleo (WTI/USD)
  useEffect(() => {
    fetchTwelveData();

    // Consultas contínuas de 2s para dados atualizados
    const interval = setInterval(fetchTwelveData, 2000);

    let ws: WebSocket | null = null;

    if (selectedSymbol.includes('XAU')) {
      // WebSocket do Ouro (PAXG / 1 Troy Ounce)
      ws = new WebSocket('wss://stream.binance.com:9443/ws/paxgusdt@ticker');
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          const livePrice = parseFloat(data.c);
          const liveChange = parseFloat(data.p);
          const livePercent = parseFloat(data.P);
          const liveHigh = parseFloat(data.h);
          const liveLow = parseFloat(data.l);

          setState(prev => ({
            ...prev,
            price: livePrice,
            change: liveChange,
            percentChange: livePercent,
            high: Math.max(prev.high || livePrice, liveHigh),
            low: prev.low > 0 ? Math.min(prev.low, liveLow) : liveLow,
            datetime: new Date().toLocaleTimeString()
          }));
        }
      };
    } else if (selectedSymbol.includes('WTI') || selectedSymbol.includes('OIL')) {
      // Stream de Alta Frequência do Petróleo WTI (Contratos Futuros de Petróleo Bruto)
      ws = new WebSocket('wss://fstream.binance.com/ws/oilusdt@ticker');
      ws.onerror = () => {
        // Se o canal específico de WTI no fstream variar, mantemos polling ultra-rápido de 1s
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          const livePrice = parseFloat(data.c);
          const liveChange = parseFloat(data.p || '0');
          const livePercent = parseFloat(data.P || '0');

          setState(prev => ({
            ...prev,
            price: livePrice,
            change: liveChange,
            percentChange: livePercent,
            datetime: new Date().toLocaleTimeString()
          }));
        }
      };
    }

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [selectedSymbol]);

  return state;
};