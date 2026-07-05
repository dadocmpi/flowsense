import { useState, useEffect } from 'react';
import { Asset, OrderFlowRow } from '../types/trading';

export const useTradingData = (selectedAsset: string) => {
  const [orderFlow, setOrderFlow] = useState<OrderFlowRow[]>([]);
  
  // Gerar dados iniciais de Order Flow
  useEffect(() => {
    const initialData: OrderFlowRow[] = Array.from({ length: 15 }).map((_, i) => ({
      id: Math.random().toString(36).substr(2, 9),
      time: new Date(Date.now() - i * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      delta: Math.floor(Math.random() * 2000) - 1000,
      absorption: Math.random() > 0.8 ? 'High' : 'None',
      imbalance: Math.random() > 0.7 ? (Math.random() > 0.5 ? 'Buy' : 'Sell') : 'None',
      efficiency: Math.floor(Math.random() * 100),
      displacement: Math.random() > 0.8,
    }));
    setOrderFlow(initialData);

    const interval = setInterval(() => {
      setOrderFlow(prev => {
        const newRow: OrderFlowRow = {
          id: Math.random().toString(36).substr(2, 9),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          delta: Math.floor(Math.random() * 2000) - 1000,
          absorption: Math.random() > 0.8 ? 'High' : 'None',
          imbalance: Math.random() > 0.7 ? (Math.random() > 0.5 ? 'Buy' : 'Sell') : 'None',
          efficiency: Math.floor(Math.random() * 100),
          displacement: Math.random() > 0.8,
        };
        return [newRow, ...prev.slice(0, 19)];
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedAsset]);

  return { orderFlow };
};

export const generateMockCandles = (count: number) => {
  let basePrice = 1.0850;
  const data = [];
  const now = Math.floor(Date.now() / 1000);
  
  for (let i = 0; i < count; i++) {
    const open = basePrice + (Math.random() - 0.5) * 0.002;
    const close = open + (Math.random() - 0.5) * 0.002;
    const high = Math.max(open, close) + Math.random() * 0.001;
    const low = Math.min(open, close) - Math.random() * 0.001;
    
    data.push({
      time: (now - (count - i) * 60) as any,
      open,
      high,
      low,
      close,
    });
    basePrice = close;
  }
  return data;
};