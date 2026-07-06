import React, { useState } from 'react';
import { Watchlist } from '../components/trading/Watchlist';
import { MainChart } from '../components/trading/MainChart';
import { DirectionalCompass } from '../components/trading/DirectionalCompass';
import { OrderFlowFeed } from '../components/trading/OrderFlowFeed';
import { useTradingData } from '../hooks/useTradingData';
import { Timeframe } from '../types/trading';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('M15');
  const { orderFlow, lastPrice } = useTradingData(selectedAsset);

  // Cálculo simples de bias baseado no último delta
  const biasScore = orderFlow.length > 0 
    ? Math.min(Math.max(50 + (orderFlow[0].delta / 10), 10), 90) 
    : 50;

  return (
    <div className="h-screen w-screen bg-black text-white overflow-hidden font-sans selection:bg-white/20">
      {/* Wrapper para o Zoom de 90% */}
      <div 
        className="flex h-full w-full origin-top-left"
        style={{ 
          transform: 'scale(0.9)', 
          width: '111.11%', 
          height: '111.11%' 
        }}
      >
        {/* Coluna Esquerda: Watchlist */}
        <div className="w-72 flex-shrink-0 border-r border-white/5">
          <Watchlist 
            selectedAsset={selectedAsset} 
            onSelect={setSelectedAsset} 
          />
        </div>

        {/* Coluna Central: Gráfico */}
        <div className="flex-grow flex flex-col min-w-0">
          <MainChart 
            asset={selectedAsset} 
            timeframe={timeframe} 
          />
        </div>

        {/* Coluna Direita: IA & Order Flow */}
        <div className="w-80 flex-shrink-0 border-l border-white/5 flex flex-col">
          <DirectionalCompass 
            score={Math.round(biasScore)} 
            bias={biasScore > 55 ? 'Bullish' : biasScore < 45 ? 'Bearish' : 'Neutral'} 
          />
          <OrderFlowFeed 
            data={orderFlow} 
          />
        </div>
      </div>
    </div>
  );
};

export default Index;