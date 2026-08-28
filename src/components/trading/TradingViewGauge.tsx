import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { IndicatorSummary, MarketState } from '@/types/trading';
import { MarketContext, ConfluenceZone } from '@/lib/context-engine';
import { fmtSignedScore, fmtScore } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { 
  Compass, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  CheckCircle2,
  Database,
  Crosshair
} from 'lucide-react';

interface TradingViewGaugeProps {
  /** The full market context from the engine */
  context: MarketContext | null;
  selectedAsset: string;
}

export const TradingViewGauge: React.FC<TradingViewGaugeProps> = ({
  context,
  selectedAsset,
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'zones' | 'structure'>('summary');

  // Derive all display values from context
  const bias = context?.directionalBias ?? 'NEUTRAL';
  const state = context?.state ?? 'WAITING';
  const ctxScore = context?.contextScore ?? 0;
  const confidence = context?.confidenceScore ?? 0;
  const dqScore = context?.dataQuality?.score ?? 0;
  const zones = context?.activeZones ?? [];
  const nearestZone = context?.nearestZone ?? null;

  // Bias config
  const biasConfig = {
    BULLISH: { icon: TrendingUp, color: 'text-[#26a69a]', bg: 'bg-[#26a69a]/15', border: 'border-[#26a69a]/30', glow: 'shadow-[0_0_20px_rgba(38,166,154,0.4)]' },
    BEARISH: { icon: TrendingDown, color: 'text-[#ef5350]', bg: 'bg-[#ef5350]/15', border: 'border-[#ef5350]/30', glow: 'shadow-[0_0_20px_rgba(239,83,80,0.4)]' },
    NEUTRAL: { icon: Minus, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]' },
  }[bias];

  const BiasIcon = biasConfig.icon;

  // State config
  const stateConfig = {
    WAITING: { color: 'text-white/50', bg: 'bg-white/5' },
    MONITORING: { color: 'text-white/50', bg: 'bg-white/5' },
    APPROACHING_ZONE: { color: 'text-amber-400', bg: 'bg-amber-500/10' },
    ENTERING_ZONE: { color: 'text-amber-400', bg: 'bg-amber-500/15' },
    IN_ZONE: { color: 'text-amber-400', bg: 'bg-amber-500/15' },
    ANALYZING: { color: 'text-blue-400', bg: 'bg-blue-500/10' },
    CONFIRMATION: { color: 'text-blue-400', bg: 'bg-blue-500/15' },
    HIGH_CONFLUENCE: { color: 'text-[#26a69a]', bg: 'bg-[#26a69a]/15' },
    CONFLICT: { color: 'text-[#ef5350]', bg: 'bg-[#ef5350]/15' },
    INVALIDATED: { color: 'text-[#ef5350]', bg: 'bg-[#ef5350]/10' },
    EXITED_ZONE: { color: 'text-white/50', bg: 'bg-white/5' },
  }[state] || { color: 'text-white/50', bg: 'bg-white/5' };

  // Score position on arc (-90 to +90 degrees)
  const needleAngle = -90 + ((ctxScore + 100) / 200) * 180;

  // Determine zone proximity description
  const getZoneLocationDesc = () => {
    if (!nearestZone) return { label: 'NO ZONES', distance: '--', type: 'NEUTRAL' };
    const dist = Math.abs(nearestZone.distanceToPrice);
    const direction = nearestZone.direction;
    return {
      label: nearestZone.sources.join(' + ') || direction,
      distance: dist.toFixed(2),
      type: direction,
    };
  };

  const zoneInfo = getZoneLocationDesc();

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-6 flex flex-col justify-between h-full shadow-[0_25px_60px_rgba(0,0,0,0.9)] relative overflow-hidden">
      
      {/* Dynamic background glow */}
      <div className={cn(
        "absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-700",
        bias === 'BULLISH' ? 'bg-[#26a69a]/8' :
        bias === 'BEARISH' ? 'bg-[#ef5350]/8' : 'bg-amber-500/8'
      )} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center space-x-2">
          <Compass size={12} className="text-amber-400" />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Confluence Compass</span>
        </div>
        <div className="flex items-center space-x-1.5 bg-white/[0.03] border border-white/[0.05] px-2.5 py-1 rounded-full">
          <span className={cn("w-1.5 h-1.5 rounded-full", dqScore >= 0.8 ? 'bg-[#26a69a] animate-pulse' : dqScore >= 0.5 ? 'bg-amber-400' : 'bg-[#ef5350]')} />
          <span className="text-[9px] font-mono text-white/40">DQ: {fmtScore(dqScore * 100)}%</span>
        </div>
      </div>

      {/* Market Bias */}
      <div className={cn("flex items-center space-x-3 px-4 py-3 rounded-2xl border mb-4 relative z-10", biasConfig.bg, biasConfig.border, biasConfig.glow)}>
        <div className={cn("p-2 rounded-xl bg-white/5", biasConfig.color)}>
          <BiasIcon size={18} strokeWidth={2} />
        </div>
        <div>
          <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">Market Bias</span>
          <span className={cn("text-lg font-black tracking-wider block", biasConfig.color)}>
            {bias}
          </span>
        </div>
        {state === 'HIGH_CONFLUENCE' && (
          <div className="ml-auto">
            <CheckCircle2 size={16} className="text-[#26a69a]" />
          </div>
        )}
        {state === 'CONFLICT' && (
          <div className="ml-auto">
            <AlertTriangle size={16} className="text-[#ef5350]" />
          </div>
        )}
      </div>

      {/* Needle Gauge */}
      <div className="relative w-full h-28 flex items-end justify-center mb-4 z-10">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 280 120">
          {/* Arc background */}
          <path
            d="M 30 110 A 110 110 0 0 1 250 110"
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Colored arc segments */}
          <path
            d="M 30 110 A 110 110 0 0 1 100 15"
            fill="none"
            stroke="#ef5350"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 100 15 A 110 110 0 0 1 140 10"
            fill="none"
            stroke="#e57373"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="M 140 10 A 110 110 0 0 1 180 10"
            fill="none"
            stroke="rgba(245,158,11,0.5)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M 180 10 A 110 110 0 0 1 220 15"
            fill="none"
            stroke="#4db6ac"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="M 220 15 A 110 110 0 0 1 250 110"
            fill="none"
            stroke="#26a69a"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.6"
          />
          {/* Tick marks */}
          {[-100, -75, -50, -25, 0, 25, 50, 75, 100].map((tick, i) => {
            const angle = -90 + ((tick + 100) / 200) * 180;
            const rad = (angle * Math.PI) / 180;
            const x1 = 140 + 95 * Math.cos(rad);
            const y1 = 110 + 95 * Math.sin(rad);
            const x2 = 140 + 108 * Math.cos(rad);
            const y2 = 110 + 108 * Math.sin(rad);
            return (
              <line
                key={tick}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={i === 4 ? 2 : 1}
              />
            );
          })}
          {/* Labels */}
          <text x="30" y="128" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace" textAnchor="middle">-100</text>
          <text x="140" y="8" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace" textAnchor="middle">0</text>
          <text x="250" y="128" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace" textAnchor="middle">+100</text>
        </svg>

        {/* Needle */}
        <motion.div
          className="absolute bottom-2 left-1/2 -ml-[2px] w-1 h-20 origin-bottom flex flex-col justify-start items-center z-20 pointer-events-none"
          animate={{ rotate: needleAngle }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
        >
          <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[22px] border-b-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
          <div className="w-[2px] h-[52px] bg-gradient-to-t from-amber-500/30 to-amber-400/90" />
        </motion.div>

        {/* Center pivot */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#07080a] border-2 border-amber-400 flex items-center justify-center z-30 shadow-[0_0_15px_rgba(245,158,11,0.5)]">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 gap-2 mb-4 relative z-10">
        {/* Context Score */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 text-center">
          <span className="text-[8px] font-black text-white/40 uppercase tracking-wider block mb-1">Context Score</span>
          <span className={cn(
            "text-xl font-black font-mono block",
            ctxScore > 0 ? 'text-[#26a69a]' : ctxScore < 0 ? 'text-[#ef5350]' : 'text-amber-400'
          )}>
            {fmtSignedScore(ctxScore)}
          </span>
        </div>

        {/* Confidence */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 text-center">
          <span className="text-[8px] font-black text-white/40 uppercase tracking-wider block mb-1">Confidence</span>
          <span className="text-xl font-black font-mono text-white block">
            {fmtScore(confidence)}<span className="text-[10px] text-white/40">%</span>
          </span>
        </div>
      </div>

      {/* Price Location */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-4 relative z-10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[8px] font-black text-white/40 uppercase tracking-widest flex items-center space-x-1">
            <Crosshair size={8} className="text-amber-400" />
            <span>Price Location</span>
          </span>
          <span className={cn(
            "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider",
            stateConfig.bg, stateConfig.color
          )}>
            {state.replace(/_/g, ' ')}
          </span>
        </div>
        {nearestZone ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono font-black text-white/70">
                ${nearestZone.low.toFixed(2)} – ${nearestZone.high.toFixed(2)}
              </span>
              <div className="flex space-x-0.5">
                {nearestZone.sources.slice(0, 3).map(s => (
                  <span key={s} className="text-[7px] font-black text-white/30 bg-white/5 px-1 py-0.5 rounded uppercase">
                    {s.replace(/_/g, ' ').slice(0, 3)}
                  </span>
                ))}
              </div>
            </div>
            <span className={cn(
              "text-[9px] font-mono font-black",
              zoneInfo.type === 'BULLISH' ? 'text-[#26a69a]' : zoneInfo.type === 'BEARISH' ? 'text-[#ef5350]' : 'text-amber-400'
            )}>
              {zoneInfo.distance} pts
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-white/30 italic">No relevant zones detected</span>
        )}
      </div>

      {/* Structure Timeframes */}
      <div className="grid grid-cols-3 gap-2 relative z-10">
        {[
          { label: 'HTF', state: context?.structure?.htf?.trend },
          { label: 'MTF', state: context?.structure?.mtf?.trend },
          { label: 'LTF', state: context?.structure?.ltf?.trend },
        ].map(({ label, state: st }) => {
          const stColor = st === 'BULLISH' ? 'text-[#26a69a]' : st === 'BEARISH' ? 'text-[#ef5350]' : 'text-amber-400';
          return (
            <div key={label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2 text-center">
              <span className="text-[8px] font-black text-white/40 block mb-0.5">{label}</span>
              <span className={cn("text-[10px] font-black block", stColor)}>
                {st || '--'}
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
};