// ============================================
// INSTITUTIONAL ORDER FLOW
// ============================================
// The RIGHT compass: real order flow from the configured venue, chosen per asset
// (every shipped asset reads Alpaca). It draws the gauge, the tape
// numbers (aggressor delta, CVD) and the resting book imbalance, all from the
// venue's own payloads.
//
// The panel offers two modes:
//
//   ORDER FLOW  the tape: aggressor delta and cumulative volume delta
//   BOOK FLOW   the resting bid/ask book
//
// The ORDER FLOW / BOOK FLOW toggle is rendered ONLY when the venue publishes a
// real book (a capability, never hardcoded). With no book there is no toggle at
// all — not a disabled one — and Order Flow is the only mode.
//
// With no reading the panel says so and draws no gauge: a neutral needle would
// look like a real "neutral market" read.

import React from 'react';
import type { OrderFlowReading } from '../../core/types';
import type { OrderFlowCapabilities } from '../../core/providers/capabilities';
import { CompassGauge } from '../compass/CompassGauge';
import { formatNumber } from '../compass/format';
import { cn } from '@/lib/utils';

/** Which flow mode the panel is in. */
export type FlowMode = 'ORDER_FLOW' | 'BOOK_FLOW';

interface OrderFlowPanelProps {
  /** The venue's real reading for the selected timeframe, or null. */
  reading: OrderFlowReading | null;
  /** What the venue can supply. Drives the toggle visibility. */
  capabilities: OrderFlowCapabilities;
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  /** Venue name for the provenance line, e.g. "Alpaca". */
  venueLabel: string;
  /**
   * How this venue names its book, for the Book Flow mode. "Top of book" for
   * the IEX best bid/ask only (Alpaca). The panel never calls a one-level book a
   * depth ladder.
   */
  bookLabel: string;
  /** Why there is no reading, when there is none. */
  unavailableText: string;
  unavailableHint?: string;
  /** Price precision for the volume figures. */
  precision: number;
}

/** A buy/sell split bar, from a 0..100 buy share. */
function SplitBar({ buyShare, leftLabel, rightLabel }: { buyShare: number; leftLabel: string; rightLabel: string }) {
  const clamped = Math.max(0, Math.min(100, buyShare));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-mono text-micro uppercase tracking-wider">
        <span className="text-[#e57373]">{leftLabel}</span>
        <span className="text-[#4db6ac]">{rightLabel}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-white/[0.08]">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, #ef5350 0%, #e57373 30%, #f59e0b 50%, #4db6ac 70%, #26a69a 100%)',
          }}
        />
        <div
          className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
          style={{ left: `${clamped}%`, transition: 'left 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate text-micro uppercase tracking-wider text-white/35">{label}</span>
      <span className={cn('font-mono text-label font-semibold text-white/90', tone)}>{value}</span>
    </div>
  );
}

export const OrderFlowPanel: React.FC<OrderFlowPanelProps> = ({
  reading,
  capabilities,
  mode,
  onModeChange,
  venueLabel,
  bookLabel,
  unavailableText,
  unavailableHint,
  precision,
}) => {
  const metrics = reading?.metrics ?? null;
  const score = reading?.gauge.score ?? 0;
  const buyShare = (Math.max(-100, Math.min(100, score)) + 100) / 2;
  const bookBuyShare = metrics?.imbalance != null ? (metrics.imbalance + 1) * 50 : 50;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-title font-bold text-white">Institutional Order Flow</h3>
        <span className="text-micro uppercase tracking-wider text-white/40">{venueLabel}</span>
      </div>

      {/* The toggle is a capability, never hardcoded: with no real book there is
          no toggle at all, and Order Flow is the only mode. */}
      {capabilities.hasOrderBook && (
        <div className="mt-2 inline-flex self-center overflow-hidden rounded-lg border border-white/[0.08]">
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
      )}

      {!reading ? (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <span className="text-label font-semibold text-white/45">{unavailableText}</span>
          {unavailableHint && <span className="text-micro text-white/30">{unavailableHint}</span>}
        </div>
      ) : (
        <div className="mt-2 flex flex-1 flex-col items-center">
          <CompassGauge title="" gauge={reading.gauge} size="md" />

          <div className="mt-2 w-full">
            <SplitBar
              buyShare={mode === 'BOOK_FLOW' ? bookBuyShare : buyShare}
              leftLabel={mode === 'BOOK_FLOW' ? 'ASKS' : 'SELL'}
              rightLabel={mode === 'BOOK_FLOW' ? 'BIDS' : 'BUY'}
            />
          </div>

          <dl className="mt-2 grid w-full grid-cols-2 gap-x-4 gap-y-1">
            {mode === 'BOOK_FLOW' ? (
              <>
                <Stat
                  label="Imbalance"
                  value={metrics?.imbalance != null ? metrics.imbalance.toFixed(2) : '--'}
                  tone={
                    metrics?.imbalance == null
                      ? undefined
                      : metrics.imbalance >= 0
                        ? 'text-[#4db6ac]'
                        : 'text-[#e57373]'
                  }
                />
                <Stat
                  label="Absorption"
                  value={metrics?.absorption != null ? `${Math.round(metrics.absorption * 100)}%` : '--'}
                />
                <Stat label="Venue" value={venueLabel} />
                <Stat label="Book" value={bookLabel} />
              </>
            ) : (
              <>
                <Stat
                  label="Delta"
                  value={metrics?.delta != null ? formatNumber(metrics.delta, Math.min(2, precision)) : '--'}
                  tone={
                    metrics?.delta == null ? undefined : metrics.delta >= 0 ? 'text-[#4db6ac]' : 'text-[#e57373]'
                  }
                />
                <Stat
                  label="CVD"
                  value={metrics?.cvd != null ? formatNumber(metrics.cvd, Math.min(2, precision)) : '--'}
                  tone={metrics?.cvd == null ? undefined : metrics.cvd >= 0 ? 'text-[#4db6ac]' : 'text-[#e57373]'}
                />
                <Stat
                  label="Imbalance"
                  value={metrics?.imbalance != null ? metrics.imbalance.toFixed(2) : '--'}
                />
                <Stat
                  label="Absorption"
                  value={metrics?.absorption != null ? `${Math.round(metrics.absorption * 100)}%` : '--'}
                />
              </>
            )}
          </dl>

          <div className="mt-auto w-full pt-2 text-micro text-white/35">
            Real order flow from {reading.source}: aggressor delta and cumulative volume delta from the venue tape,
            plus the resting bid/ask imbalance from the venue&rsquo;s
            {bookLabel === 'Depth' ? ' depth' : ' top of book'}.
          </div>
        </div>
      )}
    </div>
  );
};
