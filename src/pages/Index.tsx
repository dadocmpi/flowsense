import React, { useState } from 'react';
import { DirectionalCompass } from '../components/trading/DirectionalCompass';
import { MetricsGrid } from '../components/trading/MetricsGrid';
import { OrderFlowFeed } from '../components/trading/OrderFlowFeed';
import { AdvancedAnalysis } from '../components/trading/AdvancedAnalysis';
import { AssetSelector } from '../components/trading/AssetSelector';
import { useTradingData } from '../hooks/useTradingData';
import { TrendingUp, ShieldAlert, RefreshCw } from 'lucide-react';

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

      {/* Área de Conteúdo Principal (Layout de Tela Cheia Responsivo) */}
      <main className="flex-grow p-6 max-w-[1600px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Coluna Esquerda: Bússola + Grade de Métricas (4/12 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          {/* Bússola de Sentimento */}
          <div className="flex-grow">
            <DirectionalCompass 
              score={compassScore} 
              asset={selectedAsset} 
            />
          </div>

          {/* Grade de Métricas Rápidas */}
          <div className="rounded-2xl overflow-hidden border border-white/[0.03]">
            <MetricsGrid 
              metrics={metrics} 
            />
          </div>
        </div>

        {/* Coluna Central: Super Análises Internas (5/12 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          {/* Painel de Super Análises */}
          <div className="flex-grow">
            <AdvancedAnalysis 
              metrics={metrics} 
              asset={selectedAsset} 
            />
          </div>

          {/* Banner de Alerta de Risco / Informação */}
          <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl flex items-start space-x-3">
            <ShieldAlert size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Aviso de Volatilidade</span>
              <p className="text-[10px] text-white/50 leading-relaxed mt-1">
                Análise baseada em fluxo de ordens institucionais em tempo real. Certifique-se de alinhar os sinais com seu gerenciamento de risco operacional.
              </p>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Escada de Order Flow (3/12 cols) */}
        <div className="lg:col-span-3 flex flex-col h-full min-h-[500px] lg:min-h-0">
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