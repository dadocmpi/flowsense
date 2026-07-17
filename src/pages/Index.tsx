import React, { useState } from 'react';
import { Sidebar } from '../components/trading/Sidebar';
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
    <div className="h-screen w-screen bg-[#050608] text-white overflow-hidden font-sans flex items-center justify-center selection:bg-white/20">
      {/* Container Principal com Proporção de Monitor Vertical */}
      <div className="w-full max-w-[420px] h-full max-h-[900px] bg-[#0a0b0d] border border-white/[0.04] shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex overflow-hidden rounded-2xl">
        
        {/* Barra Lateral Esquerda */}
        <Sidebar />

        {/* Conteúdo Principal do Terminal */}
        <div className="flex-grow flex flex-col min-w-0 relative">
          
          {/* Barra de Topo com Seletor de Ativos */}
          <div className="absolute top-4 right-4 z-30">
            <AssetSelector 
              selectedAsset={selectedAsset} 
              onSelect={setSelectedAsset} 
            />
          </div>

          {/* Bússola do Trader */}
          <DirectionalCompass 
            score={compassScore} 
            asset={selectedAsset} 
          />

          {/* Grade de Métricas */}
          <MetricsGrid 
            metrics={metrics} 
          />

          {/* Fluxo de Ordens (Order Flow Ladder) */}
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