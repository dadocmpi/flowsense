import React from 'react';
import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';

interface DirectionalCompassProps {
  score: number; // 0 a 100 (50 é neutro, >50 é bullish, <50 é bearish)
  asset: string;
}

export const DirectionalCompass: React.FC<DirectionalCompassProps> = ({ score, asset }) => {
  // Mapear score (0 a 100) para rotação da agulha (-180 a 180 graus)
  // 50 (Neutro) -> 0 graus (Norte)
  // 100 (Bullish Forte) -> 135 graus (Leste/Sudeste)
  // 0 (Bearish Forte) -> -135 graus (Oeste/Sudoeste)
  const rotation = ((score - 50) / 50) * 135;

  // Obter ícone central ou letra estilizada baseada no ativo
  const getAssetSymbol = () => {
    if (asset.includes('XAU')) return 'Au';
    if (asset.includes('BTC')) return '₿';
    if (asset.includes('ETH')) return 'Ξ';
    return '$';
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#0d0e12] border-b border-white/[0.03]">
      {/* Título e Ativo */}
      <div className="text-center mb-6">
        <h3 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">Bússola do Trader</h3>
        <span className="text-[10px] font-mono text-white/60 tracking-widest mt-1 block">{asset.replace('/', '')}</span>
      </div>

      {/* Bússola Circular */}
      <div className="relative w-56 h-56 flex items-center justify-center">
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
          <span className="absolute top-8 right-8 text-[8px] font-bold text-white/30 font-mono">NW</span>
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
          <div className="relative w-1.5 h-40 flex flex-col justify-between items-center">
            {/* Ponta Norte (Vermelha/Laranja de Alta Performance) */}
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