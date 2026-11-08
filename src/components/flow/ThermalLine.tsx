// ============================================
// THERMAL LINE
// ============================================
// A horizontal green<->red bar whose equilibrium marker tracks the buy/sell
// proportion of the window. It is the "buy vs sell bar" the Order Flow panel
// shows, and it works for either a real reading or an estimate, because both
// reduce to the same shape: a share of the window on the buy side.
//
// The marker glides rather than snapping, so a fast tape reads as a moving
// temperature instead of a flicker. With no reading the marker rests at the
// centre and the bar is dimmed, so it never implies a live balance it does not
// have.

import React from 'react';
import { cn } from '@/lib/utils';

interface ThermalLineProps {
  /** Buyers' share of the window, 0..100. */
  buyPercent: number;
  /** Sellers' share of the window, 0..100. */
  sellPercent: number;
  /** True when there is a real reading behind the bar. */
  hasData: boolean;
  /** Caption above the bar, e.g. "last 20 candles". */
  caption?: string;
}

export const ThermalLine: React.FC<ThermalLineProps> = ({ buyPercent, sellPercent, hasData, caption }) => {
  const clamped = Math.max(0, Math.min(100, buyPercent));
  const position = hasData ? clamped : 50;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between font-mono text-micro uppercase tracking-wider">
        <span className="text-[#e57373]">SELL {sellPercent.toFixed(0)}%</span>
        {caption && <span className="text-white/35">{caption}</span>}
        <span className="text-[#4db6ac]">BUY {buyPercent.toFixed(0)}%</span>
      </div>

      <div
        className={cn(
          'relative h-3 w-full overflow-hidden rounded-full border border-white/[0.08]',
          !hasData && 'opacity-40'
        )}
        role="img"
        aria-label={`Thermal line: buyers ${buyPercent.toFixed(0)}%, sellers ${sellPercent.toFixed(0)}%`}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, #ef5350 0%, #e57373 30%, #f59e0b 50%, #4db6ac 70%, #26a69a 100%)',
          }}
        />
        <div
          className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
          style={{ left: `${position}%`, transition: 'left 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </div>
    </div>
  );
};
