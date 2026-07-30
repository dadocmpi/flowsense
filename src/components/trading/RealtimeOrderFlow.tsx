import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { cn } from '@/lib/utils';

interface RealtimeOrderFlowProps {
  data: TwelveDataState;
  precision: number;
}

export const RealtimeOrderFlow: React.FC<RealtimeOrderFlowProps> = ({ data, precision }) => {
  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.08] p-7 shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col space-y-6 backdrop-blur-2xl">
      
      {/* Título do Painel de Order Flow */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] pb-4 gap-2">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-black text-amber-400 uppercase tracking-[0.25em]">ORDER FLOW INSTITUCIONAL (LIVE)</span>
          <div className="flex items-center space-x-1.5 bg-[#26a69a]/15 border border-[#26a69a]/30 px-2.5 py-0.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-ping" />
            <span className="text-[9px] font-mono font-black text-[#26a69a] uppercase tracking-wider">
              TICK BY TICK
            </span>
          </div>
        </div>
        <span className="text-[10px] text-white/40 font-mono">
          Alimentado por TwelveData Feed • {data.symbol}
        </span>
      </div>

      {/* Grid Superior: Dominância & Métrica de Delta */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Barra de Dominância Compradores vs Vendedores */}
        <div className="md:col-span-2 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex flex-col justify-between space-y-3">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-[#26a69a] uppercase tracking-wider">COMPRADORES ({data.buyersPercent}%)</span>
            <span className="text-[#ef5350] uppercase tracking-wider">VENDEDORES ({data.sellersPercent}%)</span>
          </div>
          
          {/* Visual Bar */}
          <div className="w-full h-3.5 bg-white/5 rounded-full overflow-hidden flex p-0.5 border border-white/[0.05]">
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

        {/* Delta de Volume Instantâneo */}
        <div className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">DELTA DE VOLUME</span>
          <span className={cn(
            "text-2xl font-mono font-black mt-1 block",
            data.volumeDelta >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"
          )}>
            {data.volumeDelta >= 0 ? '+' : ''}{data.volumeDelta.toLocaleString()}
          </span>
        </div>

        {/* Taxa de Absorção */}
        <div className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">PRESSÃO INSTITUCIONAL</span>
          <span className="text-2xl font-black text-amber-400 mt-1 block tracking-wider">
            {data.institutionalPressure}
          </span>
        </div>

      </div>

      {/* Grid Inferior: Fita de Negócios (Time & Trades) + Profundidade do Livro */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        
        {/* Fita de Negócios ao Vivo (Time & Trades) (6/12 cols) */}
        <div className="lg:col-span-6 bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl flex flex-col font-mono text-xs">
          <div className="flex justify-between items-center border-b border-white/[0.06] pb-2 mb-3">
            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest font-sans">
              TIME & TRADES (FITA AO VIVO)
            </span>
            <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-ping" />
          </div>

          <div className="grid grid-cols-3 text-[9px] text-white/30 uppercase tracking-wider mb-2">
            <span>Horário</span>
            <span className="text-center">Preço ($)</span>
            <span className="text-right">Tamanho</span>
          </div>

          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {data.recentTrades.map((item) => (
              <div key={item.id} className="grid grid-cols-3 items-center py-1 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02]">
                <span className="text-white/40 text-[10px]">{item.time}</span>
                <span className={cn(
                  "text-center font-bold",
                  item.type === 'BUY' ? "text-[#26a69a]" : "text-[#ef5350]"
                )}>
                  ${item.price.toFixed(precision)}
                </span>
                <span className="text-right text-white/80 font-bold">{item.size} oz/lotes</span>
              </div>
            ))}
          </div>
        </div>

        {/* Livro de Ofertas / Profundidade (6/12 cols) */}
        <div className="lg:col-span-6 bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl flex flex-col font-mono text-xs">
          <div className="flex justify-between items-center border-b border-white/[0.06] pb-2 mb-3">
            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest font-sans">
              LIVRO DE OFERTAS (DEPTH)
            </span>
            <span className="text-[9px] text-amber-400 font-bold font-sans">SENSITIVO</span>
          </div>

          {/* Asks (Vendas - Vermelho) */}
          <div className="space-y-1 mb-2">
            {data.asks.slice(0, 3).reverse().map((ask, idx) => (
              <div key={`ask-${idx}`} className="grid grid-cols-3 items-center relative py-1 px-1">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-[#ef5350]/15 border-r border-[#ef5350]/40 rounded-sm pointer-events-none" 
                  style={{ width: `${ask.percentage}%` }}
                />
                <span className="text-[#ef5350] font-bold z-10">${ask.price.toFixed(precision)}</span>
                <span className="text-center text-white/60 z-10">{ask.size}</span>
                <span className="text-right text-white/30 text-[10px] z-10">ASK</span>
              </div>
            ))}
          </div>

          {/* Preço Atual Destacado */}
          <div className="py-2 border-y border-white/[0.08] bg-white/[0.03] my-1 text-center font-bold text-sm text-white flex items-center justify-between px-3">
            <span className="text-[10px] text-white/40 font-sans uppercase tracking-wider">PREÇO DO MERCADO</span>
            <span className="text-amber-400 font-mono text-base font-black animate-pulse">${data.price.toFixed(precision)}</span>
          </div>

          {/* Bids (Compras - Verde) */}
          <div className="space-y-1 mt-2">
            {data.bids.slice(0, 3).map((bid, idx) => (
              <div key={`bid-${idx}`} className="grid grid-cols-3 items-center relative py-1 px-1">
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-[#26a69a]/15 border-l border-[#26a69a]/40 rounded-sm pointer-events-none" 
                  style={{ width: `${bid.percentage}%` }}
                />
                <span className="text-[#26a69a] font-bold z-10">${bid.price.toFixed(precision)}</span>
                <span className="text-center text-white/60 z-10">{bid.size}</span>
                <span className="text-right text-white/30 text-[10px] z-10">BID</span>
              </div>
            ))}
          </div>

        </div>

      </div>

    </div>
  );
};