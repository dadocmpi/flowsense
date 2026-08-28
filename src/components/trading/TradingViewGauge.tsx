import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IndicatorSummary } from '../../types/trading';
import { SmoothedSignal, DisplayVerdict } from '../../types/signalEngine';
import { cn } from '@/lib/utils';

interface TradingViewGaugeProps {
  // Existing props (for fallback / raw view)
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
  selectedAsset: string;
  // NEW: smoothed signal from Layer 4
  smoothedSignal?: SmoothedSignal | null;
}

const VERDICT_COLORS: Record<DisplayVerdict, { primary: string; bg: string; glow: string }> = {
  STRONG_BUY: { primary: '#26a69a', bg: 'bg-[#26a69a]/15', glow: 'from-[#26a69a]/30' },
  BUY: { primary: '#4db6ac', bg: 'bg-[#26a69a]/10', glow: 'from-[#4db6ac]/20' },
  NEUTRAL: { primary: '#f59e0b', bg: 'bg-amber-500/10', glow: 'from-amber-500/15' },
  SELL: { primary: '#e57373', bg: 'bg-[#ef5350]/10', glow: 'from-[#e57373]/20' },
  STRONG_SELL: { primary: '#ef5350', bg: 'bg-[#ef5350]/15', glow: 'from-[#ef5350]/30' },
};

export const TradingViewGauge: React.FC<TradingViewGaugeProps> = ({
  overallSummary,
  oscillatorsSummary,
  maSummary,
  orderFlowSummary,
  selectedAsset,
  smoothedSignal,
}) => {
  const [activeTab, setActiveTab] = useState<'overall' | 'oscillators' | 'ma' | 'orderflow'>('overall');
  
  // Use smoothed signal if available, else fall back to raw counts
  const usingSmoothed = smoothedSignal !== null && smoothedSignal !== undefined;
  
  const currentSummary = 
    activeTab === 'oscillators' ? oscillatorsSummary :
    activeTab === 'ma' ? maSummary :
    activeTab === 'orderflow' ? orderFlowSummary :
    overallSummary;
  
  // Verdict + score resolution
  let displayVerdict: DisplayVerdict;
  let score: number;
  let confidence: number;
  
  if (usingSmoothed && smoothedSignal) {
    // USE LAYER 4 OUTPUT
    displayVerdict = smoothedSignal.displayVerdict;
    score = smoothedSignal.compositeScore; // -100..+100
    confidence = smoothedSignal.confidence; // 0..100
  } else {
    // FALLBACK to old vote-counting
    displayVerdict = (currentSummary.verdict === 'STRONG BUY' ? 'STRONG_BUY' :
                      currentSummary.verdict === 'BUY' ? 'BUY' :
                      currentSummary.verdict === 'SELL' ? 'SELL' :
                      currentSummary.verdict === 'STRONG SELL' ? 'STRONG_SELL' :
                      'NEUTRAL') as DisplayVerdict;
    // Convert old 0..100 score to -100..+100
    score = currentSummary.score - 50;
    confidence = 50; // No smoothing = no confidence
  }
  
  const colors = VERDICT_COLORS[displayVerdict];
  
  // Animate needle angle (smooth, gradual)
  const targetAngle = -90 + ((score + 100) / 200) * 180; // -90..+90
  const [needleAngle, setNeedleAngle] = useState(targetAngle);
  
  useEffect(() => {
    // Smooth animation toward target — visual only, not the data smoothing
    const id = requestAnimationFrame(() => {
      setNeedleAngle(prev => {
        const diff = targetAngle - prev;
        return Math.abs(diff) < 0.5 ? targetAngle : prev + diff * 0.08;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [targetAngle]);

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

  const formatVerdict = (v: DisplayVerdict): string => {
    return v.replace('_', ' ');
  };

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 flex flex-col justify-between h-full shadow-[0_25px_60px_rgba(0,0,0,0.9)] relative overflow-hidden backdrop-blur-2xl select-none">
      
      <div className={cn("absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-radial rounded-full blur-3xl pointer-events-none transition-all duration-700 bg-gradient-to-b", colors.glow)} />

      {/* Header — show data source badge */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-2 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          <span className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em]">CONFLUENCE COMPASS</span>
          {usingSmoothed && (
            <span 
              className="text-[8px] font-black text-[#26a69a] bg-[#26a69a]/10 border border-[#26a69a]/30 px-1.5 py-0.5 rounded uppercase tracking-wider"
              title="This gauge consumes a smoothed, hysteresis-gated signal from Layer 4 of the signal engine. Other panels below show raw live data and may temporarily disagree."
            >
              SMOOTHED
            </span>
          )}
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

          {/* Needle with spring animation (gradual movement, not snap) */}
          <motion.div
            className="absolute bottom-2 left-1/2 -ml-[3px] w-1.5 h-32 origin-bottom flex flex-col justify-start items-center z-30 pointer-events-none"
            animate={{ rotate: needleAngle }}
            transition={{ type: 'spring', stiffness: 30, damping: 18, mass: 1.2 }}
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

        {/* Verdict Box */}
        <div className={cn("mt-6 px-8 py-3.5 rounded-2xl border backdrop-blur-xl transition-all text-center w-full", colors.bg)}>
          <span 
            className="text-2xl font-black tracking-widest block drop-shadow-md uppercase"
            style={{ color: colors.primary }}
          >
            {formatVerdict(displayVerdict)}
          </span>
          {usingSmoothed && (
            <div className="flex items-center justify-center gap-2 mt-2 text-[9px] font-bold text-white/50 uppercase tracking-wider">
              <span>Confidence: {confidence}%</span>
              {smoothedSignal?.quietZoneActive && (
                <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  QUIET ZONE
                </span>
              )}
              {smoothedSignal?.conflictDetected && (
                <span className="text-orange-400 bg-orange-500/10 border border-orange-500/30 px-1.5 py-0.5 rounded">
                  CONFLICT
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Score Counters — show different fields when smoothed */}
      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl z-10">
        {usingSmoothed && smoothedSignal ? (
          <>
            <div className="text-center">
              <span className="text-[9px] font-black text-[#ef5350] block uppercase tracking-wider">MACRO</span>
              <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">
                {smoothedSignal.macroScore > 0 ? '+' : ''}{smoothedSignal.macroScore}
              </span>
            </div>
            <div className="text-center border-x border-white/[0.06]">
              <span className="text-[9px] font-black text-amber-400 block uppercase tracking-wider">MTF</span>
              <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">
                {smoothedSignal.mtfScore > 0 ? '+' : ''}{smoothedSignal.mtfScore}
              </span>
            </div>
            <div className="text-center">
              <span className="text-[9px] font-black text-[#26a69a] block uppercase tracking-wider">SETUP</span>
              <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">
                {smoothedSignal.setupScore}
              </span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

    </div>
  );
};