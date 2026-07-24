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
    if (verdict.includes('COMPRA FORTE')) return { text: 'text-[#26a69a]', bg: 'bg-[#26a69a]/10 border-[#26a69a]/30' };
    if (verdict.includes('COMPRA')) return { text: 'text-[#26a69a]', bg: 'bg-[#26a69a]/10 border-[#26a69a]/20' };
    if (verdict.includes('VENDA FORTE')) return { text: 'text-[#ef5350]', bg: 'bg-[#ef5350]/10 border-[#ef5350]/30' };
    if (verdict.includes('VENDA')) return { text: 'text-[#ef5350]', bg: 'bg-[#ef5350]/10 border-[#ef5350]/20' };
    return { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  };

  const verdictStyle = getVerdictStyle(currentSummary.verdict);

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-7 flex flex-col justify-between h-full shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-xl">
      
      {/* Efeito Glow Suave de Fundo */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Abas Superiores Minimalistas */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-4">
        <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Bússola de Confluência</span>
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
                  ? "bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_2px_10px_rgba(245,158,11,0.3)] font-black" 
                  : "text-white/40 hover:text-white/80"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Velocímetro Semicircular de Alta Precisão */}
      <div className="relative w-full max-w-[340px] mx-auto flex flex-col items-center justify-center my-2">
        
        {/* Mostrador Arco SVG */}
        <div className="relative w-72 h-40 flex items-end justify-center overflow-hidden">
          <svg className="w-72 h-72 -mt-32" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="compassGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef5350" />
                <stop offset="20%" stopColor="#ef5350" stopOpacity="0.7" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="80%" stopColor="#26a69a" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#26a69a" />
              </linearGradient>
            </defs>
            
            {/* Trilha do Arco Fundo */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="rgba(255, 255, 255, 0.04)"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Trilha Colorida com Gradiente Neomórfico */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="url(#compassGradient)"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </svg>

          {/* Agulha da Bússola Elegante e Vibrante */}
          <motion.div
            className="absolute bottom-2 left-1/2 -ml-1 w-2 h-32 origin-bottom flex flex-col justify-start items-center z-20 pointer-events-none"
            animate={{ rotate: rotationAngle }}
            transition={{ type: 'spring', stiffness: 50, damping: 14 }}
          >
            {/* Ponta da Agulha */}
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[28px] border-b-amber-400 filter drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
            {/* Haste da Agulha */}
            <div className="w-[3px] h-[85px] bg-gradient-to-t from-amber-500/10 via-amber-400/60 to-amber-400" />
          </motion.div>

          {/* Núcleo Central do Ponteiro */}
          <div className="absolute bottom-0 w-9 h-9 rounded-full bg-[#0d0e12] border-2 border-amber-400 z-30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
            <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Marcações de Texto nos Cantos */}
        <div className="w-full flex justify-between text-[9px] font-black font-mono tracking-widest text-white/30 mt-3 px-3">
          <span className="text-[#ef5350]">VENDA FORTE</span>
          <span className="text-amber-400">NEUTRO</span>
          <span className="text-[#26a69a]">COMPRA FORTE</span>
        </div>

        {/* Card do Veredito da Bússola */}
        <div className={cn("mt-6 px-6 py-2.5 rounded-2xl border backdrop-blur-md transition-all text-center", verdictStyle.bg)}>
          <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.25em] block">VEREDITO TÉCNICO</span>
          <span className={cn("text-lg font-black tracking-widest mt-0.5 block drop-shadow", verdictStyle.text)}>
            {currentSummary.verdict}
          </span>
        </div>
      </div>

      {/* Caixa de Contagem e Score Consolidado */}
      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/[0.04] p-4 rounded-2xl mt-4">
        <div className="text-center">
          <span className="text-[9px] font-black text-[#ef5350] block uppercase tracking-wider">VENDA</span>
          <span className="text-lg font-mono font-black text-white/90 mt-1 block">{currentSummary.sellCount}</span>
        </div>
        <div className="text-center border-x border-white/[0.05]">
          <span className="text-[9px] font-black text-amber-400 block uppercase tracking-wider">NEUTRO</span>
          <span className="text-lg font-mono font-black text-white/90 mt-1 block">{currentSummary.neutralCount}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] font-black text-[#26a69a] block uppercase tracking-wider">COMPRA</span>
          <span className="text-lg font-mono font-black text-white/90 mt-1 block">{currentSummary.buyCount}</span>
        </div>
      </div>

    </div>
  );
};