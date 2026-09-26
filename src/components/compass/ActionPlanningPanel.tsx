import React from 'react';
import { CompassDirection } from '../../lib/compassEngine';
import { cn } from '@/lib/utils';

interface ActionPlanningPanelProps {
  direction: CompassDirection;
  price: number;
  confidence: number;
  marketRegime: string;
  dataQuality: number;
}

export const ActionPlanningPanel: React.FC<ActionPlanningPanelProps> = ({
  direction,
  price,
  confidence,
  marketRegime,
  dataQuality,
}) => {
  const isBullish = direction === 'STRONG_BUY' || direction === 'BUY';
  const isBearish = direction === 'STRONG_SELL' || direction === 'SELL';

  const hasPrice = price > 0;

  // Simple entry/invalidation logic based on direction
  const entryZone = isBullish
    ? { min: price * 0.999, max: price * 1.001 }
    : isBearish
    ? { min: price * 0.999, max: price * 1.001 }
    : { min: price * 0.998, max: price * 1.002 };

  const invalidation = isBullish
    ? price * 0.995
    : isBearish
    ? price * 1.005
    : price * 0.99;

  const stopLoss = isBullish
    ? price * 0.993
    : isBearish
    ? price * 1.007
    : price * 0.99;

  const target = isBullish
    ? price * 1.01
    : isBearish
    ? price * 0.99
    : price * 1.005;

  const risk = hasPrice ? (Math.abs(price - stopLoss) / price) * 100 : 0;
  const reward = hasPrice ? (Math.abs(target - price) / price) * 100 : 0;
  const rr = risk > 0 ? (reward / risk).toFixed(2) : 'N/A';
  const rrValue = rr === 'N/A' ? 0 : Number.parseFloat(rr);

  const formatPrice = (value: number) =>
    hasPrice ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A';

  return (
    <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] p-6">
      <h3 className="text-white font-bold mb-4 flex items-center">
        <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
        Action Planning
      </h3>

      <div className="grid grid-cols-2 gap-4 text-sm font-mono">
        <div>
          <span className="text-white/50">Entry Zone:</span>
          <span className="font-mono text-white block mt-1">
            {formatPrice(entryZone.min)} – {formatPrice(entryZone.max)}
          </span>
        </div>
        <div>
          <span className="text-white/50">Invalidation:</span>
          <span className="font-mono text-red-500 block mt-1">{formatPrice(invalidation)}</span>
        </div>
        <div>
          <span className="text-white/50">Stop Loss:</span>
          <span className="font-mono text-red-500 block mt-1">{formatPrice(stopLoss)}</span>
        </div>
        <div>
          <span className="text-white/50">Target:</span>
          <span className="font-mono text-green-400 block mt-1">{formatPrice(target)}</span>
        </div>
        <div>
          <span className="text-white/50">Risk:</span>
          <span className="font-mono text-white block mt-1">{hasPrice ? `${risk.toFixed(2)}%` : 'N/A'}</span>
        </div>
        <div>
          <span className="text-white/50">Reward:</span>
          <span className="font-mono text-white block mt-1">{hasPrice ? `${reward.toFixed(2)}%` : 'N/A'}</span>
        </div>
        <div>
          <span className="text-white/50">R:R:</span>
          <span className={cn("font-mono font-bold block mt-1", rrValue >= 2 ? "text-green-400" : rrValue >= 1 ? "text-amber-400" : "text-red-500")}>
            {rr === 'N/A' ? 'N/A' : `1:${rr}`}
          </span>
        </div>
        <div>
          <span className="text-white/50">Confidence:</span>
          <span className={cn("font-mono font-bold block mt-1", confidence >= 70 ? "text-green-400" : confidence >= 50 ? "text-amber-400" : "text-red-500")}>
            {confidence}%
          </span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/[0.04] text-white/60 text-sm">
        <p className="font-bold mb-1">⚠ Manual Confirmation Required</p>
        <p>
          This compass signal is analysis support only. Verify setup fits your strategy,
          check risk/reward, and confirm entry before trading.
        </p>
        {dataQuality < 70 && (
          <p className="mt-2 text-amber-400">
            ⚠ Low data quality ({dataQuality}%) — reduce position size
          </p>
        )}
        {marketRegime === 'HIGH_VOLATILITY' && (
          <p className="mt-2 text-red-500">
            ⚠ High volatility regime — wider stops recommended
          </p>
        )}
      </div>
    </div>
  );
};