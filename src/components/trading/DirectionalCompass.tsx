import React from 'react';
import { motion } from 'framer-motion';

interface DirectionalCompassProps {
  score: number;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
}

export const DirectionalCompass: React.FC<DirectionalCompassProps> = ({ score, bias }) => {
  const rotation = (score / 100) * 180 - 90;
  const getColor = () => {
    if (bias === 'Bullish') return '#26a69a';
    if (bias === 'Bearish') return '#ef5350';
    return '#f59e0b';
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-black border-b border-white/5 h-1/2">
      <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-6 self-start">Bússola Direcional</h3>
      <div className="relative w-48 h-24 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={getColor()} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(score / 100) * 125.6} 125.6`} />
        </svg>
        <motion.div className="absolute bottom-0 left-1/2 w-1 h-20 bg-white origin-bottom -translate-x-1/2" animate={{ rotate: rotation }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
        </motion.div>
      </div>
      <div className="mt-4 text-center">
        <div className="text-2xl font-mono font-bold text-white">{score}</div>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: getColor() }}>{bias} Bias</div>
      </div>
    </div>
  );
};