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
    <div className="h-screen w-screen bg-[#050608] text-white overflow-hidden font-sans flex items-center justify-center selection:bg-white/20">
      {/* Container Principal Minimalista */}
      <div className="w-full max-w-[380px] h-full max-h-[820px] bg-[#0a0b0d] border border-white/[0.04] shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden rounded-3xl relative">
        
        {/* Seletor de Ativos Flutuante no Topo */}
        <div className="absolute top-4 right-4 z-30">
          <AssetSelector 
            selectedAsset={selectedAsset} 
            onSelect={setSelectedAsset} 
          />
        </div>

        {/* Bússola do Trader (Sem títulos redundantes) */}
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
  );
};

export default Index;