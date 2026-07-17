import React from 'react';
import { TradingMetrics } from '../../types/trading';
import { cn } from '@/lib/utils';

interface MetricsGridProps {
  metrics: TradingMetrics;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({ metrics }) => {
  const isBullish = metrics.tendencia.includes('ALTA');

  return (
    <div className="grid grid-cols-2 gap-[1px] bg-white/[0.03] border-b border-white/[0.03]">
      {/* Tendência */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Tendência</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          isBullish ? "text-[#26a69a]" : "text-[#ef5350]"
        )}>
          {metrics.tendencia}
        </span>
      </div>

      {/* Força do Movimento */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Força do Movimento</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          metrics.forca === 'FORTE' ? "text-[#26a69a]" : "text-amber-500"
        )}>
          {metrics.forca}
        </span>
      </div>

      {/* Momento */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Momento</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          metrics.momento === 'ALTISTA' ? "text-[#26a69a]" : "text-[#ef5350]"
        )}>
          {metrics.momento}
        </span>
      </div>

      {/* Confluência */}
      <div className="p-5 bg-[#0d0e12] flex flex-col justify-between">
        <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Confluência</span>
        <span className={cn(
          "text-[11px] font-bold mt-1.5 tracking-wide",
          metrics.confluencia === 'ALTA' ? "text-[#26a69a]" : "text-amber-500"
        )}>
          {metrics.confluencia}
        </span>
      </div>
    </div>
  );
};