import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface AssetSummaryCardProps {
  data: TwelveDataState;
  precision: number;
}

export const AssetSummaryCard: React.FC<AssetSummaryCardProps> = ({ data, precision }) => {
  const isPositive = data.change >= 0;

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 flex items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
      <div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-black text-amber-400 uppercase tracking-widest">{data.symbol}</span>
          <span className="text-[10px] text-white/30 font-mono">LIVE TWELVEDATA</span>
        </div>
        <div className="flex items-baseline space-x-3 mt-1">
          <span className="text-3xl font-black font-mono tracking-tight text-white">
            ${data.price.toFixed(precision)}
          </span>
          <div className={`flex items-center space-x-1 font-mono text-xs font-bold ${isPositive ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>{isPositive ? '+' : ''}{data.change.toFixed(precision)} ({data.percentChange.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-right text-xs">
        <div>
          <span className="text-[9px] text-white/30 uppercase block">MÁXIMA</span>
          <span className="font-bold text-white/80">${data.high.toFixed(precision)}</span>
        </div>
        <div>
          <span className="text-[9px] text-white/30 uppercase block">MÍNIMA</span>
          <span className="font-bold text-white/80">${data.low.toFixed(precision)}</span>
        </div>
      </div>
    </div>
  );
};