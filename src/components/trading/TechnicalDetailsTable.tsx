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
  orderFlowIndicators
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
      
      {/* Tabela 1: Osciladores e Order Flow */}
      <div className="bg-[#0a0b0d] rounded-2xl border border-white/[0.04] p-5 flex flex-col justify-between">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 border-b border-white/[0.04] pb-2">
          Osciladores & Fluxo de Ordens Real
        </h3>
        <div className="space-y-2.5 flex-grow">
          {[...oscillators, ...orderFlowIndicators].map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.02] last:border-0">
              <span className="text-white/60 font-medium">{item.name}</span>
              <div className="flex items-center space-x-3">
                <span className="font-mono text-white/90 text-[11px]">{item.value}</span>
                <span className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider min-w-[70px] text-center",
                  item.action.includes('COMPRA') ? "bg-[#26a69a]/15 text-[#26a69a]" :
                  item.action.includes('VENDA') ? "bg-[#ef5350]/15 text-[#ef5350]" : "bg-white/5 text-white/40"
                )}>
                  {item.action}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela 2: Médias Móveis */}
      <div className="bg-[#0a0b0d] rounded-2xl border border-white/[0.04] p-5 flex flex-col justify-between">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 border-b border-white/[0.04] pb-2">
          Médias Móveis (Tendência Institucional)
        </h3>
        <div className="space-y-2.5 flex-grow">
          {movingAverages.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.02] last:border-0">
              <span className="text-white/60 font-medium">{item.name}</span>
              <div className="flex items-center space-x-3">
                <span className="font-mono text-white/90 text-[11px]">{item.value}</span>
                <span className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider min-w-[70px] text-center",
                  item.action.includes('COMPRA') ? "bg-[#26a69a]/15 text-[#26a69a]" :
                  item.action.includes('VENDA') ? "bg-[#ef5350]/15 text-[#ef5350]" : "bg-white/5 text-white/40"
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