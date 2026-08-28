import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { cn } from '@/lib/utils';
import { fmtPrice, fmtDelta, fmtDataQuality } from '@/lib/formatters';

interface RealtimeOrderFlowProps {
  data: TwelveDataState;
  precision: number;
}

export const RealtimeOrderFlow: React.FC<RealtimeOrderFlowProps> = ({ data, precision }) => {
  const isPositive = data.change >= 0;

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-6 shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col gap-5">
      
      {/* Title */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-black text-amber-400 uppercase tracking-[0.25em]">Real-Time Order Flow</span>
          {data.isMarketOpen ? (
            <div className="flex items-center space-x-1.5 bg-[#26a69a]/15 border border-[#26a69a]/30 p-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-ping" />
            </div>
          ) : (
            <span className="text-[9px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
              MARKET CLOSED
            </span>
          )}
        </div>
        <div className="flex items-center space-x-4 text-[10px] font-mono">
          <div>
            <span className="text-white/30">VOL DELTA</span>
            <span className={cn("ml-2 font-black", data.volumeDelta >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]')}>
              {fmtDelta(data.volumeDelta)}
            </span>
          </div>
          <div>
            <span className="text-white/30">INST PRESSURE</span>
            <span className={cn(
              "ml-2 font-black uppercase tracking-wider",
              data.institutionalPressure === 'EXTREME' ? 'text-[#ef5350]' :
              data.institutionalPressure === 'HIGH' ? 'text-amber-400' : 'text-[#26a69a]'
            )}>
              {data.institutionalPressure}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Dominance + Book + Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
        
        {/* Dominance Bar (4 cols) */}
        <div className="lg:col-span-4 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex flex-col justify-between space-y-3">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-[#26a69a] uppercase tracking-wider">BUYERS ({data.buyersPercent}%)</span>
            <span className="text-[#ef5350] uppercase tracking-wider">SELLERS ({data.sellersPercent}%)</span>
          </div>
          <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden flex p-0.5 border border-white/[0.05]">
            <div 
              className="h-full bg-gradient-to-r from-[#26a69a] to-[#4db6ac] rounded-l-full transition-all duration-500 shadow-[0_0_12px_rgba(38,166,154,0.6)]" 
              style={{ width: `${data.buyersPercent}%` }}
            />
            <div 
              className="h-full bg-gradient-to-r from-[#e57373] to-[#ef5350] rounded-r-full transition-all duration-500 shadow-[0_0_12px_rgba(239,83,80,0.6)]" 
              style={{ width: `${data.sellersPercent}%` }}
            />
          </div>
        </div>

        {/* Order Book snapshot (4 cols) */}
        <div className="lg:col-span-4 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl font-mono text-xs">
          <div className="text-[9px] text-white/40 uppercase tracking-widest mb-2 font-sans">Order Book Snapshot</div>
          
          {/* Top asks */}
          <div className="space-y-1 mb-2">
            {data.asks.slice(0, 3).reverse().map((ask, idx) => (
              <div key={`ask-${idx}`} className="grid grid-cols-2 items-center relative py-0.5">
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-[#ef5350]/10 border-l border-[#ef5350]/30" 
                  style={{ width: `${ask.percentage}%` }}
                />
                <span className="text-[#ef5350] font-bold z-10">${fmtPrice(ask.price, precision)}</span>
                <span className="text-right text-white/50 z-10">{ask.cumulativeSize.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Mid price */}
          <div className="py-1.5 border-y border-white/[0.06] text-center">
            <span className="text-amber-400 font-black text-sm">${fmtPrice(data.price, precision)}</span>
          </div>

          {/* Top bids */}
          <div className="space-y-1 mt-2">
            {data.bids.slice(0, 3).map((bid, idx) => (
              <div key={`bid-${idx}`} className="grid grid-cols-2 items-center relative py-0.5">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-[#26a69a]/10 border-r border-[#26a69a]/30" 
                  style={{ width: `${bid.percentage}%` }}
                />
                <span className="text-[#26a69a] font-bold z-10">${fmtPrice(bid.price, precision)}</span>
                <span className="text-right text-white/50 z-10">{bid.cumulativeSize.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Trades (4 cols) */}
        <div className="lg:col-span-4 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl font-mono text-xs">
          <div className="text-[9px] text-white/40 uppercase tracking-widest mb-2 font-sans flex justify-between items-center">
            <span>Recent Trades</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-ping" />
          </div>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {data.recentTrades.slice(0, 10).map((trade) => (
              <div key={trade.id} className="flex items-center justify-between py-0.5 border-b border-white/[0.02] last:border-0">
                <span className="text-white/40 text-[10px]">{trade.time}</span>
                <span className={cn(
                  "font-bold",
                  trade.type === 'BUY' ? 'text-[#26a69a]' : 'text-[#ef5350]'
                )}>
                  ${fmtPrice(trade.price, precision)}
                </span>
                <span className="text-white/50 text-[10px]">{trade.size.toFixed(3)}</span>
              </div>
            ))}
            {data.recentTrades.length === 0 && (
              <div className="text-white/20 text-[10px] text-center py-4">No trades yet</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};