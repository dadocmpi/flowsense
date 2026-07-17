import React from 'react';
import { motion } from 'framer-motion';

interface DirectionalCompassProps {
  score: number; // 0 a 100 (50 é neutro, >50 é compra, <50 é venda)
  asset: string;
}

export const DirectionalCompass: React.FC<DirectionalCompassProps> = ({ score, asset }) => {
  // Mapear score (0 a 100) para rotação da agulha (-120 a 120 graus)
  // 0 -> -120 graus (Venda Forte)
  // 50 -> 0 graus (Neutro)
  // 100 -> 120 graus (Compra Forte)
  const rotation = ((score - 50) / 50) * 120;

  const getAssetSymbol = () => {
    if (asset.includes('XAU')) return 'Au';
    if (asset.includes('OIL')) return '🛢️';
    return '$';
  };

  // Determinar texto de sentimento atual
  const getSentimentLabel = () => {
    if (score > 75) return { text: 'COMPRA FORTE', color: 'text-[#26a69a]' };
    if (score > 55) return { text: 'COMPRA', color: 'text-[#26a69a]/80' };
    if (score < 25) return { text: 'VENDA FORTE', color: 'text-[#ef5350]' };
    if (score < 45) return { text: 'VENDA', color: 'text-[#ef5350]/80' };
    return { text: 'NEUTRO', color: 'text-amber-500' };
  };

  const sentiment = getSentimentLabel();

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#0d0e12] rounded-2xl border border-white/[0.03] shadow-lg relative overflow-hidden h-full">
      {/* Efeito de Brilho de Fundo */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Bússola Circular */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* Anel Externo Metálico */}
        <div className="absolute inset-0 rounded-full border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)]" />
        
        {/* Arco de Sentimento (Vermelho para Venda, Verde para Compra) */}
        <svg className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] -rotate-90 pointer-events-none">
          {/* Arco de Venda */}
          <circle
            cx="120"
            cy="120"
            r="108"
            fill="transparent"
            stroke="#ef5350"
            strokeWidth="3"
            strokeDasharray="339"
            strokeDashoffset="170"
            className="opacity-20"
            transform="translate(8, 8)"
          />
          {/* Arco de Compra */}
          <circle
            cx="120"
            cy="120"
            r="108"
            fill="transparent"
            stroke="#26a69a"
            strokeWidth="3"
            strokeDasharray="339"
            strokeDashoffset="170"
            className="opacity-20"
            transform="translate(8, 8) scale(1, -1) translate(0, -240)"
          />
        </svg>

        {/* Linhas de Grade Internas */}
        <div className="absolute inset-6 rounded-full border border-dashed border-white/[0.03]" />
        <div className="absolute inset-16 rounded-full border border-white/[0.02]" />

        {/* Marcações de Sentimento no Mostrador */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Neutro (Topo) */}
          <span className="absolute top-4 text-[9px] font-bold text-white/40 font-mono">NEUTRO</span>
          {/* Compra (Direita) */}
          <span className="absolute right-5 text-[9px] font-bold text-[#26a69a]/70 font-mono tracking-wider">COMPRA</span>
          {/* Venda (Esquerda) */}
          <span className="absolute left-5 text-[9px] font-bold text-[#ef5350]/70 font-mono tracking-wider">VENDA</span>
          
          {/* Venda Forte (Inferior Esquerdo) */}
          <span className="absolute bottom-10 left-10 text-[8px] font-bold text-[#ef5350]/40 font-mono">FORTE</span>
          {/* Compra Forte (Inferior Direito) */}
          <span className="absolute bottom-10 right-10 text-[8px] font-bold text-[#26a69a]/40 font-mono">FORTE</span>
        </div>

        {/* Agulha Giratória */}
        <motion.div 
          className="absolute w-full h-full flex items-center justify-center pointer-events-none z-10"
          animate={{ rotate: rotation }}
          transition={{ type: 'spring', stiffness: 50, damping: 12 }}
        >
          {/* Corpo da Agulha */}
          <div className="relative w-2 h-44 flex flex-col justify-between items-center">
            {/* Ponta Ativa (Laranja de Alta Performance) */}
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[28px] border-b-[#f59e0b] drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]" />
            {/* Ponta Passiva (Cinza) */}
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[28px] border-t-white/10" />
          </div>
        </motion.div>

        {/* Centro Brilhante com Ícone do Ativo */}
        <div className="absolute w-16 h-16 rounded-full bg-[#12131a] border border-white/[0.08] flex items-center justify-center shadow-[0_0_25px_rgba(0,0,0,0.9)] z-20">
          <div className="absolute inset-1 rounded-full bg-gradient-to-b from-amber-500/20 to-transparent opacity-60 animate-pulse" />
          <span className="text-base font-bold text-amber-500 font-mono drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">
            {getAssetSymbol()}
          </span>
        </div>
      </div>

      {/* Veredito de Sentimento Atual */}
      <div className="mt-6 text-center">
        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Veredito do Mercado</span>
        <span className={`text-base font-black tracking-wider mt-1 block ${sentiment.color}`}>
          {sentiment.text}
        </span>
      </div>
    </div>
  );
};