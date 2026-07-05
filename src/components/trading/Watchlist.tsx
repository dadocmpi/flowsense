import React, { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Asset } from '../../types/trading';
import { cn } from '@/lib/utils';

const ASSETS: Asset[] = [
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', price: 1.08542, change: -0.12, trend: 'down', category: 'FOREX' },
  { symbol: 'GBP/USD', name: 'British Pound', price: 1.26431, change: 0.05, trend: 'up', category: 'FOREX' },
  { symbol: 'USD/JPY', name: 'US Dollar / Yen', price: 149.82, change: 0.24, trend: 'up', category: 'FOREX' },
  { symbol: 'USD/CHF', name: 'US Dollar / Franc', price: 0.8812, change: -0.08, trend: 'down', category: 'FOREX' },
  { symbol: 'AUD/USD', name: 'Aussie / Dollar', price: 0.6542, change: -0.15, trend: 'down', category: 'FOREX' },
  { symbol: 'USD/CAD', name: 'Dollar / Loonie', price: 1.3512, change: 0.11, trend: 'up', category: 'FOREX' },
  { symbol: 'US500', name: 'S&P 500', price: 5024.2, change: 0.45, trend: 'up', category: 'INDICES' },
  { symbol: 'NASDAQ 100', name: 'Nasdaq 100', price: 17852.5, change: 0.82, trend: 'up', category: 'INDICES' },
  { symbol: 'DOW JONES', name: 'Dow 30', price: 38621.0, change: 0.12, trend: 'up', category: 'INDICES' },
  { symbol: 'DAX 40', name: 'German DAX', price: 17118.4, change: -0.05, trend: 'neutral', category: 'INDICES' },
  { symbol: 'XAU/USD', name: 'Gold', price: 2018.45, change: -0.32, trend: 'down', category: 'COMMODITIES' },
  { symbol: 'WTI', name: 'Crude Oil', price: 78.24, change: 1.24, trend: 'up', category: 'COMMODITIES' },
];

interface WatchlistProps {
  selectedAsset: string;
  onSelect: (symbol: string) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({ selectedAsset, onSelect }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const categories = ['FOREX', 'INDICES', 'COMMODITIES'] as const;

  return (
    <div className="flex flex-col h-full bg-[#0d0f14] border-r border-white/5 overflow-y-auto select-none">
      <div className="p-4 border-b border-white/5">
        <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">Watchlist</h2>
      </div>
      
      {categories.map(cat => (
        <div key={cat} className="flex flex-col">
          <button 
            onClick={() => toggleSection(cat)}
            className="flex items-center px-4 py-2 bg-white/[0.02] hover:bg-white/[0.04] transition-colors border-b border-white/5"
          >
            {collapsed[cat] ? <ChevronRight size={14} className="text-white/40 mr-2" /> : <ChevronDown size={14} className="text-white/40 mr-2" />}
            <span className="text-[10px] font-bold text-white/60 tracking-wider">{cat}</span>
          </button>
          
          {!collapsed[cat] && (
            <div className="flex flex-col">
              {ASSETS.filter(a => a.category === cat).map(asset => (
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
                    <span className="text-[9px] text-white/40 truncate w-24">{asset.name}</span>
                  </div>
                  
                  <div className="flex flex-col items-end font-mono">
                    <span className="text-xs text-white">{asset.price.toLocaleString()}</span>
                    <div className={cn(
                      "flex items-center text-[10px]",
                      asset.change > 0 ? "text-[#26a69a]" : asset.change < 0 ? "text-[#ef5350]" : "text-white/40"
                    )}>
                      {asset.trend === 'up' && <TrendingUp size={10} className="mr-1" />}
                      {asset.trend === 'down' && <TrendingDown size={10} className="mr-1" />}
                      {asset.trend === 'neutral' && <Minus size={10} className="mr-1" />}
                      {asset.change > 0 ? '+' : ''}{asset.change}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};