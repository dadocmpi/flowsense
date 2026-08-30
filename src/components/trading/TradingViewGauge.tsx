import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IndicatorSummary } from '../../types/trading';
import { cn } from '@/lib/utils';
import { useCompassHysteresis, CompassVerdict } from '../../hooks/useCompassHysteresis';

interface TradingViewGaugeProps {
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
  mtfSummary: IndicatorSummary;
  selectedAsset: string;
  sessionIntelligence: {
    currentSession: 'GOLD' | 'US500' | 'CLOSED';
    isSessionActive: boolean;
    madridTime: string;
    newYorkTime: string;
  };
  zoneIntelligence: {
    zone: any; // ManualDailyZone | null
    isInsideZone: boolean;
    isApproachingZone: boolean;
    distanceToZone: number;
  };
  buySupport: number; // 0-100
  sellSupport: number; // 0-100
  state: string; // One of the 10 states
  evidenceGroups: Record<string, {
    direction: 'BUY' | 'SELL' | 'NEUTRAL';
    strength: number; // 0-100
    confidence: number; // 0-100
    features: string[];
    contradictions: string[];
    freshness: 'LIVE' | 'RECENT' | 'STALE' | 'UNAVAILABLE';
  }>;
  isLoading?: boolean;
}

const VERDICT_COLORS: Record<CompassVerdict, { primary: string; bg: string; glow: string }> = {
  STRONG_BUY: { primary: '#26a69a', bg: 'bg-[#26a69a]/15', glow: 'from-[#26a69a]/30' },
  BUY: { primary: '#4db6ac', bg: 'bg-[#26a69a]/10', glow: 'from-[#4db6ac]/20' },
  NEUTRAL: { primary: '#f59e0b', bg: 'bg-amber-500/10', glow: 'from-amber-500/15' },
  SELL: { primary: '#e57373', bg: 'bg-[#ef5350]/10', glow: 'from-[#e57373]/20' },
  STRONG_SELL: { primary: '#ef5350', bg: 'bg-[#ef5350]/15', glow: 'from-[#ef5350]/30' },
};

function summaryToVerdict(v: string): CompassVerdict {
  if (v === 'STRONG BUY') return 'STRONG_BUY';
  if (v === 'BUY') return 'BUY';
  if (v === 'SELL') return 'SELL';
  if (v === 'STRONG SELL') return 'STRONG_SELL';
  return 'NEUTRAL';
}

export function buildOverallComposite(
  osc: IndicatorSummary,
  ma: IndicatorSummary,
  of: IndicatorSummary,
  mtf: IndicatorSummary
): IndicatorSummary {
  const weights = {
    oscillators: 0.30,
    movingAverages: 0.20,
    orderFlow: 0.15,
    mtf: 0.35,
  };
  
  const totalW = weights.oscillators + weights.movingAverages + weights.orderFlow + weights.mtf;
  
  const buy =
    osc.buyCount * weights.oscillators +
    ma.buyCount * weights.movingAverages +
    of.buyCount * weights.orderFlow +
    mtf.buyCount * weights.mtf;
  const sell =
    osc.sellCount * weights.oscillators +
    ma.sellCount * weights.movingAverages +
    of.sellCount * weights.orderFlow +
    mtf.sellCount * weights.mtf;
  const neutral =
    osc.neutralCount * weights.oscillators +
    ma.neutralCount * weights.movingAverages +
    of.neutralCount * weights.orderFlow +
    mtf.neutralCount * weights.mtf;
  
  const score = Math.max(
    5,
    Math.min(95, Math.round(
      (osc.score * weights.oscillators +
       ma.score * weights.movingAverages +
       of.score * weights.orderFlow +
       mtf.score * weights.mtf) / totalW
    ))
  );
  
  let verdict: IndicatorSummary['verdict'] = 'NEUTRAL';
  if (score >= 75) verdict = 'STRONG BUY';
  else if (score >= 55) verdict = 'BUY';
  else if (score <= 25) verdict = 'STRONG SELL';
  else if (score <= 45) verdict = 'SELL';
  
  return {
    buyCount: Math.round(buy / totalW),
    neutralCount: Math.round(neutral / totalW),
    sellCount: Math.round(sell / totalW),
    score,
    verdict,
  };
}

export const TradingViewGauge: React.FC<TradingViewGaugeProps> = ({
  overallSummary,
  oscillatorsSummary,
  maSummary,
  orderFlowSummary,
  mtfSummary,
  selectedAsset,
  sessionIntelligence,
  zoneIntelligence,
  buySupport,
  sellSupport,
  state,
  evidenceGroups,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 h-full shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col justify-between">
        <div className="h-4 w-48 bg-white/5 rounded animate-pulse mb-4" />
        <div className="flex flex-col items-center justify-center flex-grow py-8">
          <div className="w-72 h-36 bg-white/5 rounded-3xl animate-pulse" />
        </div>
        <div className="h-16 bg-white/5 rounded-2xl animate-pulse mt-4" />
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'overall' | 'oscillators' | 'ma' | 'orderflow' | 'mtf'>('overall');
  
  const currentSummary = 
    activeTab === 'oscillators' ? oscillatorsSummary :
    activeTab === 'ma' ? maSummary :
    activeTab === 'orderflow' ? orderFlowSummary :
    activeTab === 'mtf' ? mtfSummary :
    overallSummary;
  
  const hysteresis = useCompassHysteresis(currentSummary, 0.25);
  
  const colors = VERDICT_COLORS[hysteresis.displayedVerdict];
  
  const targetAngle = -90 + ((hysteresis.displayedScore + 100) / 200) * 180;
  const [needleAngle, setNeedleAngle] = useState(targetAngle);
  
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setNeedleAngle(prev => {
        const diff = targetAngle - prev;
        return Math.abs(diff) < 0.5 ? targetAngle : prev + diff * 0.08;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [targetAngle]);

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

  const formatVerdict = (v: CompassVerdict): string => v.replace('_', ' ');
  const divergence = Math.abs(hysteresis.rawScore - hysteresis.displayedScore);

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 flex flex-col justify-between h-full shadow-[0_25px_60px_rgba(0,0,0,0.9)] relative overflow-hidden backdrop-blur-2xl select-none">
      
      <div className={cn("absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-radial rounded-full blur-3xl pointer-events-none transition-all duration-700 bg-gradient-to-b", colors.glow)} />

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
            { id: 'mtf', label: 'MTF' },
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
              />
            ))}
          </svg>

          <motion.div
            className="absolute bottom-2 left-1/2 -ml-[3px] w-1.5 h-32 origin-bottom flex flex-col justify-start items-center z-30 pointer-events-none"
            animate={{ rotate: needleAngle }}
            transition={{ type: 'spring', stiffness: 30, damping: 18, mass: 1.2 }}
          >
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[28px] border-b-amber-400 filter drop-shadow-[0_0_12px_rgba(251,191,36,1)]" />
            <div className="w-[2.5px] h-[90px] bg-gradient-to-t from-amber-500/20 via-amber-400/90 to-amber-300" />
          </motion.div>

          <div className="absolute -bottom-2 w-10 h-10 rounded-full bg-[#07080a] border-2 border-amber-400 z-40 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.6)]">
            <div className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
        </div>

        <div className={cn("mt-6 px-8 py-3.5 rounded-2xl border backdrop-blur-xl transition-all text-center w-full", colors.bg)}>
          <span 
            className="text-2xl font-black tracking-widest block drop-shadow-md uppercase"
            style={{ color: colors.primary }}
          >
            {formatVerdict(hysteresis.displayedVerdict)}
          </span>
          <div className="flex items-center justify-center gap-2 mt-2 text-[9px] font-bold text-white/50 uppercase tracking-wider">
            <span>Confirm: {hysteresis.confirmationCount}/5</span>
            {hysteresis.candidateVerdict && hysteresis.candidateVerdict !== hysteresis.displayedVerdict && (
              <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                → {formatVerdict(hysteresis.candidateVerdict)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl z-10">
        <div className="text-center">
          <span className="text-[9px] font-black text-[#ef5350] block uppercase tracking-wider">SELL SIGNALS</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block">{currentSummary.sellCount}</span>
        </div>
        <div className="text-center border-x border-white/[0.06]">
          <span className="text-[9px] font-black text-amber-400 block uppercase tracking-wider">NEUTRAL</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block>{currentSummary.neutralCount}</span>
        </div>
        <div className="text-center">
          <span className="text-[9px] font-black text-[#26a69a] block uppercase tracking-wider">BUY SIGNALS</span>
          <span className="text-2xl font-mono font-black text-white/90 mt-0.5 block>{currentSummary.buyCount}</span>
        </div>
      </div>

      <div className="mt-3 bg-black/40 border border-white/[0.06] rounded-xl px-3 py-2 font-mono text-[9px] z-10">
        <div className="flex items-center justify-between text-white/40 uppercase tracking-wider mb-1">
          <span className="text-amber-400 font-black">DEBUG · Smoothing Live</span>
          <span className={cn("font-black", divergence > 0.1 ? "text-[#26a69a]" : "text-white/30")}>
            Δ {divergence.toFixed(1)} pts
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-white/70">
          <div className="flex justify-between">
            <span className="text-white/30">RAW score</span>
            <span className="text-orange-300 font-black">
              {hysteresis.rawScore > 0 ? '+' : ''}{hysteresis.rawScore.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/30">RAW verdict</span>
            <span className="text-orange-300 font-black">{formatVerdict(hysteresis.rawVerdict)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/30">SMOOTH score</span>
            <span className="text-[#4db6ac] font-black">
              {hysteresis.displayedScore > 0 ? '+' : ''}{hysteresis.displayedScore.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/30">SMOOTH verdict</span>
            <span className="text-[#4db6ac] font-black">{formatVerdict(hysteresis.displayedVerdict)}</span>
          </div>
        </div>
        <div className="mt-1.5 pt-1.5 border-t border-white/[0.04] flex items-center justify-between text-white/40">
          <span>Agreement: <span className="text-white/80 font-black">{hysteresis.agreementCount}/{hysteresis.totalIndicators}</span></span>
          <span>Cycles: <span className="text-white/80 font-black">{hysteresis.cyclesSinceLastFlip}</span></span>
        </div>
      </div>

      {/* New sections for session, zone, and supports */}
      <div className="mt-4 p-4 bg-white/[0.02] rounded-lg border border-white/[0.04]">
        <div className="grid grid-cols-2 gap-4 text-sm font-mono">
          <div>
            <span className="text-white/50">SESSION:</span>
            <span className="text-white">{sessionIntelligence.currentSession}</span>
            {sessionIntelligence.isSessionActive && (
              <span className="text-xs ml-1 bg-[#26a69a]/20 text-[#26a69a] px-1 rounded">ACTIVE</span>
            )}
          </div>
          <div>
            <span className="text-white/50">ZONE:</span>
            <span className="text-white">{zoneIntelligence.isInsideZone ? 'INSIDE' : zoneIntelligence.isApproachingZone ? 'APPROACHING' : 'OUTSIDE'}</span>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4 text-lg font-bold">
          <div className="flex flex-col">
            <div className="text-white/50">BUY SUPPORT</div>
            <span className="text-white">{buySupport}</span>
          </div>
          <div className="flex flex-col">
            <div className="text-white/50">SELL SUPPORT</span>
          </div>
        </div>
        <div className="mt-2 text-white/50 text-center">STATE: {state}</div>
      </div>

      {/* Evidence groups summary */}
      <div className="mt-4 p-4 bg-white/[0.02] rounded-lg border border-white/[0.04]">
        <div className="text-white/50 font-bold mb-2">EVIDENCE GROUPS</div>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          {Object.keys(evidenceGroups).map(group => (
            <div key={group} className="flex items-center">
              <span className="text-white/50 w-16">{group.toUpperCase()}</span>
              <span className={getGroupStatus(evidenceGroups[group])}>●</span>
              <span className="ml-1 text-white/50">{evidenceGroups[group].strength}%</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

function getGroupStatus(group: any): string {
  // Returns a Tailwind color class based on group's confidence and freshness
  const { confidence, freshness } = group;
  
  if (freshness === 'UNAVAILABLE') return 'text-white/40';
  if (freshness === 'STALE') return 'text-amber-400';
  if (confidence >= 80) return 'text-[#26a69a]';
  if (confidence >= 60) return 'text-amber-400';
  return 'text-[#ef5350]';
}