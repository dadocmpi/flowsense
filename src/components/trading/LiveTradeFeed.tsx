import React from 'react';
import { LiveTrade } from '../../types/trading';

interface LiveTradeFeedProps {
  trades: LiveTrade[];
  precision: number;
}

export const LiveTradeFeed: React.FC<LiveTradeFeedProps> = ({ trades, precision }) => {
  return (
    <div className="bg-[#0a0b0d] rounded-2xl border border-white/[0.04] p-4 flex flex-col h-full font-mono text-[11px]">
      <div className="border-b border-white/[0.04] pb-2 mb-2 flex justify-between items-center font-sans">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Negócios ao Vivo (Time & Trades)</h3>
        <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-ping" />
      </div>

      <div className="grid grid-cols-3 text-[9px] text-white/30 uppercase tracking-wider mb-2 px-1">
        <span>Horário</span>
        <span className="text-center">Preço</span>
        <span className="text-right">Quantidade</span>
      </div>

      <div className="space-y-1 overflow-y-auto max-h-[220px] pr-1">
        {trades.map((trade) => (
          <div key={trade.id} className="grid grid-cols-3 items-center py-0.5 px-1 hover:bg-white/[0.02] rounded">
            <span className="text-white/40 text-[10px]">{trade.time}</span>
            <span className={`text-center font-bold ${trade.isBuyerMaker ? 'text-[#ef5350]' : 'text-[#26a69a]'}`}>
              {trade.price.toFixed(precision)}
            </span>
            <span className="text-right text-white/70 text-[10px]">{trade.size.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};