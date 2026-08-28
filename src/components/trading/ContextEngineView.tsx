import React from 'react';
import { MarketContext, ConfluenceZone } from '../../lib/context-engine';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Database, XCircle } from 'lucide-react';

interface ContextEngineViewProps {
  context: MarketContext;
}

const stateColors: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  WAITING: { bg: 'bg-white/5', text: 'text-white/50', border: 'border-white/10', glow: '' },
  MONITORING: { bg: 'bg-white/5', text: 'text-white/60', border: 'border-white/10', glow: '' },
  APPROACHING_ZONE: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-[0_0_25px_rgba(245,158,11,0.2)]' },
  ENTERING_ZONE: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.3)]' },
  IN_ZONE: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.3)]' },
  ANALYZING: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', glow: '' },
  CONFIRMATION: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/40', glow: 'shadow-[0_0_30px_rgba(59,130,246,0.3)]' },
  HIGH_CONFLUENCE: { bg: 'bg-[#26a69a]/15', text: 'text-[#26a69a]', border: 'border-[#26a69a]/40', glow: 'shadow-[0_0_35px_rgba(38,166,154,0.4)]' },
  CONFLICT: { bg: 'bg-[#ef5350]/15', text: 'text-[#ef5350]', border: 'border-[#ef5350]/40', glow: 'shadow-[0_0_30px_rgba(239,83,80,0.3)]' },
  INVALIDATED: { bg: 'bg-[#ef5350]/10', text: 'text-[#ef5350]', border: 'border-[#ef5350]/30', glow: '' },
  EXITED_ZONE: { bg: 'bg-white/5', text: 'text-white/50', border: 'border-white/10', glow: '' },
};

export const ContextEngineView: React.FC<ContextEngineViewProps> = ({ context }) => {
  const stateStyle = stateColors[context.state] || stateColors.WAITING;
  const isHighConviction = context.state === 'HIGH_CONFLUENCE';
  const isConflict = context.conflicts.length > 0;
  const dataQualityPct = Math.round(context.dataQuality.score * 100);

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 flex flex-col space-y-5 shadow-[0_25px_60px_rgba(0,0,0,0.9)] relative overflow-hidden">
      
      {/* Dynamic background glow */}
      <div className={cn("absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-radial rounded-full blur-3xl pointer-events-none transition-all duration-700",
        context.directionalBias === 'BULLISH' ? 'bg-[#26a69a]/10' :
        context.directionalBias === 'BEARISH' ? 'bg-[#ef5350]/10' : 'bg-amber-500/10'
      )} />

      {/* Header: Market State + Price */}
      <div className="flex items-start justify-between relative z-10">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.25em]">MARKET CONTEXT</span>
            <Database size={10} className="text-white/30" />
            <span className="text-[9px] text-white/40 font-mono">DQ: {dataQualityPct}%</span>
          </div>
          <div className={cn(
            "inline-flex items-center space-x-2 px-4 py-2 rounded-full border text-xs font-black tracking-wider uppercase",
            stateStyle.bg, stateStyle.text, stateStyle.border, stateStyle.glow
          )}>
            {isHighConviction && <CheckCircle2 size={14} />}
            {isConflict && <AlertTriangle size={14} />}
            <span>{context.state.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-[11px] text-white/60 mt-3 leading-relaxed max-w-md">
            {context.stateMessage}
          </p>
        </div>

        <div className="text-right">
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Price</div>
          <div className="text-3xl font-black font-mono text-white">${context.price.toFixed(2)}</div>
          <div className="text-[10px] text-white/40 font-mono mt-1">{context.symbol}</div>
        </div>
      </div>

      {/* Score & Confidence Row */}
      <div className="grid grid-cols-3 gap-3 relative z-10">
        <ScoreBox
          label="Context Score"
          value={context.contextScore}
          suffix="/100"
          color={context.contextScore > 0 ? 'text-[#26a69a]' : context.contextScore < 0 ? 'text-[#ef5350]' : 'text-amber-400'}
        />
        <ScoreBox
          label="Confidence"
          value={context.confidenceScore}
          suffix="%"
          color="text-white"
          subtitle="NOT a probability of profit"
        />
        <ScoreBox
          label="Data Quality"
          value={dataQualityPct}
          suffix="%"
          color={dataQualityPct >= 80 ? 'text-[#26a69a]' : dataQualityPct >= 50 ? 'text-amber-400' : 'text-[#ef5350]'}
        />
      </div>

      {/* Nearest Zone */}
      {context.nearestZone && (
        <NearestZoneCard zone={context.nearestZone} price={context.price} />
      )}

      {/* Conflicts */}
      {context.conflicts.length > 0 && (
        <div className="bg-[#ef5350]/5 border border-[#ef5350]/20 rounded-2xl p-4 relative z-10">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle size={14} className="text-[#ef5350]" />
            <span className="text-[10px] font-black text-[#ef5350] uppercase tracking-wider">
              CONFLICTS ({context.conflicts.length})
            </span>
          </div>
          <div className="space-y-2">
            {context.conflicts.map(c => (
              <div key={c.id} className="text-[11px] text-white/70 leading-relaxed">
                <div className="font-bold text-white/90">{c.description}</div>
                <div className="text-[10px] text-white/50 mt-0.5">
                  <span className="text-[#26a69a]">{c.bullishSide}</span> vs <span className="text-[#ef5350]">{c.bearishSide}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Multi-Timeframe Context */}
      <div className="grid grid-cols-3 gap-2 relative z-10">
        <TimeframeBadge label="HTF" state={context.structure.htf} />
        <TimeframeBadge label="MTF" state={context.structure.mtf} />
        <TimeframeBadge label="LTF" state={context.structure.ltf} />
      </div>

      {/* Factor Attribution */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 relative z-10">
        <div className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">
          SCORE ATTRIBUTION
        </div>
        <div className="grid grid-cols-1 gap-2">
          {context.positiveFactors.length > 0 && (
            <FactorList title="POSITIVE" color="text-[#26a69a]" factors={context.positiveFactors} />
          )}
          {context.negativeFactors.length > 0 && (
            <FactorList title="NEGATIVE" color="text-[#ef5350]" factors={context.negativeFactors} />
          )}
          {context.neutralFactors.length > 0 && (
            <FactorList title="NEUTRAL" color="text-amber-400" factors={context.neutralFactors} />
          )}
        </div>
      </div>

    </div>
  );
};

const ScoreBox: React.FC<{ label: string; value: number; suffix: string; color: string; subtitle?: string }> = ({ label, value, suffix, color, subtitle }) => (
  <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-3 text-center">
    <div className="text-[9px] font-black text-white/40 uppercase tracking-wider">{label}</div>
    <div className={cn("text-2xl font-mono font-black mt-1", color)}>
      {value > 0 && value !== Math.abs(value) ? '' : ''}{value}{suffix}
    </div>
    {subtitle && <div className="text-[8px] text-white/30 mt-0.5 italic">{subtitle}</div>}
  </div>
);

const NearestZoneCard: React.FC<{ zone: ConfluenceZone; price: number }> = ({ zone, price }) => {
  const directionColor = zone.direction === 'BULLISH' ? 'text-[#26a69a]' : zone.direction === 'BEARISH' ? 'text-[#ef5350]' : 'text-amber-400';
  const dist = Math.abs(zone.distanceToPrice);

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[9px] font-black text-white/40 uppercase tracking-widest">NEAREST INSTITUTIONAL ZONE</div>
          <div className={cn("text-sm font-black tracking-wider mt-1", directionColor)}>
            {zone.direction} ZONE • {zone.sources.join(' + ')}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-white/40 uppercase">Distance</div>
          <div className="text-sm font-mono font-black text-white">{dist.toFixed(1)} pts</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center text-[10px]">
        <div>
          <div className="text-white/40 uppercase tracking-wider">Range</div>
          <div className="font-mono font-bold text-white mt-0.5">{zone.low.toFixed(2)} – {zone.high.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-white/40 uppercase tracking-wider">Confluences</div>
          <div className="font-mono font-bold text-amber-400 mt-0.5">{zone.confluenceCount}</div>
        </div>
        <div>
          <div className="text-white/40 uppercase tracking-wider">Strength</div>
          <div className="font-mono font-bold text-white mt-0.5">{(zone.totalStrength * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
};

const TimeframeBadge: React.FC<{ label: string; state: any }> = ({ label, state }) => {
  if (!state) {
    return (
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2 text-center">
        <div className="text-[8px] text-white/40 font-black tracking-wider">{label}</div>
        <div className="text-[10px] text-white/30 mt-1">--</div>
      </div>
    );
  }
  const trendColor = state.trend === 'BULLISH' ? 'text-[#26a69a]' : state.trend === 'BEARISH' ? 'text-[#ef5350]' : 'text-amber-400';
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2 text-center">
      <div className="text-[8px] text-white/40 font-black tracking-wider">{label}</div>
      <div className={cn("text-[10px] font-black mt-1", trendColor)}>{state.trend}</div>
    </div>
  );
};

const FactorList: React.FC<{ title: string; color: string; factors: any[] }> = ({ title, color, factors }) => (
  <div>
    <div className={cn("text-[9px] font-black uppercase tracking-wider mb-1", color)}>{title}</div>
    <div className="space-y-1">
      {factors.slice(0, 4).map(f => (
        <div key={f.id} className="flex items-center justify-between text-[10px]">
          <span className="text-white/70">{f.label}</span>
          <span className="font-mono text-white/50">{f.weight > 0 ? '+' : ''}{f.weight.toFixed(2)}</span>
        </div>
      ))}
    </div>
  </div>
);