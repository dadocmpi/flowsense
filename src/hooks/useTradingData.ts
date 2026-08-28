import { useState, useEffect, useRef } from 'react';
import { OrderBookLevel, TradingMetrics, PriceZone, TechnicalIndicator } from '../types/trading';

export const useTradingData = (selectedAsset: string) => {
  const [price, setPrice] = useState<number>(0);
  const [metrics, setMetrics] = useState<TradingMetrics>({
    tendencia: 'STRONG BULLISH',
    forca: 'STRONG',
    momento: 'BULLISH',
    confluencia: 'HIGH',
    buyersPercent: 67,
    sellersPercent: 33,
    delta: 1254,
    absorcao: 'HIGH',
    rsi: 62,
    macd: 'Bullish (+12.4)',
    ema200: 'ABOVE',
    zones: [],
    indicators: []
  });
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const ws = useRef<WebSocket | null>(null);

  // Set initial price based on asset
  useEffect(() => {
    let initialPrice = 2380.90; // XAU/USD
    if (selectedAsset.includes('OIL')) initialPrice = 78.45; // OIL/USD
    setPrice(initialPrice);
  }, [selectedAsset]);

  useEffect(() => {
    ws.current = new WebSocket(`wss://stream.binance.com:9443/ws/btcusdt@aggTrade`);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const quantity = parseFloat(data.q);
      const isBuyerMaker = data.m;

      setPrice(currentPrice => {
        let nextPrice = currentPrice;
        
        if (selectedAsset.includes('XAU')) {
          nextPrice = currentPrice + (isBuyerMaker ? -0.15 : 0.15) * (quantity * 2.5);
        } else if (selectedAsset.includes('OIL')) {
          nextPrice = currentPrice + (isBuyerMaker ? -0.02 : 0.02) * (quantity * 1.2);
        }

        const step = selectedAsset.includes('OIL') ? 0.05 : 0.2;
        
        const newBids: OrderBookLevel[] = [];
        const newAsks: OrderBookLevel[] = [];

        for (let i = 1; i <= 10; i++) {
          const bidPrice = nextPrice - (i * step);
          const askPrice = nextPrice + (i * step);
          const bidSize = Math.floor(Math.random() * 80) + 20;
          const askSize = Math.floor(Math.random() * 80) + 20;

          newBids.push({
            price: bidPrice,
            size: bidSize,
            percentage: Math.min(100, (bidSize / 100) * 100)
          });

          newAsks.push({
            price: askPrice,
            size: askSize,
            percentage: Math.min(100, (askSize / 100) * 100)
          });
        }

        setBids(newBids);
        setAsks(newAsks);

        // Update metrics dynamically
        setMetrics(prev => {
          const deltaChange = isBuyerMaker ? -Math.floor(quantity * 12) : Math.floor(quantity * 12);
          const newDelta = Math.max(-5000, Math.min(5000, prev.delta + deltaChange));
          
          const buyersVal = Math.max(15, Math.min(85, Math.round(50 + (newDelta / 120))));
          const sellersVal = 100 - buyersVal;

          let tendencia: TradingMetrics['tendencia'] = 'NEUTRAL';
          if (buyersVal > 65) tendencia = 'STRONG BULLISH';
          else if (buyersVal > 52) tendencia = 'BULLISH';
          else if (buyersVal < 35) tendencia = 'STRONG BEARISH';
          else if (buyersVal < 48) tendencia = 'BEARISH';

          const zones: PriceZone[] = [
            { type: 'RESISTANCE', price: nextPrice + (step * 15), strength: 'STRONG', tested: 4 },
            { type: 'RESISTANCE', price: nextPrice + (step * 8), strength: 'MEDIUM', tested: 2 },
            { type: 'SUPPORT', price: nextPrice - (step * 6), strength: 'MEDIUM', tested: 3 },
            { type: 'SUPPORT', price: nextPrice - (step * 12), strength: 'STRONG', tested: 5 },
          ];

          const rsiVal = Math.max(10, Math.min(90, Math.round(50 + (newDelta / 100))));
          const indicators: TechnicalIndicator[] = [
            { name: 'RSI (14)', value: rsiVal, status: rsiVal > 70 ? 'SELL' : rsiVal < 30 ? 'BUY' : 'NEUTRAL' },
            { name: 'MACD (12, 26)', value: buyersVal > 50 ? 'Bullish' : 'Bearish', status: buyersVal > 55 ? 'BUY' : buyersVal < 45 ? 'SELL' : 'NEUTRAL' },
            { name: 'Stochastic', value: buyersVal > 50 ? 'Overbought' : 'Oversold', status: buyersVal > 70 ? 'SELL' : buyersVal < 30 ? 'BUY' : 'NEUTRAL' },
            { name: 'Moving Avg (EMA 20)', value: nextPrice > nextPrice - (step * 2) ? 'Above' : 'Below', status: nextPrice > nextPrice - (step * 2) ? 'STRONG BUY' : 'STRONG SELL' },
          ];

          return {
            tendencia,
            forca: Math.abs(newDelta) > 1500 ? 'STRONG' : 'MODERATE',
            momento: buyersVal > 50 ? 'BULLISH' : 'BEARISH',
            confluencia: Math.abs(newDelta) > 2000 ? 'HIGH' : 'MEDIUM',
            buyersPercent: buyersVal,
            sellersPercent: sellersVal,
            delta: newDelta,
            absorcao: Math.abs(newDelta) > 1800 ? 'HIGH' : 'MEDIUM',
            rsi: rsiVal,
            macd: buyersVal > 50 ? 'Bullish (+8.2)' : 'Bearish (-6.4)',
            ema200: nextPrice > nextPrice - (step * 10) ? 'ABOVE' : 'BELOW',
            zones,
            indicators
          };
        });

        return nextPrice;
      });
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [selectedAsset]);

  return { price, metrics, bids, asks };
};