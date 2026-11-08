// ============================================
// THERMAL LINE
// ============================================
// A horizontal green↔red bar whose equilibrium point tracks the live
// buyers/sellers proportion. It works for BOTH flow modes, because both reduce
// to the same shape: a share of the window that was on the buy side.
//
// The marker glides (a CSS transition on its position) rather than snapping, so
// a fast tape reads as a moving temperature instead of a flicker. When there is
// no reading at all the marker rests at the centre and the line is dimmed, so it
// never implies a live balance it does not have.

import React from 'react';
import { cn } from '@/lib/utils';

interface ThermalLineProps {
  /** Buyers' share of the window, 0..100. */
  buyersPct: number;
  /** Sellers' share of the window, 0..100. */
  sellersPct: number;
  /** True when there is a real reading behind the bar. */
  hasData: boolean;
  /** Caption under the bar, e.g. "ORDER FLOW · last 500 ticks". */
  caption?: string;
  /** Short label for the right-hand end. */
  rightLabel?: string;
}

export const ThermalLine: React.FC<ThermalLineProps> = ({
  buyersPct,
  sellersPct,
  hasData,
  caption,
  rightLabel = 'BUYERS',
}) => {
  const clamped = Math.max(0, Math.min(100, buyersPct));
  // With no reading the marker sits at the centre, dimmed — never claiming a
  // one-sided balance that does not exist.
  const position = hasData ? clamped : 50;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between font-mono text-micro uppercase tracking-wider">
        <span className="text-[#e57373]">SELLERS {sellersPct.toFixed(0)}%</span>
        {caption && <span className="text-white/35">{caption}</span>}
        <span className="text-[#4db6ac]">
          {rightLabel} {buyersPct.toFixed(0)}%
        </span>
      </div>

      <div
        className={cn(
          'relative h-3 w-full overflow-hidden rounded-full border border-white/[0.08]',
          !hasData && 'opacity-40'
        )}
        role="img"
        aria-label={`Thermal line: buyers ${buyersPct.toFixed(0)}%, sellers ${sellersPct.toFixed(0)}%`}
      >
        {/* Red at the sell end, gold through the middle, green at the buy end. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, #ef5350 0%, #e57373 30%, #f59e0b 50%, #4db6ac 70%, #26a69a 100%)',
          }}
        />
        {/* The equilibrium marker. */}
        <div
          className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
          style={{
            left: `${position}%`,
            transition: 'left 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
    </div>
  );
};
