import React from 'react';
import { TradeData } from '../../hooks/useBinanceFeed';
import { fmtPrice } from '@/lib/formatters';

interface LiveTradeFeedProps {
  trades: TradeData[];
  precision: number;
}

export const LiveTradeFeed: React.FC<LiveTradeFeedProps> = ({ trades, precision }) => {
  return (
    <div className="bg-[#0a0b0d] rounded-2xl border border-white/[0.04] p-4 flex flex-col h-full font-mono text-[11px]">
      <div className="border-b border-white/[0.04] pb-2 mb-2 flex justify-between items-center font-sans">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Settled Trades (Tape)</h3>
        <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-ping" />
      </div>

      <div className="grid grid-cols-3 text-[9px] text-white/30 uppercase tracking-wider mb-2 px-1">
        <span>Time</span>
        <span className="text-center">Price</span>
        <span className="text-right">Size</span>
      </div>

      <div className="space-y-0.5 overflow-y-auto flex-grow pr-1">
        {trades.map((trade) => (
          <div key={trade.id} className="grid grid-cols-3 items-center py-1 px-1 rounded hover:bg-white/[0.02] transition-colors">
            <span className="text-white/40 text-[10px]">{trade.time}</span>
            <span className={`text-center font-bold ${trade.isBuyerMaker ? 'text-[#ef5350]' : 'text-[#26a69a]'}`}>
              {fmtPrice(trade.price, precision)}
            </span>
            <span className="text-right text-white/60 text-[10px]">{trade.size.toFixed(4)}</span>
          </div>
        ))}
        {trades.length === 0 && (
          <div className="flex items-center justify-center flex-grow py-8">
            <span className="text-white/20 text-[10px]">No trades yet</span>
          </div>
        )}
      </div>
    </div>
  );
};