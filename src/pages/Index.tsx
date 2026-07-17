import React, { useState } from 'react';
import { DirectionalCompass } from '../components/trading/DirectionalCompass';
import { MetricsGrid } from '../components/trading/MetricsGrid';
import { OrderFlowFeed } from '../components/trading/OrderFlowFeed';
import { AssetSelector } from '../components/trading/AssetSelector';
import { useTradingData } from '../hooks/useTradingData';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('XAU/USD');
  const { price, metrics, bids, asks } = useTradingData(selectedAsset);

  // Calcular score da bússola baseado na porcentagem de compradores
  const compassScore = metrics.buyersPercent;

  return (
    <div className="h-screen w-screen bg-[#050608] text-white overflow-hidden font-sans flex items-center justify-center p-4 selection:bg-white/20">
      {/* Container Principal Horizontal Premium */}
      <div className="w-full max-w-[860px] h-[540px] bg-[#0a0b0d] border border-white/[0.04] shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex overflow-hidden rounded-3xl relative">
        
        {/* Seletor de Ativos Flutuante no Topo Esquerdo */}
        <div className="absolute top-4 left-4 z-30">
          <AssetSelector 
            selectedAsset={selectedAsset} 
            onSelect={setSelectedAsset} 
          />
        </div>

        {/* Painel Esquerdo: Bússola + Métricas */}
        <div className="w-[55%] flex flex-col border-r border-white/[0.04] h-full">
          {/* Bússola do Trader (Centralizada e com espaçamento ajustado para o layout horizontal) */}
          <div className="flex-grow flex items-center justify-center pt-8">
            <DirectionalCompass 
              score={compassScore} 
              asset={selectedAsset} 
            />
          </div>

          {/* Grade de Métricas na Base do Painel Esquerdo */}
          <MetricsGrid 
            metrics={metrics} 
          />
        </div>

        {/* Painel Direito: Fluxo de Ordens (Order Flow Ladder) */}
        <div className="w-[45%] flex flex-col h-full">
          <OrderFlowFeed 
            bids={bids}
            asks={asks}
            currentPrice={price}
            metrics={metrics}
            asset={selectedAsset}
          />
        </div>

      </div>
    </div>
  );
};

export default Index;