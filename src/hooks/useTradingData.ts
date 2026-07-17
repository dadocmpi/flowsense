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
    let initialPrice = 2380.90;
    if (selectedAsset.includes('BTC')) initialPrice = 65432.10;
    if (selectedAsset.includes('ETH')) initialPrice = 3452.10;
    if (selectedAsset.includes('EUR')) initialPrice = 1.08542;
    setPrice(initialPrice);
  }, [selectedAsset]);

  useEffect(() => {
    const symbol = selectedAsset.replace('/', '').toLowerCase();
    // Usar stream do BTCUSDT como base de tempo real se for forex/commodities para manter o dinamismo
    const streamName = (symbol === 'xauusd' || symbol === 'eurusd') ? 'btcusdt@aggTrade' : `${symbol}@aggTrade`;
    
    ws.current = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const rawPrice = parseFloat(data.p);
      const quantity = parseFloat(data.q);
      const isBuyerMaker = data.m;

      setPrice(currentPrice => {
        // Calcular variação proporcional para ativos diferentes do BTC
        let nextPrice = currentPrice;
        const changePercent = (rawPrice - 65000) / 65000 * 0.01; // variação sutil
        if (selectedAsset.includes('XAU')) {
          nextPrice = currentPrice + (isBuyerMaker ? -0.15 : 0.15) * (quantity * 5);
        } else if (selectedAsset.includes('EUR')) {
          nextPrice = currentPrice + (isBuyerMaker ? -0.00002 : 0.00002);
        } else {
          nextPrice = rawPrice;
        }

        // Gerar escada de preços ao redor do preço atual
        const step = selectedAsset.includes('EUR') ? 0.0001 : selectedAsset.includes('XAU') ? 0.5 : 10;
        
        const newBids: OrderBookLevel[] = [];
        const newAsks: OrderBookLevel[] = [];

        for (let i = 1; i <= 10; i++) {
          const bidPrice = nextPrice - (i * step);
          const askPrice = nextPrice + (i * step);
          
          // Tamanhos aleatórios mas realistas
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
          
          // Calcular porcentagem de compradores/vendedores baseada no delta
          const total = 10000;
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

export const generateMockCandles = (count: number) => {
  let basePrice = 65000;
  const data = [];
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