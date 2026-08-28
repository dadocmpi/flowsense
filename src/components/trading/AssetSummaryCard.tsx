import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { fmtPrice, fmtChange, fmtPercent } from '@/lib/formatters';

interface AssetSummaryCardProps {
  data: TwelveDataState;
  precision?: number;
}

export const AssetSummaryCard: React.FC<AssetSummaryCardProps> = ({ data, precision = 2 }) => {
  const isPositive = data.change >= 0;

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-5 flex flex-wrap items-center justify-between gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
      <div>
        <div className="flex items-center space-x-3 mb-1">
          <span className="text-xs font-black text-amber-400 uppercase tracking-widest">{data.symbol}</span>
          {data.isMarketOpen ? (
            <div className="flex items-center space-x-1.5 bg-[#26a69a]/10 border border-[#26a69a]/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />
              <span className="text-[9px] font-bold text-[#26a69a]">OPEN</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[9px] font-bold text-amber-400">WEEKEND CLOSE</span>
            </div>
          )}
          <span className="text-[10px] text-white/40 font-mono flex items-center gap-1">
            <Clock size={10} className="text-white/30" />
            {data.datetime}
          </span>
        </div>

        <div className="flex items-baseline space-x-4">
          <span className="text-4xl font-black font-mono tracking-tight text-white transition-all">
            ${fmtPrice(data.price, precision)}
          </span>
          <div className={`flex items-center space-x-1 font-mono text-sm font-black px-2.5 py-1 rounded-xl ${
            isPositive ? 'bg-[#26a69a]/15 text-[#26a69a]' : 'bg-[#ef5350]/15 text-[#ef5350]'
          }`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span>{fmtChange(data.change, precision)} ({fmtPercent(data.percentChange)})</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 font-mono text-right text-xs bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-2xl">
        <div>
          <span className="text-[9px] font-bold text-white/30 uppercase block">24H High</span>
          <span className="font-black text-white/90 text-sm">${fmtPrice(data.high, precision)}</span>
        </div>
        <div>
          <span className="text-[9px] font-bold text-white/30 uppercase block">24H Low</span>
          <span className="font-black text-white/90 text-sm">${fmtPrice(data.low, precision)}</span>
        </div>
      </div>
    </div>
  );
};