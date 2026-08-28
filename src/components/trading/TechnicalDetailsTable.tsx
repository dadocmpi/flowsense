import React from 'react';
import { IndicatorSignal } from '../../types/trading';
import { cn } from '@/lib/utils';

interface TechnicalDetailsTableProps {
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  orderFlowIndicators: IndicatorSignal[];
}

export const TechnicalDetailsTable: React.FC<TechnicalDetailsTableProps> = ({
  oscillators,
  movingAverages,
  orderFlowIndicators,
}) => {
  const allIndicators = [...(oscillators || []), ...(orderFlowIndicators || [])];
  const maIndicators = movingAverages || [];

  return (
    <div className="flex flex-col h-full">
      
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-4">
        <h3 className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
          Technical Details
        </h3>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      </div>

      <div className="flex-grow overflow-y-auto space-y-4">
        
        {/* Oscillators + Flow */}
        {allIndicators.length > 0 && (
          <div>
            <div className="text-[9px] font-black text-blue-400/70 uppercase tracking-widest mb-2">Oscillators & Flow</div>
            <div className="space-y-1.5">
              {allIndicators.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] py-1.5 border-b border-white/[0.02] last:border-0">
                  <span className="text-white/70 font-semibold">{item.name}</span>
                  <div className="flex items-center space-x-3">
                    {item.value && (
                      <span className="font-mono text-white/90 font-bold text-[11px]">{item.value}</span>
                    )}
                    <span className={cn(
                      "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider min-w-[70px] text-center",
                      item.action?.includes('BUY') ? "bg-[#26a69a]/15 text-[#26a69a] border border-[#26a69a]/30" :
                      item.action?.includes('SELL') ? "bg-[#ef5350]/15 text-[#ef5350] border border-[#ef5350]/30" : 
                      "bg-white/5 text-white/40 border border-white/5"
                    )}>
                      {item.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Moving Averages */}
        {maIndicators.length > 0 && (
          <div>
            <div className="text-[9px] font-black text-purple-400/70 uppercase tracking-widest mb-2">Moving Averages</div>
            <div className="space-y-1.5">
              {maIndicators.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] py-1.5 border-b border-white/[0.02] last:border-0">
                  <span className="text-white/70 font-semibold">{item.name}</span>
                  <div className="flex items-center space-x-3">
                    {item.value && (
                      <span className="font-mono text-white/90 font-bold text-[11px]">{item.value}</span>
                    )}
                    <span className={cn(
                      "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider min-w-[70px] text-center",
                      item.action?.includes('BUY') ? "bg-[#26a69a]/15 text-[#26a69a] border border-[#26a69a]/30" :
                      item.action?.includes('SELL') ? "bg-[#ef5350]/15 text-[#ef5350] border border-[#ef5350]/30" : 
                      "bg-white/5 text-white/40 border border-white/5"
                    )}>
                      {item.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {allIndicators.length === 0 && maIndicators.length === 0 && (
          <div className="flex items-center justify-center flex-grow">
            <div className="text-center py-8">
              <div className="text-white/20 text-[10px]">Loading technical data...</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};