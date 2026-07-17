import { useState, useEffect, useRef } from 'react';
import { OrderBookLevel, TradingMetrics } from '../types/trading';

export const useTradingData = (selectedAsset: string) => {
  const [price, setPrice] = useState<number>(0);
  const [metrics, setMetrics] = useState<TradingMetrics>({
    tendencia: 'ALTA FORTE',
    forca: 'FORTE',
    momento: 'ALTISTA',
    confluencia: 'ALTA',
    buyersPercent: 67,
    sellersPercent: 33,
    delta: 1254,
    absorcao: 'ALTA'
  });
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const ws = useRef<WebSocket | null>(null);

  // Definir preço inicial baseado no ativo
  useEffect(() => {
    let initialPrice = 2380.90; // XAU/USD
    if (selectedAsset.includes('OIL')) initialPrice = 78.45; // OIL/USD (Crude Oil)
    setPrice(initialPrice);
  }, [selectedAsset]);

  useEffect(() => {
    // Usar stream do BTCUSDT como base de tempo real para manter o dinamismo do fluxo de ordens
    ws.current = new WebSocket(`wss://stream.binance.com:9443/ws/btcusdt@aggTrade`);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const quantity = parseFloat(data.q);
      const isBuyerMaker = data.m;

      setPrice(currentPrice => {
        let nextPrice = currentPrice;
        
        if (selectedAsset.includes('XAU')) {
          nextPrice = currentPrice + (isBuyerMaker ? -0.12 : 0.12) * (quantity * 3);
        } else if (selectedAsset.includes('OIL')) {
          nextPrice = currentPrice + (isBuyerMaker ? -0.03 : 0.03) * (quantity * 1.5);
        }

        // Gerar escada de preços ao redor do preço atual
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

        // Atualizar métricas dinamicamente
        setMetrics(prev => {
          const deltaChange = isBuyerMaker ? -Math.floor(quantity * 15) : Math.floor(quantity * 15);
          const newDelta = Math.max(-5000, Math.min(5000, prev.delta + deltaChange));
          
          const buyersVal = Math.max(20, Math.min(80, Math.round(50 + (newDelta / 150))));
          const sellersVal = 100 - buyersVal;

          let tendencia: TradingMetrics['tendencia'] = 'NEUTRO';
          if (buyersVal > 60) tendencia = 'ALTA FORTE';
          else if (buyersVal > 52) tendencia = 'ALTA';
          else if (buyersVal < 40) tendencia = 'BAIXA FORTE';
          else if (buyersVal < 48) tendencia = 'BAIXA';

          return {
            tendencia,
            forca: Math.abs(newDelta) > 1500 ? 'FORTE' : 'MODERADA',
            momento: buyersVal > 50 ? 'ALTISTA' : 'BAIXISTA',
            confluencia: Math.abs(newDelta) > 2000 ? 'ALTA' : 'MEDIA',
            buyersPercent: buyersVal,
            sellersPercent: sellersVal,
            delta: newDelta,
            absorcao: Math.abs(newDelta) > 1800 ? 'ALTA' : 'MEDIA'
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