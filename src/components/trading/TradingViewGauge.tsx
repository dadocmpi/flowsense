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
      glow: 'from-[#26a69a]/20 to-transparent'
    };
    if (verdict.includes('COMPRA')) return { 
      text: 'text-[#4db6ac]', 
      bg: 'bg-[#26a69a]/10 border-[#26a69a]/30',
      glow: 'from-[#4db6ac]/15 to-transparent'
    };
    if (verdict.includes('VENDA FORTE')) return { 
      text: 'text-[#ef5350]', 
      bg: 'bg-[#ef5350]/15 border-[#ef5350]/40 shadow-[0_0_25px_rgba(239,83,80,0.3)]',
      glow: 'from-[#ef5350]/20 to-transparent'
    };
    if (verdict.includes('VENDA')) return { 
      text: 'text-[#e57373]', 
      bg: 'bg-[#ef5350]/10 border-[#ef5350]/30',
      glow: 'from-[#e57373]/15 to-transparent'
    };
    return { 
      text: 'text-amber-400', 
      bg: 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)]',
      glow: 'from-amber-500/15 to-transparent'
    };
  };

  const verdictStyle = getVerdictStyle(currentSummary.verdict);

  // Gerar os 21 traços/ticks radiais
  const ticks = Array.from({ length: 21 }, (_, i) => {
    const angle = -90 + (i / 20) * 180;
    return { id: i, angle };
  });

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 flex flex-col justify-between h-full shadow-[0_25px_60px_rgba(0,0,0,0.9)] relative overflow-hidden backdrop-blur-2xl">
      
      {/* Brilho de Fundo Dinâmico */}
      <div className={cn("absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-radial rounded-full blur-3xl pointer-events-none transition-all duration-700 bg-gradient-to-b", verdictStyle.glow)} />

      {/* Cabeçalho de Abas */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-2 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em]">BÚSSOLA DE CONFLUÊNCIA</span>
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

      {/* Mostrador do Velocímetro de Alta Precisão */}
      <div className="relative w-full max-w-[360px] mx-auto flex flex-col items-center justify-center my-4 z-10">
        
        {/* Mostrador Arc com Traços Radiais */}
        <div className="relative w-80 h-44 flex items-end justify-center overflow-hidden">
          
          {/* Anel Externo Retroiluminado */}
          <div className="absolute inset-0 rounded-full border border-white/[0.08] pointer-events-none" />

          {/* SVG dos Níveis Coloridos */}
          <svg className="w-80 h-80 -mt-36" viewBox="0 0 200 200">
            {/* Venda Forte */}
            <path
              d="M 20 100 A 80 80 0 0 1 38.8 43.4"
              fill="none"
              stroke="#ef5350"
              strokeWidth="16"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_rgba(239,83,80,0.5)]"
            />
            {/* Venda */}
            <path
              d="M 43 38.5 A 80 80 0 0 1 75.3 22"
              fill="none"
              stroke="#e57373"
              strokeWidth="16"
            />
            {/* Neutro */}
            <path
              d="M 80 20.8 A 80 80 0 0 1 120 20.8"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="16"
              className="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
            />
            {/* Compra */}
            <path
              d="M 124.7 22 A 80 80 0 0 1 157 38.5"
              fill="none"
              stroke="#4db6ac"
              strokeWidth="16"
            />
            {/* Compra Forte */}
            <path
              d="M 161.2 43.4 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#26a69a"
              strokeWidth="16"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_rgba(38,166,154,0.5)]"
            />
          </svg>

          {/* Traços e Marcadores Radiais (Ticks de Medição) */}
          <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none flex items-end justify-center">
            {ticks.map(tick => {
              const isMajor = tick.id % 5 === 0;
              return (
                <div
                  key={tick.id}
                  className="absolute bottom-1 origin-bottom flex flex-col items-center"
                  style={{
                    transform: `rotate(${tick.angle}deg)`,
                    height: '145px'
                  }}
                >
                  <div className={cn(
                    "rounded-full transition-all",
                    isMajor 
                      ? "w-[2px] h-3.5 bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.8)]" 
                      : "w-[1px] h-2 bg-white/20"
                  )} />
                </div>
              );
            })}
          </div>

          {/* Agulha de Precisão com Brilho Neon */}
          <motion.div
            className="absolute bottom-2 left-1/2 -ml-1 w-2 h-36 origin-bottom flex flex-col justify-start items-center z-30 pointer-events-none"
            animate={{ rotate: rotationAngle }}
            transition={{ type: 'spring', stiffness: 55, damping: 12 }}
          >
            {/* Ponta da Agulha em Cristal Laranja */}
            <div className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[32px] border-b-amber-400 filter drop-shadow-[0_0_15px_rgba(251,191,36,1)]" />
            {/* Haste Reflexiva */}
            <div className="w-[3px] h-[95px] bg-gradient-to-t from-amber-500/10 via-amber-400/80 to-amber-400" />
          </motion.div>

          {/* Botão/Núcleo Central Multicamada */}
          <div className="absolute bottom-0 w-11 h-11 rounded-full bg-[#07080a] border-2 border-amber-400 z-40 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.6)]">
            <div className="w-4 h-4 rounded-full bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(245,158,11,1)]" />
          </div>
        </div>

        {/* Marcadores de Texto dos Níveis com Badges */}
        <div className="w-full grid grid-cols-5 text-center text-[8px] font-black font-mono tracking-wider mt-4 px-1 gap-1">
          <span className="text-[#ef5350] bg-[#ef5350]/10 py-1 rounded-md border border-[#ef5350]/20">VENDA FORTE</span>
          <span className="text-[#e57373] bg-[#e57373]/10 py-1 rounded-md border border-[#e57373]/20">VENDA</span>
          <span className="text-amber-400 bg-amber-500/10 py-1 rounded-md border border-amber-500/20">NEUTRO</span>
          <span className="text-[#4db6ac] bg-[#4db6ac]/10 py-1 rounded-md border border-[#4db6ac]/20">COMPRA</span>
          <span className="text-[#26a69a] bg-[#26a69a]/10 py-1 rounded-md border border-[#26a69a]/20">COMPRA FORTE</span>
        </div>

        {/* Card do Veredito Atual em Tempo Real */}
        <div className={cn("mt-6 px-10 py-3.5 rounded-2xl border backdrop-blur-xl transition-all text-center w-full", verdictStyle.bg)}>
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