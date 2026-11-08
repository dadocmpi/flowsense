// ============================================
// INSTITUTIONAL ORDER FLOW (LIVE)
// ============================================
// A live flow panel with a toggle between two HONEST sources:
//
//   ORDER FLOW  reads the live price tape (the app's own WebSocket relay), and
//               infers each print's side with the tick rule. It is labelled as
//               an inference, because the tape carries no aggressor flag.
//   BOOK FLOW   reads a real order book through a `DepthProvider`. With none
//               connected it says "Sem feed de profundidade conectado" and
//               shows nothing — it never invents a book.
//
// Both modes drive the same UI: BUYERS %, SELLERS %, the accumulated volume
// delta over the rolling window, INSTITUTIONAL PRESSURE, and the thermal line.
// Nothing here is fabricated: a mode with no feed shows the reason, not a zero.

import React from 'react';
import type { UseTickStreamResult } from '../../hooks/useTickStream';
import type { UseDepthStreamResult } from '../../hooks/useDepthStream';
import { TICK_WINDOW, type FlowReading, type PressureLevel } from '../../core/tickflow';
import { DEPTH_LEVELS } from '../../core/depthflow';
import { cn } from '@/lib/utils';

export type FlowMode = 'ORDER_FLOW' | 'BOOK_FLOW';

interface InstitutionalOrderFlowProps {
  /** Symbol for the price tape, e.g. "XAU/USD". */
  orderFlowSymbol: string;
  /** The selected mode. Lifted so the thermal line reads the same source. */
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  /**
   * The live price-tape stream. Lifted to the parent so ONE socket feeds both
   * this panel and the compass's FLOW tab.
   */
  orderFlow: UseTickStreamResult;
  /** The live order-book stream (the `none` provider reports "not configured"). */
  bookFlow: UseDepthStreamResult;
}

const PRESSURE_STYLE: Record<PressureLevel, string> = {
  LOW: 'border-white/[0.08] bg-white/[0.02] text-white/60',
  MEDIUM: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  HIGH: 'border-[#ef5350]/40 bg-[#ef5350]/10 text-[#ef5350]',
};

export const InstitutionalOrderFlow: React.FC<InstitutionalOrderFlowProps> = ({
  orderFlowSymbol,
  mode,
  onModeChange,
  orderFlow,
  bookFlow,
}) => {
  const isOrder = mode === 'ORDER_FLOW';
  const reading: FlowReading = isOrder ? orderFlow.reading : bookFlow.reading;
  const hasData = isOrder ? orderFlow.hasData : bookFlow.hasData;
  const configured = isOrder ? true : bookFlow.configured;

  const statusText = isOrder
    ? orderFlow.status === 'LIVE'
      ? 'LIVE'
      : orderFlow.status === 'RECONNECTING'
        ? 'Reconnecting'
        : orderFlow.status === 'CONNECTING'
          ? 'Connecting'
          : 'Offline'
    : bookFlow.status === 'LIVE'
      ? 'LIVE'
      : bookFlow.configured
        ? bookFlow.status
        : 'Sem feed';

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-title font-bold text-white">
          Institutional Order Flow <span className="text-amber-400">(LIVE)</span>
        </h3>
        <span className="font-mono text-micro uppercase tracking-wider text-white/40">{orderFlowSymbol}</span>
      </div>

      {/* ORDER FLOW <-> BOOK FLOW toggle */}
      <div className="mt-2 inline-flex overflow-hidden rounded-lg border border-white/[0.08] self-start">
        {(['ORDER_FLOW', 'BOOK_FLOW'] as FlowMode[]).map(option => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => onModeChange(option)}
            className={cn(
              'px-3 py-1 font-mono text-micro font-bold tracking-wide transition-colors',
              mode === option ? 'bg-amber-400/15 text-amber-300' : 'bg-white/[0.02] text-white/55 hover:text-white'
            )}
          >
            {option === 'ORDER_FLOW' ? 'ORDER FLOW' : 'BOOK FLOW'}
          </button>
        ))}
      </div>

      {/* BOOK FLOW with no provider: say so, draw nothing. */}
      {!configured ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] py-8 text-center">
          <span className="text-label font-semibold text-white/45">{bookFlow.providerLabel}</span>
          <span className="text-micro text-white/30">
            Nenhum provider de profundidade foi registrado. Nada é inventado.
          </span>
        </div>
      ) : (
        <>
          {/* Buyers / Sellers / Delta / Pressure */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Buyers %" value={hasData ? `${reading.buyersPct.toFixed(1)}%` : '--'} tone="text-[#4db6ac]" />
            <Stat label="Sellers %" value={hasData ? `${reading.sellersPct.toFixed(1)}%` : '--'} tone="text-[#e57373]" />
            <Stat
              label="Volume delta"
              value={hasData ? `${reading.volumeDelta > 0 ? '+' : ''}${reading.volumeDelta.toLocaleString()}` : '--'}
              tone={reading.volumeDelta >= 0 ? 'text-[#4db6ac]' : 'text-[#e57373]'}
            />
            <Stat
              label="Inst. pressure"
              value={hasData ? reading.pressure : '--'}
              badge={hasData ? PRESSURE_STYLE[reading.pressure] : undefined}
            />
          </div>

          {/* The thermal line has its own panel below; see ThermalLinePanel. */}

          {/* The honest basis line: a tick-count delta is not a volume delta. */}
          <div className="mt-auto pt-3 text-micro text-white/35">
            {isOrder ? (
              reading.basis === 'tick-count' && hasData ? (
                <span>
                  Tape carries no size — delta counts ticks, not volume, and each side is inferred by the tick rule.
                </span>
              ) : (
                <span>Side inferred by the tick rule (price up = buy, down = sell, flat inherits).</span>
              )
            ) : (
              <span>
                Resting size within {DEPTH_LEVELS} levels of the mid. This is the book, not traded flow.
              </span>
            )}
          </div>
        </>
      )}

      <div className="mt-2 flex items-center justify-between font-mono text-micro text-white/35">
        <span>{isOrder ? 'PRICE TAPE' : 'ORDER BOOK'}</span>
        <span className={statusText === 'LIVE' ? 'text-[#26a69a]' : 'text-white/40'}>● {statusText}</span>
      </div>
    </div>
  );
};

function Stat({
  label,
  value,
  tone,
  badge,
}: {
  label: string;
  value: string;
  tone?: string;
  badge?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="text-micro uppercase tracking-wider text-white/40">{label}</div>
      {badge ? (
        <span className={cn('mt-1 inline-block rounded border px-1.5 py-0.5 font-mono text-label font-bold', badge)}>
          {value}
        </span>
      ) : (
        <div className={cn('mt-0.5 font-mono text-data font-bold', tone ?? 'text-white/90')}>{value}</div>
      )}
    </div>
  );
}
