import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { cn } from '@/lib/utils';

interface RealtimeOrderFlowProps {
  data: TwelveDataState & { isLoading?: boolean };
  precision: number;
}

export const RealtimeOrderFlow: React.FC<RealtimeOrderFlowProps> = ({ data, precision }) => {
  if (data.isLoading || !data.recentTrades?.length) {
    return (
      <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col space-y-6">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 gap-2">
          <div className="h-4 w-48 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-20 bg-white/5 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-16 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {[1,2].map(i => (
            <div key={i} className="lg:col-span-6 h-48 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const buyersPct = Math.max(0, Math.min(100, data.buyersPercent || 50));
  const sellersPct = 100 - buyersPct;

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col space-y-6 backdrop-blur-2xl">
      
      {/* Title Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] pb-4 gap-2">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-black text-amber-400 uppercase tracking-[0.25em]">INSTITUTIONAL ORDER FLOW</span>
          {data.isLive ? (
            <div className="flex items-center space-x-1.5 bg-[#26a69a]/15 border border-[#26a69a]/30 p-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-ping" />
            </div>
          ) : (
            <span className="text-[9px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
              RECONNECTING
            </span>
          )}
        </div>
      </div>

      {/* Top Grid: Dominance & Delta */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Dominance Bar */}
        <div className="md:col-span-2 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex flex-col justify-between space-y-3">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-[#26a69a] uppercase tracking-wider">BUYERS ({buyersPct}%)</span>
            <span className="text-[#ef5350] uppercase tracking-wider">SELLERS ({sellersPct}%)</span>
          </div>
          
          <div className="w-full h-3.5 bg-white/5 rounded-full overflow-hidden flex p-0.5 border border-white/[0.05]">
            <div 
              className="h-full bg-gradient-to-r from-[#26a69a] to-[#4db6ac] rounded-l-full transition-all duration-500 shadow-[0_0_12px_rgba(38,166,154,0.6)]" 
              style={{ width: `${buyersPct}%` }}
            />
            <div 
              className="h-full bg-gradient-to-r from-[#e57373] to-[#ef5350] rounded-r-full transition-all duration-500 shadow-[0_0_12px_rgba(239,83,80,0.6)]" 
              style={{ width: `${sellersPct}%` }}
            />
          </div>
        </div>

        {/* Volume Delta */}
        <div className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">VOLUME DELTA</span>
          <span className={cn(
            "text-2xl font-mono font-black mt-1 block",
            data.volumeDelta >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"
          )}>
            {data.volumeDelta >= 0 ? '+' : ''}{(data.volumeDelta || 0).toLocaleString()}
          </span>
        </div>

        {/* Institutional Pressure */}
        <div className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">INSTITUTIONAL PRESSURE</span>
          <span className="text-2xl font-black text-amber-400 mt-1 block tracking-wider">
            {data.institutionalPressure || 'LOW'}
          </span>
        </div>

      </div>

      {/* Bottom Grid: Time & Trades + Depth */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        
        {/* Settled Trades */}
        <div className="lg:col-span-6 bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl flex flex-col font-mono text-xs">
          <div className="flex justify-between items-center border-b border-white/[0.06] pb-2 mb-3">
            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest font-sans">
              SETTLED TRADES
            </span>
            {data.isLive && <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-ping" />}
          </div>

          <div className="grid grid-cols-3 text-[9px] text-white/30 uppercase tracking-wider mb-2">
            <span>TIME</span>
            <span className="text-center">PRICE ($)</span>
            <span className="text-right">SIZE</span>
          </div>

          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {(data.recentTrades || []).slice(0, 15).map((item) => (
              <div key={item.id} className="grid grid-cols-3 items-center py-1 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02]">
                <span className="text-white/40 text-[10px]">{item.time}</span>
                <span className={cn(
                  "text-center font-bold",
                  item.type === 'BUY' ? "text-[#26a69a]" : "text-[#ef5350]"
                )}>
                  ${item.price.toFixed(precision)}
                </span>
                <span className="text-right text-white/80 font-bold">{item.size}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Order Book Depth */}
        <div className="lg:col-span-6 bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl flex flex-col font-mono text-xs">
          <div className="flex justify-between items-center border-b border-white/[0.06] pb-2 mb-3">
            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest font-sans">
              ORDER BOOK (DEPTH)
            </span>
            <span className="text-[9px] text-amber-400 font-bold font-sans">LIVE</span>
          </div>

          {/* Asks */}
          <div className="space-y-1 mb-2">
            {(data.asks || []).slice(0, 3).reverse().map((ask, idx) => (
              <div key={`ask-${idx}`} className="grid grid-cols-3 items-center relative py-1 px-1">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-[#ef5350]/15 border-r border-[#ef5350]/40 rounded-sm pointer-events-none" 
                  style={{ width: `${Math.max(1, ask.percentage || 0)}%` }}
                />
                <span className="text-[#ef5350] font-bold z-10">${ask.price.toFixed(precision)}</span>
                <span className="text-center text-white/60 z-10">{ask.size}</span>
                <span className="text-right text-white/30 text-[10px] z-10">ASK</span>
              </div>
            ))}
          </div>

          {/* Current Price */}
          <div className="py-2 border-y border-white/[0.08] bg-white/[0.03] my-1 text-center font-bold text-sm text-white flex items-center justify-between px-3">
            <span className="text-[10px] text-white/40 font-sans uppercase tracking-wider">SETTLED PRICE</span>
            <span className="text-amber-400 font-mono text-base font-black">${data.price.toFixed(precision)}</span>
          </div>

          {/* Bids */}
          <div className="space-y-1 mt-2">
            {(data.bids || []).slice(0, 3).map((bid, idx) => (
              <div key={`bid-${idx}`} className="grid grid-cols-3 items-center relative py-1 px-1">
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-[#26a69a]/15 border-l border-[#26a69a]/40 rounded-sm pointer-events-none" 
                  style={{ width: `${Math.max(1, bid.percentage || 0)}%` }}
                />
                <span className="text-[#26a69a] font-bold z-10">${bid.price.toFixed(precision)}</span>
                <span className="text-center text-white/60 z-10">{bid.size}</span>
                <span className="text-right text-white/30 text-[10px] z-10">BID</span>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Footer Metrics */}
      <div className="grid grid-cols-2 border-t border-white/[0.03] bg-black/40">
        <div className="p-4 border-r border-white/[0.03]">
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Delta</span>
          <span className={cn(
            "text-xs font-mono font-bold block mt-1",
            data.volumeDelta >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"
          )}>
            {data.volumeDelta >= 0 ? '+' : ''}{(data.volumeDelta || 0).toLocaleString()}
          </span>
        </div>
        <div className="p-4">
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Absorption</span>
          <span className="text-xs font-bold text-amber-500 block mt-1 uppercase tracking-wider">
            {data.institutionalPressure || 'LOW'}
          </span>
        </div>
      </div>
    </div>
  );
};