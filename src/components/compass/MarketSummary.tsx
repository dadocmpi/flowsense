import React from 'react';
import { CompassDirection } from '../../lib/compassEngine';
import { cn } from '@/lib/utils';

interface MarketSummaryProps {
  marketRegime: string;
  dataQuality: number;
  dataLabel: 'LIVE' | 'DELAYED' | 'CACHED' | 'SIMULATED' | 'UNAVAILABLE';
  factorAgreement: number;
  availableFactors: number;
  totalFactors: number;
  price: number;
  timestamp: number;
}

export const MarketSummary: React.FC<MarketSummaryProps> = ({
  marketRegime,
  dataQuality,
  dataLabel,
  factorAgreement,
  availableFactors,
  totalFactors,
  price,
  timestamp,
}) => {
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dataLabelText = dataLabel.toUpperCase();
  const dataLabelColor = {
    LIVE: 'text-green-400',
    DELAYED: 'text-amber-400',
    CACHED: 'text-blue-400',
    SIMULATED: 'text-purple-400',
    UNAVAILABLE: 'text-red-500',
  }[dataLabel] || 'text-white';

  const regimeColor = {
    TRENDING: 'text-green-400',
    RANGING: 'text-amber-400',
    HIGH_VOLATILITY: 'text-red-500',
    LOW_VOLATILITY: 'text-blue-400',
    BREAKOUT: 'text-purple-400',
    EXHAUSTION: 'text-orange-400',
  }[marketRegime as keyof typeof regimeColor] || 'text-white';

  return (
    <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] p-6">
      <div className="space-y-4">
        <h3 className="text-white font-bold mb-3 flex items-center">
          <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
          Market Summary
        </h3>

        <div className="grid grid-cols-2 gap-4 text-sm font-mono">
          <div>
            <span className="text-white/50">Price:</span>
            <span className="font-mono text-white">{price.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-white/50">Time:</span>
            <span className="font-mono text-white">{time}</span>
          </div>
          <div>
            <span className="text-white/50">Regime:</span>
            <span className={cn("font-mono font-bold", regimeColor)}>{marketRegime}</span>
          </div>
          <div>
            <span className="text-white/50">Data:</span>
            <span className={dataLabelColor}>{dataLabelText}</span>
          </div>
          <div>
            <span className="text-white/50">Quality:</span>
            <span className={cn("font-mono font-bold", dataQuality >= 80 ? "text-green-400" : dataQuality >= 60 ? "text-amber-400" : "text-red-500")}>
              {dataQuality}%
            </span>
          </div>
          <div>
            <span className="text-white/50">Agreement:</span>
            <span className={cn("font-mono font-bold", factorAgreement >= 70 ? "text-green-400" : factorAgreement >= 50 ? "text-amber-400" : "text-red-500")}>
              {factorAgreement}%
            </span>
          </div>
          <div>
            <span className="text-white/50">Factors:</span>
            <span className="font-mono text-white">{availableFactors}/{totalFactors}</span>
          </div>
        </div>
      </div>
    </div>
  );
};