import React from 'react';

interface RealOrderBookProps {
  bids: { price: number; size: number; total: number; percentage: number }[];
  asks: { price: number; size: number; total: number; percentage: number }[];
  currentPrice: number;
  precision: number;
}

export const RealOrderBook: React.FC<RealOrderBookProps> = ({ bids, asks, currentPrice, precision }) => {
  return (
    <div className="bg-[#0a0b0d] rounded-2xl border border-white/[0.04] p-4 flex flex-col h-full font-mono text-[11px]">
      <div className="border-b border-white/[0.04] pb-2 mb-2 flex justify-between items-center font-sans">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Order Book (Depth)</h3>
        <span className="text-[9px] text-[#26a69a] font-mono">REAL-TIME</span>
      </div>

      <div className="grid grid-cols-3 text-[9px] text-white/30 uppercase tracking-wider mb-2 px-1">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Total ($)</span>
      </div>

      {/* Asks (sellers - red) */}
      <div className="space-y-[2px] mb-2 flex flex-col justify-end">
        {asks.slice(0, 6).reverse().map((ask, idx) => (
          <div key={`ask-${idx}`} className="grid grid-cols-3 items-center relative py-0.5 px-1 hover:bg-white/[0.02]">
            <div 
              className="absolute right-0 top-0 bottom-0 bg-[#ef5350]/10 border-r border-[#ef5350]/30 rounded-[1px] pointer-events-none" 
              style={{ width: `${ask.percentage}%` }}
            />
            <span className="text-[#ef5350] font-bold z-10">{ask.price.toFixed(precision)}</span>
            <span className="text-right text-white/60 z-10">{ask.size.toFixed(3)}</span>
            <span className="text-right text-white/40 z-10">{ask.total.toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* Current Price */}
      <div className="py-2 border-y border-white/[0.05] bg-white/[0.01] my-1 text-center font-bold text-sm text-white flex items-center justify-between px-2">
        <span className="text-[10px] text-white/40 font-sans">Market Price</span>
        <span className="text-amber-400 font-mono text-base font-black">{currentPrice.toFixed(precision)}</span>
      </div>

      {/* Bids (buyers - green) */}
      <div className="space-y-[2px] mt-2">
        {bids.slice(0, 6).map((bid, idx) => (
          <div key={`bid-${idx}`} className="grid grid-cols-3 items-center relative py-0.5 px-1 hover:bg-white/[0.02]">
            <div 
              className="absolute left-0 top-0 bottom-0 bg-[#26a69a]/10 border-l border-[#26a69a]/30 rounded-[1px] pointer-events-none" 
              style={{ width: `${bid.percentage}%` }}
            />
            <span className="text-[#26a69a] font-bold z-10">{bid.price.toFixed(precision)}</span>
            <span className="text-right text-white/60 z-10">{bid.size.toFixed(3)}</span>
            <span className="text-right text-white/40 z-10">{bid.total.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};