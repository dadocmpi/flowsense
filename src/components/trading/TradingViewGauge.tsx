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
  const [activeTab, setActiveTab] = useState<'overall' | 'oscillators' | 'ma' | 'orderflow'>('overall');

  const currentSummary = 
    activeTab === 'oscillators' ? oscillatorsSummary :
    activeTab === 'ma' ? maSummary :
    activeTab === 'orderflow' ? orderFlowSummary :
    overallSummary;

  // Rotation angle (-90deg to +90deg)
  const needleAngle = -90 + (currentSummary.score / 100) * 180;

  const getVerdictStyle = (verdict: string) => {
    if (verdict.includes('STRONG BUY')) return { 
      text: 'text-[#26a69a]', 
      bg: 'bg-[#26a69a]/15 border-[#26a69a]/40 shadow-[0_0_25px_rgba(38,166,154,0.35)]',
      glow: 'from-[#26a69a]/20 to-transparent'
    };
    if (verdict.includes('BUY')) return { 
      text: 'text-[#4db6ac]', 
      bg: 'bg-[#26a69a]/10 border-[#26a69a]/30',
      glow: 'from-[#4db6ac]/15 to-transparent'
    };
    if (verdict.includes('STRONG SELL')) return { 
      text: 'text-[#ef5350]', 
      bg: 'bg-[#ef5350]/15 border-[#ef5350]/40 shadow-[0_0_25px_rgba(239,83,80,0.35)]',
      glow: 'from-[#ef5350]/20 to-transparent'
    };
    if (verdict.includes('SELL')) return { 
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

  // Generate 35 radial ticks
  const numTicks = 35;
  const cx = 150;
  const cy = 135;
  const rInner = 95;
  const rOuterMajor = 115;
  const rOuterMinor = 108;

  const ticks = Array.from({ length: numTicks }, (_, i) => {
    const angleDeg = -180 + (i / (numTicks - 1)) * 180;
    const angleRad = (angleDeg * Math.PI) / 180;

    const isMajor = i % 7 === 0 || i === 0 || i === numTicks - 1;
    const rOuter = isMajor ? rOuterMajor : rOuterMinor;

    const x1 = cx + rInner * Math.cos(angleRad);
    const y1 = cy + rInner * Math.sin(angleRad);
    const x2 = cx + rOuter * Math.cos(angleRad);
    const y2 = cy + rOuter * Math.sin(angleRad);

    const ratio = i / (numTicks - 1);
    let color = '#f59e0b';
    if (ratio < 0.22) color = '#ef5350';
    else if (ratio < 0.42) color = '#e57373';
    else if (ratio < 0.58) color = '#f59e0b';
    else if (ratio < 0.78) color = '#4db6ac';
    else color = '#26a69a';

    return { id: i, x1, y1, x2, y2, color, isMajor };
  });

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 flex flex-col justify-between h-full shadow-[0_25px_60px_rgba(0,0,0,0.9)] relative overflow-hidden backdrop-blur-2xl select-none">
      
      {/* Dynamic Background Glow */}
      <div className={cn("absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-radial rounded-full blur-3xl pointer-events-none transition-all duration-700 bg-gradient-to-b", verdictStyle.glow)} />

      {/* Tabs Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-2 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          <span className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em]">CONFLUENCE COMPASS</span>
        </div>
        <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] space-x-1">
          {[
            { id: 'overall', label: 'OVERALL' },
            { id: 'oscillators', label: 'OSCILLATORS' },
            { id: 'ma', label: 'MOVING AVG' },
            { id: 'orderflow', label: 'FLOW' },
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

      {/* Radial Ticks Gauge */}
      <div className="relative w-full max-w-[340px] mx-auto flex flex-col items-center justify-center my-4 z-10">
        
        <div className="relative w-72 h-36 flex items-end justify-center">
          
          <svg className="w-full h-full overflow-visible" viewBox="0 0 300 150">
            <path
              d="M 55 135 A 95 95 0 0 1 245 135"
              fill="none"
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />

            {ticks.map(tick => (
              <line
                key={tick.id}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke={tick.color}
                strokeWidth={tick.isMajor ? 3 : 1.8}
                strokeLinecap="round"
                opacity={tick.isMajor ? 1 : 0.75}
                className="transition-all duration-300 hover:opacity-100"
              />
            ))}
          </svg>

          {/* Needle */}
          <motion.div
            className="absolute bottom-2 left-1/2 -ml-[3px] w-1.5 h-32 origin-bottom flex flex-col justify-start items-center z-30 pointer-events-none"
            animate={{ rotate: needleAngle }}
            transition={{ type: 'spring', stiffness: 55, damping: 13 }}
          >
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[28px] border-b-amber-400 filter drop-shadow-[0_0_12px_rgba(251,191,36,1)]" />
            <div className="w-[2.5px] h-[90px] bg-gradient-to-t from-amber-500/20 via-amber-400/90 to-amber-300" />
          </motion.div>

          {/* Pivot Center */}
          <div className="absolute -bottom-2 w-10 h-10 rounded-full bg-[#07080a] border-2 border-amber-400 z-40 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.6)]">
            <div className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Level Badges */}
        <div className="w-full grid grid-cols-5 text-center text-[8px] font-black font-mono tracking-wider mt-5 gap-1">
          <span className="text-[#ef5350] bg-[#ef5350]/10 py-1 rounded-md border border-[#ef5350]/20">STRONG SELL</span>
          <span className="text-[#e57373] bg-[#e57373]/10 py-1 rounded-md border border-[#e57373]/20">SELL</span>
          <span className="text-amber-400 bg-amber-500/10 py-1 rounded-md border border-amber-500/20">NEUTRAL</span>
          <span className="text-[#4db6ac] bg-[#4db6ac]/10 py-1 rounded-md border border-[#4db6ac]/20">BUY</span>
          <span className="text-[#26a69a] bg-[#26a69a]/10 py-1 rounded-md border border-[#26a69a]/20">STRONG BUY</span>
        </div>

        {/* Clean Verdict Box (ONLY Verdict Text) */}
        <div className={cn("mt-6 px-8 py-3.5 rounded-2xl border backdrop-blur-xl transition-all text-center w-full", verdictStyle.bg)}>
          <span className={cn("text-2xl font-black tracking-widest block drop-shadow-md uppercase", verdictStyle.text)}>
            {currentSummary.verdict}
          </span>
        </div>
      </div>

      {/* Summary Score Counters */}
      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl z-10">
        <div className="text-center">
          <span className="text-[9px] font-black text-[#ef5350] block uppercase tracking-wider">SELL SIGNALS</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.sellCount}</span>
        </div>
        <div className="text-center border-x border-white/[0.06]">
          <span className="text-[9px] font-black text-amber-400 block uppercase tracking-wider">NEUTRAL</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.neutralCount}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] font-black text-[#26a69a] block uppercase tracking-wider">BUY SIGNALS</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.buyCount}</span>
        </div>
      </div>

    </div>
  );
};