import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { IndicatorSummary } from '../../types/trading';
import { cn } from '@/lib/utils';

interface TradingViewGaugeProps {
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
  selectedAsset: string;
}

export const TradingViewGauge: React.FC<TradingViewGaugeProps> = ({
  overallSummary,
  oscillatorsSummary,
  maSummary,
  orderFlowSummary,
  selectedAsset
}) => {
  const [activeTab, setActiveTab] = useState<'geral' | 'osciladores' | 'mas' | 'orderflow'>('geral');

  const currentSummary = 
    activeTab === 'osciladores' ? oscillatorsSummary :
    activeTab === 'mas' ? maSummary :
    activeTab === 'orderflow' ? orderFlowSummary :
    overallSummary;

  // Converter score (0 a 100) para ângulo do manômetro (-90 deg a +90 deg)
  const rotationAngle = -90 + (currentSummary.score / 100) * 180;

  const getVerdictStyle = (verdict: string) => {
    if (verdict.includes('COMPRA FORTE')) return { text: 'text-[#26a69a]', bg: 'bg-[#26a69a]/15 border-[#26a69a]/40 shadow-[0_0_20px_rgba(38,166,154,0.2)]' };
    if (verdict.includes('COMPRA')) return { text: 'text-[#26a69a]', bg: 'bg-[#26a69a]/10 border-[#26a69a]/25' };
    if (verdict.includes('VENDA FORTE')) return { text: 'text-[#ef5350]', bg: 'bg-[#ef5350]/15 border-[#ef5350]/40 shadow-[0_0_20px_rgba(239,83,80,0.2)]' };
    if (verdict.includes('VENDA')) return { text: 'text-[#ef5350]', bg: 'bg-[#ef5350]/10 border-[#ef5350]/25' };
    return { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
  };

  const verdictStyle = getVerdictStyle(currentSummary.verdict);

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-7 flex flex-col justify-between h-full shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-xl">
      
      {/* Abas de Navegação */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-2">
        <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">BÚSSOLA DE CONFLUÊNCIA</span>
        <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.05] space-x-1">
          {[
            { id: 'geral', label: 'TUDO' },
            { id: 'osciladores', label: 'OSCILADORES' },
            { id: 'mas', label: 'MÉDIAS' },
            { id: 'orderflow', label: 'FLUXO' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-3 py-1 text-[9px] font-black tracking-wider rounded-lg transition-all",
                activeTab === tab.id 
                  ? "bg-amber-500 text-black font-black shadow-[0_0_12px_rgba(245,158,11,0.4)]" 
                  : "text-white/40 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Velocímetro com 5 Segmentos de Cores Nítidas */}
      <div className="relative w-full max-w-[340px] mx-auto flex flex-col items-center justify-center my-2">
        
        {/* SVG dos Níveis em Arco */}
        <div className="relative w-72 h-40 flex items-end justify-center overflow-hidden">
          <svg className="w-72 h-72 -mt-32" viewBox="0 0 200 200">
            {/* Segmento 1: Venda Forte (0 a 20%) */}
            <path
              d="M 20 100 A 80 80 0 0 1 38.8 43.4"
              fill="none"
              stroke="#ef5350"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {/* Segmento 2: Venda (20% a 40%) */}
            <path
              d="M 43 38.5 A 80 80 0 0 1 75.3 22"
              fill="none"
              stroke="#e57373"
              strokeWidth="14"
            />
            {/* Segmento 3: Neutro (40% a 60%) */}
            <path
              d="M 80 20.8 A 80 80 0 0 1 120 20.8"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="14"
            />
            {/* Segmento 4: Compra (60% a 80%) */}
            <path
              d="M 124.7 22 A 80 80 0 0 1 157 38.5"
              fill="none"
              stroke="#4db6ac"
              strokeWidth="14"
            />
            {/* Segmento 5: Compra Forte (80% a 100%) */}
            <path
              d="M 161.2 43.4 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#26a69a"
              strokeWidth="14"
              strokeLinecap="round"
            />
          </svg>

          {/* Agulha de Precisão */}
          <motion.div
            className="absolute bottom-2 left-1/2 -ml-1 w-2 h-32 origin-bottom flex flex-col justify-start items-center z-20 pointer-events-none"
            animate={{ rotate: rotationAngle }}
            transition={{ type: 'spring', stiffness: 50, damping: 14 }}
          >
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[28px] border-b-amber-400 filter drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
            <div className="w-[3px] h-[85px] bg-gradient-to-t from-amber-500/10 via-amber-400/60 to-amber-400" />
          </motion.div>

          {/* Núcleo Central */}
          <div className="absolute bottom-0 w-9 h-9 rounded-full bg-[#0d0e12] border-2 border-amber-400 z-30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
            <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Níveis de Cores e Marcadores */}
        <div className="w-full grid grid-cols-5 text-center text-[8px] font-black font-mono tracking-tighter mt-3 px-1 gap-0.5">
          <span className="text-[#ef5350]">VENDA FORTE</span>
          <span className="text-[#e57373]">VENDA</span>
          <span className="text-amber-400">NEUTRO</span>
          <span className="text-[#4db6ac]">COMPRA</span>
          <span className="text-[#26a69a]">COMPRA FORTE</span>
        </div>

        {/* Card do Veredito Atual */}
        <div className={cn("mt-6 px-8 py-3 rounded-2xl border backdrop-blur-md transition-all text-center", verdictStyle.bg)}>
          <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.25em] block">SINAL DA BÚSSOLA</span>
          <span className={cn("text-xl font-black tracking-widest mt-0.5 block drop-shadow", verdictStyle.text)}>
            {currentSummary.verdict}
          </span>
        </div>
      </div>

      {/* Painel de Indicadores Consolidados */}
      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/[0.04] p-4 rounded-2xl mt-4">
        <div className="text-center">
          <span className="text-[9px] font-black text-[#ef5350] block uppercase tracking-wider">VENDA</span>
          <span className="text-xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.sellCount}</span>
        </div>
        <div className="text-center border-x border-white/[0.05]">
          <span className="text-[9px] font-black text-amber-400 block uppercase tracking-wider">NEUTRO</span>
          <span className="text-xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.neutralCount}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] font-black text-[#26a69a] block uppercase tracking-wider">COMPRA</span>
          <span className="text-xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.buyCount}</span>
        </div>
      </div>

    </div>
  );
};