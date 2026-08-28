import React from 'react';
import { motion } from 'framer-motion';

interface DirectionalCompassProps {
  score: number; // 0 to 100 (50 is neutral, >50 is buy, <50 is sell)
  asset: string;
}

export const DirectionalCompass: React.FC<DirectionalCompassProps> = ({ score, asset }) => {
  // Map score (0 to 100) to needle rotation (-120 to 120 degrees)
  const rotation = ((score - 50) / 50) * 120;

  // Determine current sentiment label
  const getSentimentLabel = () => {
    if (score > 75) return { text: 'STRONG BUY', color: 'text-[#26a69a]' };
    if (score > 55) return { text: 'BUY', color: 'text-[#26a69a]/80' };
    if (score < 25) return { text: 'STRONG SELL', color: 'text-[#ef5350]' };
    if (score < 45) return { text: 'SELL', color: 'text-[#ef5350]/80' };
    return { text: 'NEUTRAL', color: 'text-amber-500' };
  };

  const sentiment = getSentimentLabel();

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#0d0e12] rounded-2xl border border-white/[0.03] shadow-lg relative overflow-hidden h-full">
      {/* Background glow effect */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Compass Circle */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* External metallic ring */}
        <div className="absolute inset-0 rounded-full border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)]" />
        
        {/* Sentiment Arc (Red for sell, Green for buy) */}
        <svg className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] -rotate-90 pointer-events-none">
          {/* Sell arc */}
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
          {/* Buy arc */}
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

        {/* Grid lines */}
        <div className="absolute inset-6 rounded-full border border-dashed border-white/[0.03]" />
        <div className="absolute inset-16 rounded-full border border-white/[0.02]" />

        {/* Sentiment labels on the dial */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Neutral (Top) */}
          <span className="absolute top-4 text-[9px] font-bold text-white/40 font-mono">NEUTRAL</span>
          
          {/* Buy (Right) */}
          <span className="absolute right-5 text-[9px] font-bold text-[#26a69a]/70 font-mono tracking-wider">BUY</span>
          
          {/* Sell (Left) */}
          <span className="absolute left-5 text-[9px] font-bold text-[#ef5350]/70 font-mono tracking-wider">SELL</span>
          
          {/* Strong Sell (Bottom Left) */}
          <span className="absolute bottom-10 left-6 text-[8px] font-bold text-[#ef5350]/50 font-mono">STRONG SELL</span>
          
          {/* Strong Buy (Bottom Right) */}
          <span className="absolute bottom-10 right-6 text-[8px] font-bold text-[#26a69a]/50 font-mono">STRONG BUY</span>
        </div>

        {/* Rotating Needle (Only top pointer active) */}
        <motion.div 
          className="absolute w-full h-full flex items-center justify-center pointer-events-none z-10"
          animate={{ rotate: rotation }}
          transition={{ type: 'spring', stiffness: 50, damping: 12 }}
        >
          {/* Needle body — single pointer */}
          <div className="relative w-2 h-44 flex flex-col justify-start items-center">
            {/* Active tip (amber for high performance) */}
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[28px] border-b-[#f59e0b] drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]" />
            {/* Shaft connecting to center */}
            <div className="w-[2px] h-[64px] bg-gradient-to-t from-transparent to-[#f59e0b]" />
          </div>
        </motion.div>

        {/* Center hub — minimal, no text */}
        <div className="absolute w-16 h-16 rounded-full bg-[#12131a] border border-white/[0.08] flex items-center justify-center shadow-[0_0_25px_rgba(0,0,0,0.9)] z-20">
          <div className="absolute inset-1 rounded-full bg-gradient-to-b from-amber-500/20 to-transparent opacity-60 animate-pulse" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
        </div>
      </div>

      {/* Current Sentiment Verdict */}
      <div className="mt-6 text-center">
        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Market Verdict</span>
        <span className={`text-base font-black tracking-wider mt-1 block ${sentiment.color}`}>
          {sentiment.text}
        </span>
      </div>
    </div>
  );
};