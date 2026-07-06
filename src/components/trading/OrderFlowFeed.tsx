import React from 'react';
import { OrderFlowRow } from '../../types/trading';
import { cn } from '@/lib/utils';

interface OrderFlowFeedProps {
  data: OrderFlowRow[];
}

export const OrderFlowFeed: React.FC<OrderFlowFeedProps> = ({ data }) => {
  return (
    <div className="flex flex-col h-1/2 bg-black overflow-hidden">
      <div className="p-4 border-b border-white/5 flex justify-between items-center">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Order Flow Real-Time</h3>
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 bg-[#26a69a] rounded-full animate-pulse" />
          <span className="text-[9px] text-white/40 font-mono uppercase">Binance Live</span>
        </div>
      </div>
      <div className="flex-grow overflow-y-auto font-mono text-[10px]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-black text-white/30 uppercase text-[8px] border-b border-white/5">
            <tr>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Delta</th>
              <th className="px-4 py-2">Imbalance</th>
              <th className="px-4 py-2">Absorp.</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                <td className="px-4 py-1.5 text-white/40">{row.time}</td>
                <td className={cn("px-4 py-1.5 font-bold", row.delta > 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
                  {row.delta > 0 ? '+' : ''}{row.delta}
                </td>
                <td className="px-4 py-1.5">
                  {row.imbalance !== 'None' ? (
                    <span className={cn("px-1 rounded-[2px]", row.imbalance === 'Buy' ? "bg-[#26a69a]/20 text-[#26a69a]" : "bg-[#ef5350]/20 text-[#ef5350]")}>
                      {row.imbalance.toUpperCase()}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-1.5">
                  {row.absorption === 'High' ? <span className="text-amber-500 font-bold">HIGH</span> : <span className="text-white/20">LOW</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};