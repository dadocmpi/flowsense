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

  // Selecionar o resumo baseado na aba ativa
  const currentSummary = 
    activeTab === 'osciladores' ? oscillatorsSummary :
    activeTab === 'mas' ? maSummary :
    activeTab === 'orderflow' ? orderFlowSummary :
    overallSummary;

  // Converter score (0 a 100) para ângulo do manômetro (-90 deg a +90 deg)
  const rotationAngle = -90 + (currentSummary.score / 100) * 180;

  const getVerdictColor = (verdict: string) => {
    if (verdict.includes('COMPRA')) return 'text-[#26a69a]';
    if (verdict.includes('VENDA')) return 'text-[#ef5350]';
    return 'text-amber-500';
  };

  return (
    <div className="bg-[#0a0b0d] rounded-2xl border border-white/[0.04] p-6 flex flex-col justify-between h-full shadow-2xl relative">
      
      {/* Abas Superiores Estilo TradingView */}
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-3 mb-4">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Resumo Técnico</span>
        <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.04] space-x-1">
          {[
            { id: 'geral', label: 'Geral' },
            { id: 'osciladores', label: 'Osciladores' },
            { id: 'mas', label: 'Médias' },
            { id: 'orderflow', label: 'Order Flow' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                activeTab === tab.id 
                  ? "bg-amber-500 text-black shadow-md font-extrabold" 
                  : "text-white/40 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Velocímetro Semicircular */}
      <div className="relative w-full max-w-[320px] mx-auto flex flex-col items-center justify-center py-2">
        
        {/* Arco do Velocímetro SVG com Gradiente */}
        <div className="relative w-64 h-36 flex items-end justify-center overflow-hidden">
          <svg className="w-64 h-64 -mt-28" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef5350" />
                <stop offset="25%" stopColor="#ef5350" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="75%" stopColor="#26a69a" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#26a69a" />
              </linearGradient>
            </defs>
            
            {/* Arco Traseiro Opaco */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="16"
              strokeLinecap="round"
            />

            {/* Arco Colorido de Sentimento */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </svg>

          {/* Ponteiro Animado */}
          <motion.div
            className="absolute bottom-1 left-1/2 -ml-1 w-2 h-28 origin-bottom flex flex-col justify-start items-center z-20 pointer-events-none"
            animate={{ rotate: rotationAngle }}
            transition={{ type: 'spring', stiffness: 60, damping: 15 }}
          >
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[26px] border-b-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]" />
            <div className="w-[3px] h-[75px] bg-gradient-to-t from-amber-500/20 to-amber-400" />
          </motion.div>

          {/* Centro do Ponteiro */}
          <div className="absolute bottom-0 w-8 h-8 rounded-full bg-[#12131a] border-2 border-amber-400 z-30 flex items-center justify-center shadow-lg">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          </div>
        </div>

        {/* Rotulagem do Velocímetro nos Arcos */}
        <div className="w-full flex justify-between text-[9px] font-bold font-mono tracking-wider text-white/40 mt-2 px-2">
          <span className="text-[#ef5350]">VENDA FORTE</span>
          <span className="text-amber-500">NEUTRO</span>
          <span className="text-[#26a69a]">COMPRA FORTE</span>
        </div>

        {/* Veredito Atual */}
        <div className="mt-4 text-center">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Sinal Consolidado</span>
          <span className={cn("text-xl font-black tracking-widest mt-0.5 block drop-shadow-sm", getVerdictColor(currentSummary.verdict))}>
            {currentSummary.verdict}
          </span>
        </div>
      </div>

      {/* Caixa de Contagem de Indicadores (Estilo TradingView) */}
      <div className="grid grid-cols-3 gap-2 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl mt-4">
        <div className="text-center">
          <span className="text-[9px] font-bold text-[#ef5350] block uppercase tracking-wider">Venda</span>
          <span className="text-base font-mono font-bold text-white">{currentSummary.sellCount}</span>
        </div>
        <div className="text-center border-x border-white/[0.05]">
          <span className="text-[9px] font-bold text-amber-500 block uppercase tracking-wider">Neutro</span>
          <span className="text-base font-mono font-bold text-white">{currentSummary.neutralCount}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] font-bold text-[#26a69a] block uppercase tracking-wider">Compra</span>
          <span className="text-base font-mono font-bold text-white">{currentSummary.buyCount}</span>
        </div>
      </div>

    </div>
  );
};