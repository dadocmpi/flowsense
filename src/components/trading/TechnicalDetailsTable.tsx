import React from 'react';
import { IndicatorSignal } from '../../types/trading';
import { cn } from '@/lib/utils';

interface TechnicalDetailsTableProps {
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  orderFlowIndicators: IndicatorSignal[];
  isLoading?: boolean;
}

export const TechnicalDetailsTable: React.FC<TechnicalDetailsTableProps> = ({
  oscillators,
  movingAverages,
  orderFlowIndicators,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 h-full">
        {[1,2].map(i => (
          <div key={i} className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 h-80 animate-pulse">
            <div className="h-4 w-40 bg-white/5 rounded mb-4" />
            <div className="space-y-3">
              {[1,2,3,4].map(j => (
                <div key={j} className="h-6 bg-white/5 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const allFlowSignals = [...(oscillators || []), ...(orderFlowIndicators || [])];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 h-full">
      
      {/* Oscillators & Flow */}
      <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-4">
          <h3 className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
            Real Oscillators & Flow
          </h3>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </div>
        <div className="space-y-3 flex-grow">
          {(allFlowSignals || []).map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-white/[0.02] last:border-0">
              <span className="text-white/70 font-semibold">{item.name}</span>
              <div className="flex items-center space-x-3">
                <span className="font-mono text-white/90 font-bold text-[11px]">{item.value}</span>
                <span className={cn(
                  "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider min-w-[75px] text-center",
                  item.action.includes('BUY') ? "bg-[#26a69a]/15 text-[#26a69a] border border-[#26a69a]/30" :
                  item.action.includes('SELL') ? "bg-[#ef5350]/15 text-[#ef5350] border border-[#ef5350]/30" : "bg-white/5 text-white/40 border border-white/5"
                )}>
                  {item.action}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Moving Averages */}
      <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-4">
          <h3 className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
            Institutional Moving Averages
          </h3>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </div>
        <div className="space-y-3 flex-grow">
          {(movingAverages || []).map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-white/[0.02] last:border-0">
              <span className="text-white/70 font-semibold">{item.name}</span>
              <div className="flex items-center space-x-3">
                <span className="font-mono text-white/90 font-bold text-[11px]">{item.value}</span>
                <span className={cn(
                  "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider min-w-[75px] text-center",
                  item.action.includes('BUY') ? "bg-[#26a69a]/15 text-[#26a69a] border border-[#26a69a]/30" :
                  item.action.includes('SELL') ? "bg-[#ef5350]/15 text-[#ef5350] border border-[#ef5350]/30" : "bg-white/5 text-white/40 border border-white/5"
                )}>
                  {item.action}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};