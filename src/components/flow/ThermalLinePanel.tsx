// ============================================
// THERMAL LINE PANEL
// ============================================
// The thermal line as its own panel: a green↔red bar whose equilibrium point
// follows the buyers/sellers proportion in real time, with a smooth transition.
//
// It reads the SAME lifted flow streams the order-flow panel uses, so it tracks
// whichever mode (ORDER FLOW or BOOK FLOW) is selected and never opens a second
// socket. When the selected mode has no reading it says so and rests the marker
// at the centre rather than implying a live balance.

import React from 'react';
import type { UseTickStreamResult } from '../../hooks/useTickStream';
import type { UseDepthStreamResult } from '../../hooks/useDepthStream';
import type { FlowMode } from './InstitutionalOrderFlow';
import { TICK_WINDOW, type FlowReading } from '../../core/tickflow';
import { ThermalLine } from './ThermalLine';
import { cn } from '@/lib/utils';

interface ThermalLinePanelProps {
  mode: FlowMode;
  orderFlow: UseTickStreamResult;
  bookFlow: UseDepthStreamResult;
}

export const ThermalLinePanel: React.FC<ThermalLinePanelProps> = ({ mode, orderFlow, bookFlow }) => {
  const isOrder = mode === 'ORDER_FLOW';
  const reading: FlowReading = isOrder ? orderFlow.reading : bookFlow.reading;
  const hasData = isOrder ? orderFlow.hasData : bookFlow.hasData;
  const configured = isOrder ? true : bookFlow.configured;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-title font-bold text-white">Thermal Line</h3>
        <span className="font-mono text-micro uppercase tracking-wider text-white/40">
          {isOrder ? 'ORDER FLOW' : 'BOOK FLOW'}
        </span>
      </div>

      <p className="mt-1 text-label text-white/45">
        Equilibrium of buyers against sellers, updated live. Works in both modes.
      </p>

      <div className="mt-4">
        {!configured ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <span className="text-label font-semibold text-white/45">{bookFlow.providerLabel}</span>
            <span className="text-micro text-white/30">Nada é inventado.</span>
          </div>
        ) : (
          <>
            <ThermalLine
              buyersPct={hasData ? reading.buyersPct : 50}
              sellersPct={hasData ? reading.sellersPct : 50}
              hasData={hasData}
              caption={isOrder ? `last ${reading.sampleCount}/${TICK_WINDOW} ticks` : `${reading.sampleCount} levels`}
            />
            <div className="mt-3 flex items-center justify-between font-mono text-label">
              <span className={cn('text-[#4db6ac]')}>Buyers {hasData ? reading.buyersPct.toFixed(1) : '--'}%</span>
              <span className="text-white/35">delta {hasData ? reading.volumeDelta.toLocaleString() : '--'}</span>
              <span className="text-[#e57373]">Sellers {hasData ? reading.sellersPct.toFixed(1) : '--'}%</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
