import React, { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Asset } from '../../types/trading';
import { cn } from '@/lib/utils';

const ASSETS: Asset[] = [
  { symbol: 'BTC/USDT', name: 'Bitcoin', price: 65432.1, change: 1.24, trend: 'up', category: 'CRYPTO' },
  { symbol: 'ETH/USDT', name: 'Ethereum', price: 3452.1, change: 0.85, trend: 'up', category: 'CRYPTO' },
  { symbol: 'EUR/USD', name: 'Euro / Dollar', price: 1.08542, change: -0.12, trend: 'down', category: 'FOREX' },
  { symbol: 'XAU/USD', name: 'Gold', price: 2018.45, change: -0.32, trend: 'down', category: 'COMMODITIES' },
];

interface WatchlistProps {
  selectedAsset: string;
  onSelect: (symbol: string) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({ selectedAsset, onSelect }) => {
  return (
    <div className="flex flex-col h-full bg-black overflow-y-auto select-none">
      <div className="p-4 border-b border-white/5">
        <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">Watchlist</h2>
      </div>
      
      <div className="flex flex-col">
        {ASSETS.map(asset => (
          <div 
            key={asset.symbol}
            onClick={() => onSelect(asset.symbol)}
            className={cn(
              "flex items-center justify-between px-4 py-3 cursor-pointer transition-all border-b border-white/[0.02]",
              selectedAsset === asset.symbol ? "bg-white/[0.08] border-l-2 border-l-white" : "hover:bg-white/[0.03]"
            )}
          >
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">{asset.symbol}</span>
              <span className="text-[9px] text-white/40">{asset.name}</span>
            </div>
            <div className="flex flex-col items-end font-mono">
              <span className="text-xs text-white">{asset.price.toLocaleString()}</span>
              <span className={cn("text-[10px]", asset.change > 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
                {asset.change > 0 ? '+' : ''}{asset.change}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};