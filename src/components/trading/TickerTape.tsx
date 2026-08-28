import React from 'react';
import { SUPPORTED_SYMBOLS } from '../../types/trading';

interface TickerTapeProps {
  selectedSymbol: string;
  onSelectSymbol: (sym: string) => void;
  currentPrice: number;
  priceChange24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export const TickerTape: React.FC<TickerTapeProps> = ({
  selectedSymbol,
  onSelectSymbol,
  currentPrice,
  priceChange24h,
  high24h,
  low24h,
  volume24h
}) => {
  return (
    <div className="bg-[#07080a] border-b border-white/[0.04] px-6 py-2.5 flex flex-wrap items-center justify-between text-xs font-mono">
      {/* Asset Selectors */}
      <div className="flex items-center space-x-2">
        <span className="text-[9px] text-white/30 font-sans uppercase font-bold tracking-widest mr-2">Assets:</span>
        {SUPPORTED_SYMBOLS.map(item => (
          <button
            key={item.symbol}
            onClick={() => onSelectSymbol(item.symbol)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              selectedSymbol === item.symbol
                ? 'bg-amber-500 text-black shadow-md'
                : 'bg-white/[0.02] text-white/60 hover:text-white border border-white/[0.04]'
            }`}
          >
            {item.symbol}
          </button>
        ))}
      </div>

      {/* 24h Stats in Real Time */}
      <div className="flex items-center space-x-6 text-[11px]">
        <div>
          <span className="text-white/30 text-[9px] block">24H CHG%</span>
          <span className={`font-bold ${priceChange24h >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
          </span>
        </div>
        <div>
          <span className="text-white/30 text-[9px] block">24H HIGH</span>
          <span className="text-white/80 font-bold">{high24h > 0 ? high24h.toFixed(2) : '--'}</span>
        </div>
        <div>
          <span className="text-white/30 text-[9px] block">24H LOW</span>
          <span className="text-white/80 font-bold">{low24h > 0 ? low24h.toFixed(2) : '--'}</span>
        </div>
        <div>
          <span className="text-white/30 text-[9px] block">VOLUME 24H</span>
          <span className="text-white/80 font-bold">{volume24h > 0 ? volume24h.toFixed(0) : '--'}</span>
        </div>
      </div>
    </div>
  );
};