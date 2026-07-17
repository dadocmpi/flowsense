import React from 'react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Coins, TrendingUp } from 'lucide-react';

interface AssetSelectorProps {
  selectedAsset: string;
  onSelect: (symbol: string) => void;
}

const ASSETS = [
  { symbol: 'XAU/USD', name: 'Gold (Ouro)', category: 'COMMODITIES' },
  { symbol: 'BTC/USDT', name: 'Bitcoin', category: 'CRYPTO' },
  { symbol: 'ETH/USDT', name: 'Ethereum', category: 'CRYPTO' },
  { symbol: 'EUR/USD', name: 'Euro / Dollar', category: 'FOREX' },
];

export const AssetSelector: React.FC<AssetSelectorProps> = ({ selectedAsset, onSelect }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] transition-all outline-none">
        <span className="text-xs font-bold text-white tracking-wider">{selectedAsset}</span>
        <ChevronDown size={12} className="text-white/40" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-[#0d0e12] border border-white/[0.08] text-white min-w-[180px] p-1 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        {ASSETS.map((asset) => (
          <DropdownMenuItem
            key={asset.symbol}
            onClick={() => onSelect(asset.symbol)}
            className="flex flex-col items-start px-3 py-2 rounded-lg cursor-pointer hover:bg-white/[0.05] focus:bg-white/[0.05] transition-colors"
          >
            <span className="text-xs font-bold text-white">{asset.symbol}</span>
            <span className="text-[9px] text-white/40 mt-0.5">{asset.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};