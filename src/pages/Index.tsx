import React, { useState } from 'react';
import { DirectionalCompass } from '../components/trading/DirectionalCompass';
import { MetricsGrid } from '../components/trading/MetricsGrid';
import { OrderFlowFeed } from '../components/trading/OrderFlowFeed';
import { AssetSelector } from '../components/trading/AssetSelector';
import { useTradingData } from '../hooks/useTradingData';
import { TrendingUp } from 'lucide-react';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('XAU/USD');
  const { price, metrics, bids, asks } = useTradingData(selectedAsset);

  const compassScore = metrics.buyersPercent;

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-white/20">
      
      {/* Cabeçalho Premium do Site */}
      <header className="w-full border-b border-white/[0.03] bg-[#0a0b0d]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <TrendingUp size={18} className="text-amber-500" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-white">QUANTUM ANALYTICS</h1>
            <p className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Terminal de Fluxo Institucional</p>
          </div>
        </div>

        {/* Seletor de Ativos e Status de Conexão */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.04] px-3 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />
            <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider">WebSocket Ativo</span>
          </div>
          <AssetSelector 
            selectedAsset={selectedAsset} 
            onSelect={setSelectedAsset} 
          />
        </div>
      </header>

      {/* Área de Conteúdo Principal (Layout de Duas Colunas) */}
      <main className="flex-grow p-6 max-w-[1400px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Coluna Esquerda: Bússola + Grade de Métricas (7/12 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          {/* Bússola de Sentimento */}
          <div className="flex-grow flex items-center justify-center bg-[#0d0e12] rounded-2xl border border-white/[0.03] p-6">
            <div className="w-full max-w-md">
              <DirectionalCompass 
                score={compassScore} 
                asset={selectedAsset} 
              />
            </div>
          </div>

          {/* Grade de Métricas Rápidas */}
          <div className="rounded-2xl overflow-hidden border border-white/[0.03]">
            <MetricsGrid 
              metrics={metrics} 
            />
          </div>
        </div>

        {/* Coluna Direita: Escada de Order Flow (5/12 cols) */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-[500px] lg:min-h-0">
          <div className="flex-grow rounded-2xl overflow-hidden border border-white/[0.03] flex flex-col">
            <OrderFlowFeed 
              bids={bids}
              asks={asks}
              currentPrice={price}
              metrics={metrics}
              asset={selectedAsset}
            />
          </div>
        </div>

      </main>
    </div>
  );
};

export default Index;