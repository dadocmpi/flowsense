import React from 'react';
import { TradingMetrics } from '../../types/trading';
import { cn } from '@/lib/utils';

interface MetricsGridProps {
  metrics: TradingMetrics;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({ metrics }) => {
  const isBullish = metrics.tendencia.includes('BULL') || metrics.momento.includes('BULL');

  return (
    <div className="grid grid-cols-2 gap-[1px] bg-white/[0.03] border-b border-white/[0.03]">
      {/* Trend */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Trend</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          isBullish ? "text-[#26a69a]" : "text-[#ef5350]"
        )}>
          {metrics.tendencia}
        </span>
      </div>

      {/* Momentum Strength */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Momentum Strength</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          metrics.forca === 'STRONG' ? "text-[#26a69a]" : "text-amber-500"
        )}>
          {metrics.forca}
        </span>
      </div>

      {/* Momentum */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Momentum</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          metrics.momento === 'BULLISH' ? "text-[#26a69a]" : "text-[#ef5350]"
        )}>
          {metrics.momento}
        </span>
      </div>

      {/* Confluence */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Confluence</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          metrics.confluencia === 'HIGH' ? "text-[#26a69a]" : "text-amber-500"
        )}>
          {metrics.confluencia}
        </span>
      </div>
    </div>
  );
};