import React from 'react';
import { AnalysisFactor } from '@/lib/context-engine';
import { cn } from '@/lib/utils';
import { fmtSignedScore, fmtScore } from '@/lib/formatters';
import { 
  BarChart3, 
  Activity, 
  BookOpen, 
  TrendingUp, 
  Zap, 
  CircleDot 
} from 'lucide-react';

interface EvidencePanelProps {
  positiveFactors: AnalysisFactor[];
  negativeFactors: AnalysisFactor[];
  neutralFactors: AnalysisFactor[];
  oscillators?: { name: string; value: string; action: string }[];
  movingAverages?: { name: string; value: string; action: string }[];
  orderFlowIndicators?: { name: string; value: string; action: string }[];
  compact?: boolean;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  positiveFactors,
  negativeFactors,
  neutralFactors,
  oscillators,
  movingAverages,
  orderFlowIndicators,
  compact = false,
}) => {
  const allFactors = [...positiveFactors, ...negativeFactors, ...neutralFactors];

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-5 flex flex-col h-full shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center space-x-2">
          <Activity size={12} className="text-amber-400" />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Evidence Panel</span>
        </div>
        <div className="flex items-center space-x-2 text-[9px] font-mono">
          <span className="text-[#26a69a]">{positiveFactors.length} POS</span>
          <span className="text-white/20">/</span>
          <span className="text-[#ef5350]">{negativeFactors.length} NEG</span>
          <span className="text-white/20">/</span>
          <span className="text-amber-400">{neutralFactors.length} NEU</span>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto space-y-4">
        
        {/* Score Attribution */}
        {allFactors.length > 0 && (
          <EvidenceCategory title="Score Attribution" icon={<BarChart3 size={10} className="text-amber-400" />}>
            <div className="space-y-1.5">
              {positiveFactors.slice(0, compact ? 4 : 8).map(f => (
                <EvidenceRow key={f.id} label={f.label} value={f.weight} polarity="POSITIVE" description={f.description} />
              ))}
              {negativeFactors.slice(0, compact ? 3 : 6).map(f => (
                <EvidenceRow key={f.id} label={f.label} value={f.weight} polarity="NEGATIVE" description={f.description} />
              ))}
              {neutralFactors.slice(0, compact ? 2 : 4).map(f => (
                <EvidenceRow key={f.id} label={f.label} value={f.weight} polarity="NEUTRAL" description={f.description} />
              ))}
            </div>
          </EvidenceCategory>
        )}

        {/* Oscillators */}
        {oscillators && oscillators.length > 0 && (
          <EvidenceCategory title="Oscillators" icon={<Activity size={10} className="text-blue-400" />}>
            <div className="space-y-1.5">
              {oscillators.map((item, idx) => (
                <IndicatorRow key={idx} name={item.name} value={item.value} action={item.action} />
              ))}
            </div>
          </EvidenceCategory>
        )}

        {/* Moving Averages */}
        {movingAverages && movingAverages.length > 0 && (
          <EvidenceCategory title="Moving Averages" icon={<TrendingUp size={10} className="text-purple-400" />}>
            <div className="space-y-1.5">
              {movingAverages.map((item, idx) => (
                <IndicatorRow key={idx} name={item.name} value={item.value} action={item.action} />
              ))}
            </div>
          </EvidenceCategory>
        )}

        {/* Order Flow */}
        {orderFlowIndicators && orderFlowIndicators.length > 0 && (
          <EvidenceCategory title="Order Flow" icon={<Zap size={10} className="text-cyan-400" />}>
            <div className="space-y-1.5">
              {orderFlowIndicators.map((item, idx) => (
                <IndicatorRow key={idx} name={item.name} value={item.value} action={item.action} />
              ))}
            </div>
          </EvidenceCategory>
        )}

        {/* Empty state */}
        {allFactors.length === 0 && !oscillators?.length && !movingAverages?.length && !orderFlowIndicators?.length && (
          <div className="flex items-center justify-center flex-grow">
            <div className="text-center py-8">
              <CircleDot size={24} className="text-white/20 mx-auto mb-2" />
              <p className="text-[10px] text-white/30">Collecting market evidence...</p>
              <p className="text-[9px] text-white/20 mt-1">Waiting for data to load</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

/* Sub-components */

const EvidenceCategory: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <div>
    <div className="flex items-center space-x-1.5 mb-2">
      {icon}
      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{title}</span>
    </div>
    {children}
  </div>
);

const EvidenceRow: React.FC<{
  label: string;
  value: number;
  polarity: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  description?: string;
}> = ({ label, value, polarity, description }) => {
  const color = polarity === 'POSITIVE' ? 'text-[#26a69a]' : polarity === 'NEGATIVE' ? 'text-[#ef5350]' : 'text-amber-400';
  const bgClass = polarity === 'POSITIVE' ? 'bg-[#26a69a]/10' : polarity === 'NEGATIVE' ? 'bg-[#ef5350]/10' : 'bg-white/[0.03]';
  const barColor = polarity === 'POSITIVE' ? 'bg-[#26a69a]/50' : polarity === 'NEGATIVE' ? 'bg-[#ef5350]/50' : 'bg-white/10';

  const barWidth = Math.min(100, Math.abs(value) * 100);

  return (
    <div className={cn("flex items-center justify-between text-[10px] py-0.5 px-2 rounded-lg", bgClass)}>
      <span className="text-white/70 font-medium truncate flex-1 mr-2" title={description || label}>
        {label}
      </span>
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full", barColor)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className={cn("font-mono font-black w-10 text-right", color)}>
          {fmtSignedScore(value)}
        </span>
      </div>
    </div>
  );
};

const IndicatorRow: React.FC<{
  name: string;
  value: string;
  action: string;
}> = ({ name, value, action }) => {
  const actionClass = action.includes('BUY') || action.includes('STRONG BUY')
    ? 'text-[#26a69a]'
    : action.includes('SELL') || action.includes('STRONG SELL')
    ? 'text-[#ef5350]'
    : 'text-amber-400';

  const actionBg = action.includes('BUY') || action.includes('STRONG BUY')
    ? 'bg-[#26a69a]/10 border-[#26a69a]/20'
    : action.includes('SELL') || action.includes('STRONG SELL')
    ? 'bg-[#ef5350]/10 border-[#ef5350]/20'
    : 'bg-white/5 border-white/5';

  return (
    <div className="flex items-center justify-between text-[10px] py-0.5 px-2 bg-white/[0.01] rounded-lg">
      <span className="text-white/60 font-medium truncate flex-1 mr-2">{name}</span>
      {value && <span className="text-white/40 font-mono text-[9px] flex-shrink-0 mr-2">{value}</span>}
      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border flex-shrink-0", actionBg, actionClass)}>
        {action}
      </span>
    </div>
  );
};