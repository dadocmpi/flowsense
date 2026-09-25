import React from 'react';
import { cn } from '@/lib/utils';
import { ReversalSignal, SRLevel } from '../../types/srReversal';

interface ReversalPanelProps {
  reversalSignal: ReversalSignal | null;
  srLevels: SRLevel[];
  price: number;
}

export const ReversalPanel = ({ reversalSignal, srLevels, price }: ReversalPanelProps) => {
  // Find nearest support and resistance
  const supports = srLevels.filter(level => level.direction === 'SUPPORT');
  const resistances = srLevels.filter(level => level.direction === 'RESISTANCE');

  const nearestSupport = supports.reduce((prev, current) => {
    return Math.abs(current.priceLow - price) < Math.abs(prev.priceLow - price) ? current : prev;
  }, supports[0] || { priceLow: 0, priceHigh: 0, strength: 0, timeframe: '', testCount: 0, freshness: 0, distanceFromPrice: 0, pricePosition: 'BELOW', zoneState: 'APPROACHING', invalidationLevel: 0, confidence: 0, dataQuality: 0, id: '', type: 'SUPPLY_ZONE', direction: 'SUPPORT' });

  const nearestResistance = resistances.reduce((prev, current) => {
    return Math.abs(current.priceLow - price) < Math.abs(prev.priceLow - price) ? current : prev;
  }, resistances[0] || { priceLow: 0, priceHigh: 0, strength: 0, timeframe: '', testCount: 0, freshness: 0, distanceFromPrice: 0, pricePosition: 'ABOVE', zoneState: 'APPROACHING', invalidationLevel: 0, confidence: 0, dataQuality: 0, id: '', type: 'DEMAND_ZONE', direction: 'RESISTANCE' });

  // Determine if any zone is touched
  const anyZoneTouched = srLevels.some(level => 
    level.zoneState === 'TOUCHING' || 
    level.zoneState === 'RETESTING' ||
    level.zoneState === 'REJECTING' ||
    level.zoneState === 'BREAKING'
  );

  // Get rejection or breakout state from reversal signal
  const rejectionOrBreakoutState = reversalSignal?.state ?? 'NO_TRADE';

  return (
    <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] overflow-hidden">
      <div className="flex border-b border-white/[0.04] px-6 py-4">
        <h3 className="text-white font-bold text-xs tracking-wider flex-1">REVERSAL PANEL</h3>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-white/50 font-bold uppercase">Current Price</span>
            <div className="text-white font-mono mt-1">{price.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-white/50 font-bold uppercase">Nearest Support</span>
            <div className="text-white font-mono mt-1">
              {nearestSupport.priceLow > 0 ? nearestSupport.priceLow.toFixed(2) : 'N/A'}
              <span className="text-xs ml-2 whitespace-nowrap">
                ({nearestSupport.timeframe} • {nearestSupport.strength}%)
              </span>
            </div>
          </div>
          <div>
            <span className="text-white/50 font-bold uppercase">Nearest Resistance</span>
            <div className="text-white font-mono mt-1">
              {nearestResistance.priceLow > 0 ? nearestResistance.priceLow.toFixed(2) : 'N/A'}
              <span className="text-xs ml-2 whitespace-nowrap">
                ({nearestResistance.timeframe} • {nearestResistance.strength}%)
              </span>
            </div>
          </div>
          <div>
            <span className="text-white/50 font-bold uppercase">Zone Touched</span>
            <div className={cn(
              "text-white font-mono mt-1",
              anyZoneTouched ? "text-green-400" : "text-red-500"
            )}>
              {anyZoneTouched ? 'YES' : 'NO'}
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.04] pt-4">
          <span className="text-white/50 font-bold uppercase text-xs">State</span>
          <div className="text-white font-mono mt-1">
            {reversalSignal ? reversalSignal.state.replace('_', ' ') : 'NO_TRADE'}
          </div>
        </div>

        {reversalSignal && (
          <>
            <div className="border-t border-white/[0.04] pt-4">
              <span className="text-white/50 font-bold uppercase text-xs">Reason</span>
              <div className="text-white/90 font-mono mt-1 text-xs">
                {reversalSignal.reason}
              </div>
            </div>

            <div className="border-t border-white/[0.04] pt-4">
              <span className="text-white/50 font-bold uppercase text-xs">Order Flow</span>
              <div className="grid grid-cols-1 gap-2 text-xs mt-1">
                <div>
                  <span className="text-white/50">Available:</span>
                  <span className={cn(
                    "font-mono",
                    reversalSignal.orderFlowConfirmation.available ? "text-green-400" : "text-red-500"
                  )}>
                    {reversalSignal.orderFlowConfirmation.available ? 'YES' : 'NO'}
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Bullish Pressure:</span>
                  <span className="font-mono">{reversalSignal.orderFlowConfirmation.bullishPressure}%</span>
                </div>
                <div>
                  <span className="text-white/50">Bearish Pressure:</span>
                  <span className="font-mono">{reversalSignal.orderFlowConfirmation.bearishPressure}%</span>
                </div>
                {reversalSignal.orderFlowConfirmation.delta !== 0 && (
                  <div>
                    <span className="text-white/50">Delta:</span>
                    <span className={cn(
                      "font-mono",
                      reversalSignal.orderFlowConfirmation.delta > 0 ? "text-green-400" : "text-red-500"
                    )}>
                      {reversalSignal.orderFlowConfirmation.delta.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/[0.04] pt-4">
              <span className="text-white/50 font-bold uppercase text-xs">Timeframe Agreement</span>
              <div className="text-white/90 font-mono mt-1 text-xs">
                Aligned: {reversalSignal.timeframeAgreement.aligned.join(', ') || 'None'}
              </div>
              <div className="text-white/90 font-mono mt-1 text-xs">
                Conflicting: {reversalSignal.timeframeAgreement.conflicting.join(', ') || 'None'}
              </div>
              {reversalSignal.timeframeAgreement.unavailable.length > 0 && (
                <div className="text-white/90 font-mono mt-1 text-xs">
                  Unavailable: {reversalSignal.timeframeAgreement.unavailable.join(', ')}
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.04] pt-4">
              <span className="text-white/50 font-bold uppercase text-xs">Invalidation</span>
              <div className="text-white font-mono mt-1">
                Level: {reversalSignal.invalidation.level > 0 ? reversalSignal.invalidation.level.toFixed(2) : 'N/A'}
              </div>
              <div className="text-white font-mono mt-1">
                Distance: {reversalSignal.invalidation.distance > 0 ? reversalSignal.invalidation.distance.toFixed(2) : 'N/A'}
              </div>
            </div>

            <div className="border-t border-white/[0.04] pt-4">
              <span className="text-white/50 font-bold uppercase text-xs">Risk/Reward</span>
              <div className="text-white font-mono mt-1">
                Target: {reversalSignal.riskReward.target > 0 ? reversalSignal.riskReward.target.toFixed(2) : 'N/A'}
              </div>
              <div className="text-white font-mono mt-1">
                Stop: {reversalSignal.riskReward.stop > 0 ? reversalSignal.riskReward.stop.toFixed(2) : 'N/A'}
              </div>
              <div className="text-white font-mono mt-1">
                Ratio: {reversalSignal.riskReward.ratio > 0 ? reversalSignal.riskReward.ratio.toFixed(2) : 'N/A'}
              </div>
            </div>

            <div className="border-t border-white/[0.04] pt-4">
              <span className="text-white/50 font-bold uppercase text-xs">Confidence</span>
              <div className={cn(
                "font-mono mt-1",
                reversalSignal.confidence >= 80 ? "text-green-400" :
                reversalSignal.confidence >= 60 ? "text-amber-400" : "text-red-500"
              )}>
                {reversalSignal.confidence}%
              </div>
            </div>

            <div className="border-t border-white/[0.04] pt-4">
              <span className="text-white/50 font-bold uppercase text-xs">Data Quality</span>
              <div className={cn(
                "font-mono mt-1",
                reversalSignal.dataQuality >= 80 ? "text-green-400" :
                reversalSignal.dataQuality >= 60 ? "text-amber-400" : "text-red-500"
              )}>
                {reversalSignal.dataQuality}%
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};