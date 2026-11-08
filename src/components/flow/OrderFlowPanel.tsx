// ============================================
// INSTITUTIONAL ORDER FLOW
// ============================================
// The RIGHT compass: real order flow from the configured venue for THIS asset.
// The venue is chosen per asset server-side — Gold reads Binance PAXG/USDT (a
// real gold market with a depth book), the equity indices read Alpaca through
// their ETF proxies (SPY/DIA/QQQ). The card never derives flow from candles.
//
// The panel is a strength bar, not a wall of numbers: who is stronger right
// now, and by how much, in one glance. Everything it draws comes from the venue's
// real tape and quote.
//
//   FLOW   buyer vs seller strength from the real tape (quote rule + tick rule)
//   BOOK   resting bid vs ask pressure, only when the venue publishes a book
//
// The FLOW / BOOK toggle is a capability, never hardcoded: with no real book the
// toggle is removed for that asset (not shown disabled), and Flow is the only
// mode.
//
// With no reading the panel says so and draws no bar: a 50/50 bar would look
// like a real balanced market. A closed market shows the LAST session's reading
// with a "Session closed" label, not "Feed unavailable".

import React from 'react';
import type { OrderFlowReading } from '../../core/types';
import type { OrderFlowCapabilities } from '../../core/providers/capabilities';
import type { FlowWindow } from '../../core/providers/orderflow';
import type { FlowStateResult } from '../../core/orderflow';
import { Panel } from '../common/Panel';
import { Pill } from '../common/Pill';
import { SegmentedControl } from '../common/SegmentedControl';
import { FlowStrengthBar } from './FlowStrengthBar';
import { CvdSparkline } from './CvdSparkline';
import { formatNumber } from '../compass/format';
import { cn } from '@/lib/utils';

/** Which flow mode the panel is in. */
export type FlowMode = 'FLOW' | 'BOOK';

interface OrderFlowPanelProps {
  /** The venue's real reading for the selected window, or null. */
  reading: OrderFlowReading | null;
  /** What the venue can supply FOR THIS INSTRUMENT. Drives the toggle visibility. */
  capabilities: OrderFlowCapabilities;
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  /** The rolling window the tape is measured over. */
  window: FlowWindow;
  onWindowChange: (window: FlowWindow) => void;
  /** Buyer/seller dominance and intensity, from the same thresholds as the gauge. */
  state: FlowStateResult | null;
  /** True when dominance flipped sign and has held — e.g. "Flow turning to buyers". */
  shiftAlert: string | null;
  /** Provenance label for the header, e.g. "QQQ · Alpaca IEX". */
  provenance: string;
  /** Why there is no reading, when there is none. */
  unavailableText: string;
  unavailableHint?: string;
  /** Price precision for the volume figures. */
  precision: number;
  /** Round-trip time of the last venue read, ms. */
  latencyMs: number | null;
  /** Epoch ms the reading was last refreshed. */
  updatedAt: number | null;
}

const WINDOW_OPTIONS: { value: FlowWindow; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '5m', label: '5M' },
  { value: '15m', label: '15M' },
];

/** HH:MM:SS in the viewer's local timezone. */
function clock(ms: number | null): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** One small labelled figure in the footer strip. */
function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-micro uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
      <dd className={cn('font-mono text-label text-ink-secondary', tone)}>{value}</dd>
    </div>
  );
}

export const OrderFlowPanel: React.FC<OrderFlowPanelProps> = ({
  reading,
  capabilities,
  mode,
  onModeChange,
  window,
  onWindowChange,
  state,
  shiftAlert,
  provenance,
  unavailableText,
  unavailableHint,
  precision,
  latencyMs,
  updatedAt,
}) => {
  const session = reading?.session ?? null;
  const book = reading?.book ?? null;
  const sessionClosed = reading?.sessionClosed === true;

  // The Book Flow figures: real resting size from the venue book.
  const bookBuyShare = book ? (book.imbalance + 1) / 2 : 0.5;

  return (
    <Panel
      title="Institutional Order Flow"
      subtitle={provenance}
      actions={
        capabilities.hasOrderBook ? (
          <SegmentedControl
            ariaLabel="Order flow mode"
            size="sm"
            value={mode}
            onChange={value => onModeChange(value as FlowMode)}
            options={[
              { value: 'FLOW', label: 'Flow' },
              { value: 'BOOK', label: 'Book' },
            ]}
          />
        ) : undefined
      }
    >
      {!reading ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
          <span className="text-label font-semibold text-ink-secondary">{unavailableText}</span>
          {unavailableHint && <span className="max-w-[36ch] text-micro text-ink-muted">{unavailableHint}</span>}
        </div>
      ) : (
        <div className="flex h-full flex-col gap-3">
          {/* Status row: session state, the shift alert, and the window control. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {sessionClosed ? (
                <Pill tone="warn" glyph="●" title="The venue's market is closed; this is the last session's reading.">
                  Session closed · last reading {clock(reading.lastTradeAt ?? reading.computedAt ?? null)}
                </Pill>
              ) : (
                <Pill tone="accent" glyph="●">Live tape</Pill>
              )}
              {shiftAlert && (
                <Pill tone={state?.state === 'BUYERS' ? 'buy' : 'sell'} glyph="⇄">
                  {shiftAlert}
                </Pill>
              )}
            </div>
            <SegmentedControl
              ariaLabel="Order flow window"
              size="sm"
              value={window}
              onChange={value => onWindowChange(value as FlowWindow)}
              options={WINDOW_OPTIONS}
            />
          </div>

          {mode === 'BOOK' ? (
            <div className="flex flex-1 flex-col justify-center gap-3">
              {book ? (
                <>
                  <FlowStrengthBar
                    buyShare={bookBuyShare}
                    state={
                      state ?? { state: 'BALANCED', intensity: 'BALANCED', label: 'Balanced', intensityLabel: 'Balanced' }
                    }
                    compact
                  />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-hairline pt-3">
                    <Figure
                      label="Bid size"
                      value={book.bidSize > 0 ? formatNumber(book.bidSize, 0) : '--'}
                      tone="text-buy"
                    />
                    <Figure
                      label="Ask size"
                      value={book.askSize > 0 ? formatNumber(book.askSize, 0) : '--'}
                      tone="text-sell"
                    />
                    <Figure
                      label="Book imbalance"
                      value={book.imbalance.toFixed(2)}
                      tone={book.imbalance >= 0 ? 'text-buy' : 'text-sell'}
                    />
                    <Figure label="Levels" value={`${book.bids.length} / ${book.asks.length}`} />
                  </div>
                </>
              ) : (
                <p className="text-center text-label italic text-ink-muted">No resting book for this instrument.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center gap-3">
              <FlowStrengthBar buyShare={session?.buyShare ?? 0.5} state={state ?? {
                state: 'BALANCED',
                intensity: 'BALANCED',
                label: 'Balanced',
                intensityLabel: 'Balanced',
              }} />

              {/* The session CVD sparkline: the direction of the net flow. */}
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-micro uppercase tracking-[0.1em] text-ink-muted">Session CVD</span>
                  <span
                    className={cn(
                      'font-mono text-label font-semibold',
                      (session?.cvd ?? 0) >= 0 ? 'text-buy' : 'text-sell'
                    )}
                  >
                    {session?.cvd != null ? formatNumber(session.cvd, Math.min(2, precision)) : '--'}
                  </span>
                </div>
                <CvdSparkline
                  series={reading.cvdSeries ?? []}
                  ariaLabel={`Session cumulative volume delta: ${
                    session?.cvd != null ? formatNumber(session.cvd, 2) : 'unavailable'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Data-quality footer: what the numbers are, and how fresh. */}
          <div className="mt-auto grid grid-cols-2 gap-x-6 gap-y-1 border-t border-hairline pt-3">
            <Figure label="Window" value={WINDOW_OPTIONS.find(o => o.value === window)?.label ?? window} />
            <Figure label="Trades" value={session ? formatNumber(session.tradeCount, 0) : '--'} />
            <Figure label="Delta" value={session ? formatNumber(session.delta, Math.min(2, precision)) : '--'} tone={
              session ? (session.delta >= 0 ? 'text-buy' : 'text-sell') : undefined
            } />
            <Figure label="Latency" value={latencyMs != null ? `${latencyMs} ms` : '--'} />
            <Figure label="Updated" value={clock(updatedAt)} />
            <Figure
              label="Absorption"
              value={reading.metrics.absorption != null ? `${Math.round(reading.metrics.absorption * 100)}%` : '--'}
            />
          </div>
        </div>
      )}
    </Panel>
  );
};
