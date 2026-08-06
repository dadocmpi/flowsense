import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface AssetSummaryCardProps {
  data: TwelveDataState;
  precision: number;
}

export const AssetSummaryCard: React.FC<AssetSummaryCardProps> = ({ data, precision }) => {
  const isPositive = data.change >= 0;

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 flex flex-wrap items-center justify-between gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
      <div>
        <div className="flex items-center space-x-3">
          <span className="text-xs font-black text-amber-400 uppercase tracking-widest">{data.symbol}</span>
          <div className="flex items-center space-x-1.5 bg-[#26a69a]/10 border border-[#26a69a]/30 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-ping" />
            <span className="text-[9px] font-mono font-black text-[#26a69a] uppercase tracking-wider">
              REAL-TIME
            </span>
          </div>
          <span className="text-[10px] text-white/40 font-mono flex items-center gap-1">
            <Clock size={10} className="text-white/30" />
            Tick: {data.datetime}
          </span>
        </div>

        <div className="flex items-baseline space-x-4 mt-2">
          <span className="text-4xl font-black font-mono tracking-tight text-white transition-all">
            ${data.price.toFixed(precision)}
          </span>
          <div className={`flex items-center space-x-1 font-mono text-sm font-black px-2.5 py-1 rounded-xl ${
            isPositive ? 'bg-[#26a69a]/15 text-[#26a69a]' : 'bg-[#ef5350]/15 text-[#ef5350]'
          }`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span>{isPositive ? '+' : ''}{data.change.toFixed(precision)} ({data.percentChange.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 font-mono text-right text-xs bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-2xl">
        <div>
          <span className="text-[9px] font-bold text-white/30 uppercase block">24H HIGH</span>
          <span className="font-black text-white/90 text-sm">${data.high.toFixed(precision)}</span>
        </div>
        <div>
          <span className="text-[9px] font-bold text-white/30 uppercase block">24H LOW</span>
          <span className="font-black text-white/90 text-sm">${data.low.toFixed(precision)}</span>
        </div>
      </div>
    </div>
  );
};