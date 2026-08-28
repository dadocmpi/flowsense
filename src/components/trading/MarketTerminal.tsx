import React from 'react';
import { MarketContext, ConfluenceZone } from '@/lib/context-engine';
import { fmtPrice, fmtSignedScore, fmtScore, fmtDataQuality } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  CheckCircle2, 
  Database,
  Crosshair,
  CircleDot,
  Clock
} from 'lucide-react';

interface MarketTerminalProps {
  context: MarketContext;
  precision?: number;
}

export const MarketTerminal: React.FC<MarketTerminalProps> = ({ context, precision = 2 }) => {
  const { 
    price, 
    symbol, 
    state, 
    stateMessage, 
    directionalBias, 
    contextScore, 
    confidenceScore, 
    dataQuality,
    nearestZone,
    activeZones,
    positiveFactors,
    negativeFactors,
    neutralFactors,
    conflicts,
    structure,
  } = context;

  // Bias config
  const biasConfig = {
    BULLISH: { Icon: TrendingUp, color: 'text-[#26a69a]', bg: 'bg-[#26a69a]/15', border: 'border-[#26a69a]/30', glow: 'shadow-[0_0_20px_rgba(38,166,154,0.3)]' },
    BEARISH: { Icon: TrendingDown, color: 'text-[#ef5350]', bg: 'bg-[#ef5350]/15', border: 'border-[#ef5350]/30', glow: 'shadow-[0_0_20px_rgba(239,83,80,0.3)]' },
    NEUTRAL: { Icon: Minus, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]' },
  }[directionalBias];

  const BiasIcon = biasConfig.Icon;

  // State config
  const stateConfig: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
    WAITING:          { color: 'text-white/50',  bg: 'bg-white/5',          icon: CircleDot },
    MONITORING:       { color: 'text-white/50',  bg: 'bg-white/5',          icon: CircleDot },
    APPROACHING_ZONE: { color: 'text-amber-400', bg: 'bg-amber-500/10',    icon: TrendingUp },
    ENTERING_ZONE:    { color: 'text-amber-400', bg: 'bg-amber-500/15',    icon: TrendingUp },
    IN_ZONE:          { color: 'text-amber-400', bg: 'bg-amber-500/15',    icon: Crosshair },
    ANALYZING:        { color: 'text-blue-400',  bg: 'bg-blue-500/10',    icon: Database },
    CONFIRMATION:     { color: 'text-blue-400',  bg: 'bg-blue-500/15',    icon: CheckCircle2 },
    HIGH_CONFLUENCE:   { color: 'text-[#26a69a]', bg: 'bg-[#26a69a]/15', icon: CheckCircle2 },
    CONFLICT:         { color: 'text-[#ef5350]', bg: 'bg-[#ef5350]/15', icon: AlertTriangle },
    INVALIDATED:      { color: 'text-[#ef5350]', bg: 'bg-[#ef5350]/10', icon: AlertTriangle },
    EXITED_ZONE:      { color: 'text-white/50',  bg: 'bg-white/5',          icon: CircleDot },
  };
  const stCfg = stateConfig[state] || stateConfig.WAITING;
  const StIcon = stCfg.icon;

  const dqPct = Math.round(dataQuality.score * 100);

  // Split zones above/below price
  const zonesAbove = activeZones.filter(z => z.mid > price).slice(0, 2);
  const zonesBelow = activeZones.filter(z => z.mid <= price).slice(0, 2);

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-6 flex flex-col gap-5 shadow-[0_25px_60px_rgba(0,0,0,0.9)] h-full">
      
      {/* Top Row: Price + Bias + State */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">{symbol}</div>
          <div className="text-4xl font-black font-mono text-white tracking-tight">${fmtPrice(price, precision)}</div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Market Bias */}
          <div className={cn("flex items-center space-x-2 px-3 py-1.5 rounded-xl border", biasConfig.bg, biasConfig.border, biasConfig.glow)}>
            <BiasIcon size={14} className={biasConfig.color} />
            <span className={cn("text-xs font-black tracking-wider", biasConfig.color)}>
              {directionalBias}
            </span>
          </div>

          {/* Market State */}
          <div className={cn("flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border", stCfg.bg, "border-white/[0.06]")}>
            <StIcon size={10} className={stCfg.color} />
            <span className={cn("text-[9px] font-black tracking-wider uppercase", stCfg.color)}>
              {state.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* State Message */}
      <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5">
        <p className="text-[10px] text-white/60 leading-relaxed">{stateMessage}</p>
      </div>

      {/* Scores Row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Context Score', value: fmtSignedScore(contextScore), color: contextScore > 0 ? 'text-[#26a69a]' : contextScore < 0 ? 'text-[#ef5350]' : 'text-amber-400' },
          { label: 'Confidence', value: `${fmtScore(confidenceScore)}%`, color: confidenceScore >= 70 ? 'text-[#26a69a]' : confidenceScore >= 40 ? 'text-amber-400' : 'text-[#ef5350]' },
          { label: 'Data Quality', value: `${dqPct}%`, color: dqPct >= 80 ? 'text-[#26a69a]' : dqPct >= 50 ? 'text-amber-400' : 'text-[#ef5350]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 text-center">
            <span className="text-[8px] font-black text-white/40 uppercase tracking-wider block mb-1">{label}</span>
            <span className={cn("text-lg font-black font-mono block", color)}>{value}</span>
          </div>
        ))}
      </div>

      {/* Structure Timeframes */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'HTF', trend: structure.htf?.trend ?? null },
          { label: 'MTF', trend: structure.mtf?.trend ?? null },
          { label: 'LTF', trend: structure.ltf?.trend ?? null },
        ].map(({ label, trend }) => {
          const tColor = trend === 'BULLISH' ? 'text-[#26a69a]' : trend === 'BEARISH' ? 'text-[#ef5350]' : 'text-amber-400';
          return (
            <div key={label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2 text-center">
              <span className="text-[8px] font-black text-white/40 block mb-0.5">{label}</span>
              <span className={cn("text-[10px] font-black block", tColor)}>{trend || '--'}</span>
            </div>
          );
        })}
      </div>

      {/* Nearest Zone */}
      {nearestZone && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest flex items-center space-x-1">
              <Crosshair size={8} className="text-amber-400" />
              <span>Nearest Zone</span>
            </span>
            <span className={cn(
              "text-[8px] font-black px-1.5 py-0.5 rounded uppercase",
              nearestZone.direction === 'BULLISH' ? 'bg-[#26a69a]/15 text-[#26a69a]' :
              nearestZone.direction === 'BEARISH' ? 'bg-[#ef5350]/15 text-[#ef5350]' : 'bg-white/5 text-white/40'
            )}>
              {nearestZone.direction}
            </span>
          </div>
          <div className="text-[10px] font-mono font-black text-white mb-1">
            ${nearestZone.low.toFixed(precision)} – ${nearestZone.high.toFixed(precision)}
            <span className="text-white/40 ml-2 font-normal">
              ({Math.abs(nearestZone.distanceToPrice).toFixed(precision)} pts away)
            </span>
          </div>
          <div className="flex items-center space-x-1 flex-wrap">
            {nearestZone.sources.map(s => (
              <span key={s} className="text-[7px] font-bold text-white/40 bg-white/[0.03] px-1.5 py-0.5 rounded uppercase tracking-tighter">
                {s.replace(/_/g, ' ')}
              </span>
            ))}
            <span className="text-[7px] font-black text-amber-400 ml-1">
              CONFLUENCE: {nearestZone.confluenceCount}
            </span>
          </div>
        </div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="bg-[#ef5350]/5 border border-[#ef5350]/20 rounded-xl p-3">
          <div className="flex items-center space-x-1.5 mb-2">
            <AlertTriangle size={10} className="text-[#ef5350]" />
            <span className="text-[9px] font-black text-[#ef5350] uppercase tracking-wider">
              Contradictions ({conflicts.length})
            </span>
          </div>
          <div className="space-y-1">
            {conflicts.map(c => (
              <div key={c.id} className="text-[9px] text-white/60">
                <span className="text-white/80 font-medium">{c.description}</span>
                <div className="text-[8px] mt-0.5">
                  <span className="text-[#26a69a]">{c.bullishSide}</span>
                  {' vs '}
                  <span className="text-[#ef5350]">{c.bearishSide}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Factor Attribution */}
      {positiveFactors.length > 0 || negativeFactors.length > 0 ? (
        <div>
          <div className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-2">Score Attribution</div>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {positiveFactors.slice(0, 4).map(f => (
              <div key={f.id} className="flex items-center justify-between text-[9px] py-0.5 px-2 bg-[#26a69a]/10 rounded-lg">
                <span className="text-white/70 truncate flex-1 mr-2">{f.label}</span>
                <span className="text-[#26a69a] font-mono font-black flex-shrink-0">+{f.weight.toFixed(2)}</span>
              </div>
            ))}
            {negativeFactors.slice(0, 3).map(f => (
              <div key={f.id} className="flex items-center justify-between text-[9px] py-0.5 px-2 bg-[#ef5350]/10 rounded-lg">
                <span className="text-white/70 truncate flex-1 mr-2">{f.label}</span>
                <span className="text-[#ef5350] font-mono font-black flex-shrink-0">{f.weight.toFixed(2)}</span>
              </div>
            ))}
            {neutralFactors.slice(0, 2).map(f => (
              <div key={f.id} className="flex items-center justify-between text-[9px] py-0.5 px-2 bg-white/[0.03] rounded-lg">
                <span className="text-white/50 truncate flex-1 mr-2">{f.label}</span>
                <span className="text-amber-400 font-mono font-black flex-shrink-0">{f.weight.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-4">
          <span className="text-[10px] text-white/30">Collecting evidence...</span>
        </div>
      )}

    </div>
  );
};