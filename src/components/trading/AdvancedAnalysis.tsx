import React from 'react';
import { TradingMetrics } from '../../types/trading';
import { cn } from '@/lib/utils';
import { Shield, TrendingUp, Activity, Layers } from 'lucide-react';

interface AdvancedAnalysisProps {
  metrics: TradingMetrics;
  asset: string;
}

export const AdvancedAnalysis: React.FC<AdvancedAnalysisProps> = ({ metrics, asset }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
      {/* Painel de Indicadores Técnicos */}
      <div className="bg-[#0d0e12] p-5 rounded-2xl border border-white/[0.03] flex flex-col justify-between">
        <div className="flex items-center space-x-2 mb-4">
          <Activity size={14} className="text-amber-500" />
          <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Indicadores Técnicos</h4>
        </div>

        <div className="space-y-3 flex-grow flex flex-col justify-center">
          {metrics.indicators.map((ind, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-white/[0.02] last:border-0">
              <span className="text-xs text-white/60 font-medium">{ind.name}</span>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono text-white/80">{ind.value}</span>
                <span className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                  ind.status.includes('COMPRA') ? "bg-[#26a69a]/10 text-[#26a69a]" :
                  ind.status.includes('VENDA') ? "bg-[#ef5350]/10 text-[#ef5350]" : "bg-white/5 text-white/40"
                )}>
                  {ind.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Painel de Zonas de Suporte e Resistência */}
      <div className="bg-[#0d0e12] p-5 rounded-2xl border border-white/[0.03] flex flex-col justify-between">
        <div className="flex items-center space-x-2 mb-4">
          <Layers size={14} className="text-amber-500" />
          <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Zonas de Liquidez (S/R)</h4>
        </div>

        <div className="space-y-3 flex-grow flex flex-col justify-center">
          {metrics.zones.map((zone, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-white/[0.02] last:border-0">
              <div className="flex items-center space-x-2">
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded",
                  zone.type === 'RESISTÊNCIA' ? "bg-[#ef5350]/10 text-[#ef5350]" : "bg-[#26a69a]/10 text-[#26a69a]"
                )}>
                  {zone.type}
                </span>
                <span className="text-xs font-mono text-white/80">
                  {asset.includes('OIL') ? zone.price.toFixed(2) : zone.price.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <span className="text-[8px] text-white/30 block uppercase">Força</span>
                  <span className="text-[10px] font-bold text-white/70">{zone.strength}</span>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-white/30 block uppercase">Testes</span>
                  <span className="text-[10px] font-mono font-bold text-amber-500">{zone.tested}x</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};