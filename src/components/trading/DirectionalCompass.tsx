import React from 'react';
import { motion } from 'framer-motion';

interface DirectionalCompassProps {
  score: number; // 0 a 100 (50 é neutro, >50 é bullish, <50 é bearish)
  asset: string;
}

export const DirectionalCompass: React.FC<DirectionalCompassProps> = ({ score, asset }) => {
  // Mapear score (0 a 100) para rotação da agulha (-180 a 180 graus)
  const rotation = ((score - 50) / 50) * 135;

  // Obter ícone central ou letra estilizada baseada no ativo
  const getAssetSymbol = () => {
    if (asset.includes('XAU')) return 'Au';
    if (asset.includes('OIL')) return '🛢️';
    return '$';
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-transparent relative">
      {/* Bússola Circular */}
      <div className="relative w-52 h-52 flex items-center justify-center">
        {/* Anel Externo Metálico */}
        <div className="absolute inset-0 rounded-full border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)]" />
        
        {/* Linhas de Grade Internas */}
        <div className="absolute inset-4 rounded-full border border-dashed border-white/[0.03]" />
        <div className="absolute inset-12 rounded-full border border-white/[0.02]" />

        {/* Marcações de Direção */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Norte */}
          <span className="absolute top-3 text-[10px] font-bold text-white/80 font-mono">N</span>
          {/* Nordeste */}
          <span className="absolute top-8 right-8 text-[8px] font-bold text-white/30 font-mono">NE</span>
          {/* Leste */}
          <span className="absolute right-3 text-[10px] font-bold text-white/40 font-mono">E</span>
          {/* Sudeste */}
          <span className="absolute bottom-8 right-8 text-[8px] font-bold text-white/30 font-mono">SE</span>
          {/* Sul */}
          <span className="absolute bottom-3 text-[10px] font-bold text-white/40 font-mono">S</span>
          {/* Sudoeste */}
          <span className="absolute bottom-8 left-8 text-[8px] font-bold text-white/30 font-mono">SW</span>
          {/* Oeste */}
          <span className="absolute left-3 text-[10px] font-bold text-white/40 font-mono">W</span>
          {/* Noroeste */}
          <span className="absolute top-8 left-8 text-[8px] font-bold text-white/30 font-mono">NW</span>
        </div>

        {/* Agulha Giratória */}
        <motion.div 
          className="absolute w-full h-full flex items-center justify-center pointer-events-none z-10"
          animate={{ rotate: rotation }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
        >
          {/* Corpo da Agulha */}
          <div className="relative w-1.5 h-36 flex flex-col justify-between items-center">
            {/* Ponta Norte (Laranja de Alta Performance) */}
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[24px] border-b-[#f59e0b] drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            {/* Ponta Sul (Cinza) */}
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[24px] border-t-white/20" />
          </div>
        </motion.div>

        {/* Centro Brilhante com Ícone do Ativo */}
        <div className="absolute w-14 h-14 rounded-full bg-[#12131a] border border-white/[0.08] flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.8)] z-20">
          <div className="absolute inset-1 rounded-full bg-gradient-to-b from-amber-500/20 to-transparent opacity-60 animate-pulse" />
          <span className="text-sm font-bold text-amber-500 font-mono drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">
            {getAssetSymbol()}
          </span>
        </div>
      </div>
    </div>
  );
};