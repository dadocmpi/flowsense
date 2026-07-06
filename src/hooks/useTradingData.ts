import { useState, useEffect, useRef } from 'react';
import { OrderFlowRow } from '../types/trading';

export const useTradingData = (selectedAsset: string) => {
  const [orderFlow, setOrderFlow] = useState<OrderFlowRow[]>([]);
  const [lastPrice, setLastPrice] = useState<number>(0);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const symbol = selectedAsset.replace('/', '').toLowerCase();
    const streamName = `${symbol === 'eurusd' ? 'btcusdt' : symbol}@aggTrade`;
    
    ws.current = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const price = parseFloat(data.p);
      const quantity = parseFloat(data.q);
      const isBuyerMaker = data.m;

      setLastPrice(price);

      const newRow: OrderFlowRow = {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        delta: isBuyerMaker ? -Math.floor(quantity * 100) : Math.floor(quantity * 100),
        absorption: quantity > 0.5 ? 'High' : 'None',
        imbalance: quantity > 0.8 ? (isBuyerMaker ? 'Sell' : 'Buy') : 'None',
        efficiency: Math.floor(Math.random() * 40) + 60,
        displacement: quantity > 1,
      };

      setOrderFlow(prev => [newRow, ...prev.slice(0, 19)]);
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [selectedAsset]);

  return { orderFlow, lastPrice };
};

export const generateMockCandles = (count: number) => {
  let basePrice = 65000;
  const data = [];
  // Usar timestamp em segundos (padrão lightweight-charts)
  const now = Math.floor(Date.now() / 1000);
  const secondsInMinute = 60;
  
  for (let i = 0; i < count; i++) {
    const open = basePrice + (Math.random() - 0.5) * 50;
    const close = open + (Math.random() - 0.5) * 50;
    const high = Math.max(open, close) + Math.random() * 20;
    const low = Math.min(open, close) - Math.random() * 20;
    
    data.push({
      time: (now - (count - i) * secondsInMinute) as any,
      open,
      high,
      low,
      close,
    });
    basePrice = close;
  }
  return data;
};