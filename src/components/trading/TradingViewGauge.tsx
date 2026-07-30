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

  // Ângulo de rotação da agulha (-90 deg a +90 deg)
  const rotationAngle = -90 + (currentSummary.score / 100) * 180;

  const getVerdictStyle = (verdict: string) => {
    if (verdict.includes('COMPRA FORTE')) return { 
      text: 'text-[#26a69a]', 
      bg: 'bg-[#26a69a]/15 border-[#26a69a]/40 shadow-[0_0_25px_rgba(38,166,154,0.3)]',
      glow: 'from-[#26a69a]/25 to-transparent'
    };
    if (verdict.includes('COMPRA')) return { 
      text: 'text-[#4db6ac]', 
      bg: 'bg-[#26a69a]/10 border-[#26a69a]/30',
      glow: 'from-[#4db6ac]/20 to-transparent'
    };
    if (verdict.includes('VENDA FORTE')) return { 
      text: 'text-[#ef5350]', 
      bg: 'bg-[#ef5350]/15 border-[#ef5350]/40 shadow-[0_0_25px_rgba(239,83,80,0.3)]',
      glow: 'from-[#ef5350]/25 to-transparent'
    };
    if (verdict.includes('VENDA')) return { 
      text: 'text-[#e57373]', 
      bg: 'bg-[#ef5350]/10 border-[#ef5350]/30',
      glow: 'from-[#e57373]/20 to-transparent'
    };
    return { 
      text: 'text-amber-400', 
      bg: 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)]',
      glow: 'from-amber-500/20 to-transparent'
    };
  };

  const verdictStyle = getVerdictStyle(currentSummary.verdict);

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 flex flex-col justify-between h-full shadow-[0_25px_60px_rgba(0,0,0,0.9)] relative overflow-hidden backdrop-blur-2xl select-none">
      
      {/* Brilho de Fundo Dinâmico */}
      <div className={cn("absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 bg-radial rounded-full blur-3xl pointer-events-none transition-all duration-700 bg-gradient-to-b", verdictStyle.glow)} />

      {/* Cabeçalho de Abas */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-2 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          <span className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em]">BÚSSOLA DE CONFLUÊNCIA</span>
        </div>
        <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] space-x-1">
          {[
            { id: 'geral', label: 'GERAL' },
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
                  ? "bg-gradient-to-r from-amber-500 to-amber-400 text-black font-black shadow-[0_0_15px_rgba(245,158,11,0.5)]" 
                  : "text-white/40 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Velocímetro Limpo & Elegante */}
      <div className="relative w-full max-w-[340px] mx-auto flex flex-col items-center justify-center my-6 z-10">
        
        {/* Arc SVG Limpo e Sem Linhas Sobrando */}
        <div className="relative w-72 h-36 flex items-end justify-center">
          
          <svg className="w-72 h-72 -mt-36" viewBox="0 0 200 200">
            {/* Venda Forte */}
            <path
              d="M 25 100 A 75 75 0 0 1 42.6 46.9"
              fill="none"
              stroke="#ef5350"
              strokeWidth="18"
              strokeLinecap="round"
            />
            {/* Venda */}
            <path
              d="M 47.5 42 A 75 75 0 0 1 78.8 26.6"
              fill="none"
              stroke="#e57373"
              strokeWidth="18"
            />
            {/* Neutro */}
            <path
              d="M 84.1 25.5 A 75 75 0 0 1 115.9 25.5"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="18"
            />
            {/* Compra */}
            <path
              d="M 121.2 26.6 A 75 75 0 0 1 152.5 42"
              fill="none"
              stroke="#4db6ac"
              strokeWidth="18"
            />
            {/* Compra Forte */}
            <path
              d="M 157.4 46.9 A 75 75 0 0 1 175 100"
              fill="none"
              stroke="#26a69a"
              strokeWidth="18"
              strokeLinecap="round"
            />
          </svg>

          {/* Agulha de Alta Precisão */}
          <motion.div
            className="absolute bottom-1 left-1/2 -ml-[3px] w-1.5 h-32 origin-bottom flex flex-col justify-start items-center z-30 pointer-events-none"
            animate={{ rotate: rotationAngle }}
            transition={{ type: 'spring', stiffness: 60, damping: 14 }}
          >
            {/* Ponta da Agulha */}
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[28px] border-b-amber-400 filter drop-shadow-[0_0_12px_rgba(251,191,36,1)]" />
            {/* Corpo da Agulha */}
            <div className="w-[3px] h-[90px] bg-gradient-to-t from-amber-500/20 via-amber-400 to-amber-300" />
          </motion.div>

          {/* Botão Central Retroiluminado */}
          <div className="absolute -bottom-2 w-10 h-10 rounded-full bg-[#07080a] border-2 border-amber-400 z-40 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.6)]">
            <div className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Marcadores de Texto dos Níveis */}
        <div className="w-full grid grid-cols-5 text-center text-[8px] font-black font-mono tracking-wider mt-5 gap-1">
          <span className="text-[#ef5350] bg-[#ef5350]/10 py-1 rounded-md border border-[#ef5350]/20">VENDA FORTE</span>
          <span className="text-[#e57373] bg-[#e57373]/10 py-1 rounded-md border border-[#e57373]/20">VENDA</span>
          <span className="text-amber-400 bg-amber-500/10 py-1 rounded-md border border-amber-500/20">NEUTRO</span>
          <span className="text-[#4db6ac] bg-[#4db6ac]/10 py-1 rounded-md border border-[#4db6ac]/20">COMPRA</span>
          <span className="text-[#26a69a] bg-[#26a69a]/10 py-1 rounded-md border border-[#26a69a]/20">COMPRA FORTE</span>
        </div>

        {/* Card do Veredito Atual em Tempo Real */}
        <div className={cn("mt-6 px-8 py-3 rounded-2xl border backdrop-blur-xl transition-all text-center w-full", verdictStyle.bg)}>
          <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] block">SINAL DA BÚSSOLA</span>
          <span className={cn("text-2xl font-black tracking-widest mt-0.5 block drop-shadow-md", verdictStyle.text)}>
            {currentSummary.verdict}
          </span>
        </div>
      </div>

      {/* Estatísticas de Pontuação Contada */}
      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl z-10">
        <div className="text-center">
          <span className="text-[9px] font-black text-[#ef5350] block uppercase tracking-wider">SINAIS VENDA</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.sellCount}</span>
        </div>
        <div className="text-center border-x border-white/[0.06]">
          <span className="text-[9px] font-black text-amber-400 block uppercase tracking-wider">NEUTROS</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.neutralCount}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] font-black text-[#26a69a] block uppercase tracking-wider">SINAIS COMPRA</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.buyCount}</span>
        </div>
      </div>

    </div>
  );
};