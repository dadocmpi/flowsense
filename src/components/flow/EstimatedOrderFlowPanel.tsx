// ============================================
// INSTITUTIONAL ORDER FLOW (ESTIMATED)
// ============================================
// The RIGHT panel for an instrument whose provider has no real order flow: an
// ESTIMATE derived from the closed candles. It is always badged ESTIMATED, and
// the badge's tooltip says exactly what it is — computed from candles and volume,
// because the provider publishes no order book.
//
// It keeps the ORDER FLOW <-> BOOK FLOW toggle. Book Flow is DISABLED (with a
// hint, never an error) when the provider has no book; a future provider that
// does publish one sets `hasOrderBook` and the toggle lights up with no other
// change.
//
// Nothing here is a placeholder: with too few closed candles it says how many it
// is collecting, rather than drawing a neutral needle or a zero.

import React from 'react';
import type { EstimatedOrderFlowReading } from '../../core/types';
import type { OrderFlowCapabilities } from '../../core/providers/capabilities';
import { ThermalLine } from './ThermalLine';
import { CvdSparkline } from './CvdSparkline';
import { formatNumber, scoreColor } from '../compass/format';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';

/** Which flow mode the panel is in. */
export type FlowMode = 'ORDER_FLOW' | 'BOOK_FLOW';

interface EstimatedOrderFlowPanelProps {
  /** The estimate for the selected timeframe, or null while it is too short. */
  reading: EstimatedOrderFlowReading | null;
  /** What the instrument's provider can supply. */
  capabilities: OrderFlowCapabilities;
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  /** Closed candles on the selected timeframe, for the collecting state. */
  candleCount: number;
  /** Candles the estimator needs before a reading is possible. */
  needed: number;
  /** Price precision for the CVD figure. */
  precision: number;
}

const STATE_STYLE: Record<string, string> = {
  BUYING: 'border-[#26a69a]/40 bg-[#26a69a]/10 text-[#4db6ac]',
  SELLING: 'border-[#ef5350]/40 bg-[#ef5350]/10 text-[#e57373]',
  NEUTRAL: 'border-white/[0.08] bg-white/[0.02] text-white/60',
};

const STATE_WORD: Record<string, string> = {
  BUYING: 'Buying',
  SELLING: 'Selling',
  NEUTRAL: 'Neutral',
};

/** The "ESTIMATED" badge, with the honest tooltip that explains it. */
function EstimatedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-micro font-bold uppercase tracking-wider text-amber-400">
          Estimated
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem] text-micro">
        Computed from candles and volume. Twelve Data does not provide an order book.
      </TooltipContent>
    </Tooltip>
  );
}

export const EstimatedOrderFlowPanel: React.FC<EstimatedOrderFlowPanelProps> = ({
  reading,
  capabilities,
  mode,
  onModeChange,
  candleCount,
  needed,
  precision,
}) => {
  const estimate = reading?.estimate ?? null;
  const hasData = Boolean(reading && estimate?.available);
  const state = estimate?.state ?? 'NEUTRAL';
  const tone = reading ? scoreColor(reading.gauge.score) : '#94a3b8';
  const bookEnabled = capabilities.hasOrderBook;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-title font-bold text-white">Institutional Order Flow</h3>
          <EstimatedBadge />
        </div>
        <span className="font-mono text-micro uppercase tracking-wider text-white/40">
          {estimate ? `last ${estimate.candleCount} candles · proxy ${estimate.proxy}` : '—'}
        </span>
      </div>

      {/* ORDER FLOW <-> BOOK FLOW toggle. Book Flow is disabled, not an error,
          when the provider publishes no book. */}
      <div className="mt-2 inline-flex self-start overflow-hidden rounded-lg border border-white/[0.08]">
        {(['ORDER_FLOW', 'BOOK_FLOW'] as FlowMode[]).map(option => {
          const disabled = option === 'BOOK_FLOW' && !bookEnabled;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              disabled={disabled}
              title={disabled ? 'Unavailable for this provider' : undefined}
              onClick={() => !disabled && onModeChange(option)}
              className={cn(
                'px-3 py-1 font-mono text-micro font-bold tracking-wide transition-colors',
                mode === option ? 'bg-amber-400/15 text-amber-300' : 'bg-white/[0.02] text-white/55 hover:text-white',
                disabled && 'cursor-not-allowed text-white/25 hover:text-white/25'
              )}
            >
              {option === 'ORDER_FLOW' ? 'ORDER FLOW' : 'BOOK FLOW'}
            </button>
          );
        })}
      </div>

      {/* Book Flow is only reachable when the provider has a book; with none it
          is disabled above, and if it is ever reached this says why. */}
      {mode === 'BOOK_FLOW' && !bookEnabled && (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] py-8 text-center">
          <span className="text-label font-semibold text-white/45">Book Flow unavailable</span>
          <span className="text-micro text-white/30">Unavailable for this provider — no resting bid/ask book.</span>
        </div>
      )}

      {mode !== 'BOOK_FLOW' && !hasData && (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] py-8 text-center">
          <span className="text-label font-semibold text-white/45">Collecting data…</span>
          <span className="text-micro text-white/30">
            {candleCount}/{needed} closed candles on this timeframe.
          </span>
        </div>
      )}

      {mode !== 'BOOK_FLOW' && hasData && estimate && reading && (
        <div className="mt-3 flex flex-1 flex-col gap-3">
          {/* Head line: the smoothed imbalance and the state word. */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-data font-black" style={{ color: tone }}>
                {estimate.smoothedImbalance >= 0 ? '+' : ''}
                {estimate.smoothedImbalance.toFixed(0)}
              </span>
              <span className="text-micro uppercase tracking-wider text-white/35">smoothed imbalance</span>
            </div>
            <span className={cn('rounded border px-2 py-0.5 text-label font-bold', STATE_STYLE[state])}>
              {STATE_WORD[state]}
            </span>
          </div>

          <ThermalLine
            buyPercent={estimate.buyPressure}
            sellPercent={estimate.sellPressure}
            hasData
            caption={`CVD ${estimate.cvdTrend.toLowerCase()}`}
          />

          {/* The forming candle, shown separately and clearly labelled. It never
              feeds the numbers above or the Compass. */}
          {reading.provisional !== null && (
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
              <span className="font-mono text-micro uppercase tracking-wider text-white/35">
                Forming candle (provisional)
              </span>
              <span
                className={cn(
                  'font-mono text-label font-semibold',
                  reading.provisional >= 0 ? 'text-[#4db6ac]' : 'text-[#e57373]'
                )}
              >
                {reading.provisional >= 0 ? '+' : ''}
                {reading.provisional.toFixed(0)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Buy pressure" value={`${estimate.buyPressure.toFixed(1)}%`} tone="text-[#4db6ac]" />
            <Stat label="Sell pressure" value={`${estimate.sellPressure.toFixed(1)}%`} tone="text-[#e57373]" />
            <Stat
              label="CVD"
              value={`${estimate.cvd >= 0 ? '+' : ''}${formatNumber(estimate.cvd, 0)}`}
              tone={estimate.cvd >= 0 ? 'text-[#4db6ac]' : 'text-[#e57373]'}
            />
            <Stat label="CVD trend" value={estimate.cvdTrend} />
          </div>

          <div>
            <div className="mb-1 text-micro uppercase tracking-wider text-white/35">Cumulative delta</div>
            <div className="h-[34px]">
              <CvdSparkline
                values={estimate.cvdSeries}
                color={estimate.cvd >= 0 ? '#4db6ac' : '#e57373'}
              />
            </div>
          </div>

          {(estimate.divergence || estimate.absorption) && (
            <div className="flex flex-wrap gap-1.5">
              {estimate.divergence === 'BEARISH' && (
                <Badge tone="border-[#ef5350]/40 bg-[#ef5350]/10 text-[#e57373]">Bearish divergence</Badge>
              )}
              {estimate.divergence === 'BULLISH' && (
                <Badge tone="border-[#26a69a]/40 bg-[#26a69a]/10 text-[#4db6ac]">Bullish divergence</Badge>
              )}
              {estimate.absorption && (
                <Badge tone="border-amber-500/40 bg-amber-500/10 text-amber-300">Absorption</Badge>
              )}
            </div>
          )}

          {/* The honest basis line, pinned to the bottom. */}
          <div className="mt-auto pt-1 text-micro text-white/35">
            Computed from candles and volume. Twelve Data does not provide an order book.
            {!capabilities.hasVolume && ' Volume unavailable — the candle range is used as the activity proxy.'}
          </div>
        </div>
      )}
    </div>
  );
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="text-micro uppercase tracking-wider text-white/40">{label}</div>
      <div className={cn('mt-0.5 font-mono text-label font-bold', tone ?? 'text-white/90')}>{value}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={cn('rounded border px-2 py-0.5 font-mono text-micro font-bold uppercase tracking-wider', tone)}>
      {children}
    </span>
  );
}
