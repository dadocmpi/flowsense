import { useState, useEffect, useRef } from 'react';
import { OrderBookLevel, TradingMetrics, PriceZone, TechnicalIndicator } from '../types/trading';

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
    absorcao: 'ALTA',
    rsi: 62,
    macd: 'Alta (+12.4)',
    ema200: 'ACIMA',
    zones: [],
    indicators: []
  });
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const ws = useRef<WebSocket | null>(null);

  // Definir preço inicial baseado no ativo
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

        // Atualizar métricas dinamicamente
        setMetrics(prev => {
          const deltaChange = isBuyerMaker ? -Math.floor(quantity * 12) : Math.floor(quantity * 12);
          const newDelta = Math.max(-5000, Math.min(5000, prev.delta + deltaChange));
          
          const buyersVal = Math.max(15, Math.min(85, Math.round(50 + (newDelta / 120))));
          const sellersVal = 100 - buyersVal;

          let tendencia: TradingMetrics['tendencia'] = 'NEUTRO';
          if (buyersVal > 65) tendencia = 'ALTA FORTE';
          else if (buyersVal > 52) tendencia = 'ALTA';
          else if (buyersVal < 35) tendencia = 'BAIXA FORTE';
          else if (buyersVal < 48) tendencia = 'BAIXA';

          // Gerar zonas de suporte e resistência dinâmicas ao redor do preço atual
          const zones: PriceZone[] = [
            { type: 'RESISTÊNCIA', price: nextPrice + (step * 15), strength: 'FORTE', tested: 4 },
            { type: 'RESISTÊNCIA', price: nextPrice + (step * 8), strength: 'MÉDIA', tested: 2 },
            { type: 'SUPORTE', price: nextPrice - (step * 6), strength: 'MÉDIA', tested: 3 },
            { type: 'SUPORTE', price: nextPrice - (step * 12), strength: 'FORTE', tested: 5 },
          ];

          // Gerar indicadores técnicos dinâmicos
          const rsiVal = Math.max(10, Math.min(90, Math.round(50 + (newDelta / 100))));
          const indicators: TechnicalIndicator[] = [
            { name: 'RSI (14)', value: rsiVal, status: rsiVal > 70 ? 'VENDA' : rsiVal < 30 ? 'COMPRA' : 'NEUTRO' },
            { name: 'MACD (12, 26)', value: buyersVal > 50 ? 'Bullish' : 'Bearish', status: buyersVal > 55 ? 'COMPRA' : buyersVal < 45 ? 'VENDA' : 'NEUTRO' },
            { name: 'Estocástico', value: buyersVal > 50 ? 'Sobrecompra' : 'Sobrevenda', status: buyersVal > 70 ? 'VENDA' : buyersVal < 30 ? 'COMPRA' : 'NEUTRO' },
            { name: 'Médias Móveis (EMA 20)', value: nextPrice > nextPrice - (step * 2) ? 'Acima' : 'Abaixo', status: nextPrice > nextPrice - (step * 2) ? 'COMPRA FORTE' : 'VENDA FORTE' },
          ];

          return {
            tendencia,
            forca: Math.abs(newDelta) > 1500 ? 'FORTE' : 'MODERADA',
            momento: buyersVal > 50 ? 'ALTISTA' : 'BAIXISTA',
            confluencia: Math.abs(newDelta) > 2000 ? 'ALTA' : 'MEDIA',
            buyersPercent: buyersVal,
            sellersPercent: sellersVal,
            delta: newDelta,
            absorcao: Math.abs(newDelta) > 1800 ? 'ALTA' : 'MEDIA',
            rsi: rsiVal,
            macd: buyersVal > 50 ? 'Alta (+8.2)' : 'Baixa (-6.4)',
            ema200: nextPrice > nextPrice - (step * 10) ? 'ACIMA' : 'ABAIXO',
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