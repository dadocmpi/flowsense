import React, { useState } from 'react';
import { useTwelveData } from '../hooks/useTwelveData';
import { TradingViewGauge } from '../components/trading/TradingViewGauge';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { AssetSummaryCard } from '../components/trading/AssetSummaryCard';
import { SUPPORTED_ASSETS } from '../types/trading';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('XAU/USD');
  const twelveData = useTwelveData(selectedAsset);

  const activeConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedAsset) || SUPPORTED_ASSETS[0];

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-amber-500/30">
      
      {/* Top Bar Ultralimpa (Apenas Seleção de Ativos e Status de Conexão) */}
      <header className="w-full border-b border-white/[0.04] bg-[#07080a] px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        
        {/* Botoes de Seleção de Ativos (OURO / PETRÓLEO) */}
        <div className="flex items-center space-x-3">
          <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mr-2">COMMODITIES:</span>
          {SUPPORTED_ASSETS.map(asset => (
            <button
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset.symbol)}
              className={`px-5 py-2 rounded-2xl text-xs font-black tracking-wider transition-all ${
                selectedAsset === asset.symbol
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.3)] scale-105'
                  : 'bg-white/[0.03] text-white/50 hover:text-white border border-white/[0.05]'
              }`}
            >
              {asset.name}
            </button>
          ))}
        </div>

        {/* Indicador Limpo de Feed da TwelveData */}
        <div className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.05] px-4 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-pulse" />
          <span className="text-[10px] font-mono text-white/60 font-bold uppercase tracking-widest">
            TwelveData Real Feed
          </span>
        </div>
      </header>

      {/* Conteúdo Principal do Terminal */}
      <main className="flex-grow p-8 max-w-[1600px] w-full mx-auto flex flex-col space-y-6">
        
        {/* Card de Cotação em Destaque */}
        <AssetSummaryCard
          data={twelveData}
          precision={activeConfig.precision}
        />

        {/* Grid Principal: Bússola + Tabelas Técnicas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
          
          {/* Coluna 1: Bússola de Sentimento / Confluência (5/12 cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <TradingViewGauge
              overallSummary={twelveData.overallSummary}
              oscillatorsSummary={twelveData.oscillatorsSummary}
              maSummary={twelveData.maSummary}
              orderFlowSummary={twelveData.orderFlowSummary}
              selectedAsset={selectedAsset}
            />
          </div>

          {/* Coluna 2: Tabelas Detalhadas de Indicadores Reais (7/12 cols) */}
          <div className="lg:col-span-7 flex flex-col">
            <TechnicalDetailsTable
              oscillators={twelveData.oscillators}
              movingAverages={twelveData.movingAverages}
              orderFlowIndicators={twelveData.orderFlowIndicators}
            />
          </div>

        </div>

      </main>
    </div>
  );
};

export default Index;