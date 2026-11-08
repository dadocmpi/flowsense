// ============================================
// ORDER FLOW PANEL (real venue feed)
// ============================================
// The RIGHT panel. It reads a REAL venue feed: aggressive delta / cumulative
// delta from the tape, resting book imbalance, a full DOM ladder and the tape.
// Nothing here is derived from candles.
//
// ORDER FLOW shows the closed-candle flow numbers (the same ones the Compass
// reads). BOOK FLOW shows the live resting book: the 20-level ladder, the
// imbalance over the top N levels and the tape. When the feed is down every
// number is replaced by "Feed unavailable" with the reason and last update — no
// stale figure is left looking current.

import React from 'react';
import type { OrderFlowFeed } from '../../hooks/useOrderFlowFeed';
import type { FlowMode } from './flowMode';
import { Panel } from '../common/Panel';
import { Badge, Segmented, Stat } from '../common/ui';
import { PALETTE } from '../common/palette';
import { DomLadder } from './DomLadder';
import { TradeTape } from './TradeTape';
import { FlowPressureBar } from './FlowPressureBar';
import { CvdSparkline } from './CvdSparkline';
import { FeedHealthBadge, FeedHealthDetail } from './FeedHealthBadge';
import { CompassGauge } from '../compass/CompassGauge';
import { formatNumber, formatAge } from '../compass/format';
import { cn } from '@/lib/utils';

interface OrderFlowPanelProps {
  feed: OrderFlowFeed;
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  precision: number;
  timeframeLabel: string;
  /** Twelve Data's XAU/USD price, for the basis line. */
  referencePrice: number | null;
  now: number;
}

const STATE_TONE = {
  BUYING: { color: PALETTE.pos, word: 'Buying' },
  SELLING: { color: PALETTE.neg, word: 'Selling' },
  NEUTRAL: { color: PALETTE.inkMuted, word: 'Neutral' },
} as const;

export const OrderFlowPanel: React.FC<OrderFlowPanelProps> = ({
  feed,
  mode,
  onModeChange,
  precision,
  timeframeLabel,
  referencePrice,
  now,
}) => {
  const { health, reading, result, imbalance } = feed;
  const live = health.status === 'LIVE';
  const detail = reading?.detail ?? null;
  const state = detail ? STATE_TONE[detail.state] : null;
  const metrics = reading?.metrics ?? null;

  const basis =
    feed.venuePrice !== null && referencePrice !== null && referencePrice > 0
      ? feed.venuePrice - referencePrice
      : null;

  return (
    <Panel
      title="Order flow"
      badge={<FeedHealthBadge health={health} />}
      meta={
        <>
          <span className="uppercase tracking-[0.06em]">{feed.venue}</span>
          <Segmented
            value={mode}
            onChange={onModeChange}
            options={[
              { value: 'ORDER_FLOW', label: 'Order flow' },
              { value: 'BOOK_FLOW', label: 'Book flow' },
            ]}
          />
        </>
      }
      bodyClassName="p-0"
    >
      {/* Feed health strip: the real condition, always visible. */}
      <div className="border-b border-line px-3 py-1.5">
        <FeedHealthDetail health={health} now={now} />
      </div>

      {/* Down / unavailable: no stale numbers, the reason and the last update. */}
      {!live && (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-1.5 px-4 text-center">
          <span className="text-label font-medium text-warn">Feed unavailable</span>
          <span className="max-w-[22rem] text-micro text-ink-subtle">
            {health.reason ?? 'The venue stream is not connected.'}
          </span>
          <span className="text-micro text-ink-subtle">
            Last update <span className="font-mono tabular text-ink-muted">{formatAge(health.lastMessageAt, now)}</span>
          </span>
          <span className="mt-1 text-micro text-ink-subtle">{feed.venue}</span>
        </div>
      )}

      {live && mode === 'ORDER_FLOW' && (
        <div className="flex flex-col gap-3 p-3">
          {!result ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-1 text-center">
              <span className="text-label text-ink-muted">Collecting data…</span>
              <span className="text-micro text-ink-subtle">
                Waiting for enough closed candles to read the flow on {timeframeLabel}.
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <CompassGauge gauge={result.gauge} compact />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-data font-semibold tabular" style={{ color: state!.color }}>
                      {result.smoothedImbalance >= 0 ? '+' : ''}
                      {result.smoothedImbalance.toFixed(0)}
                    </span>
                    <Badge tone={detail?.state === 'BUYING' ? 'pos' : detail?.state === 'SELLING' ? 'neg' : 'neutral'}>
                      {state!.word}
                    </Badge>
                  </div>
                  <span className="text-micro uppercase tracking-[0.06em] text-ink-subtle">smoothed imbalance · closed candles</span>
                </div>
              </div>

              <FlowPressureBar
                buyPercent={metrics?.buyShare != null ? metrics.buyShare * 100 : null}
                sellPercent={metrics?.buyShare != null ? (1 - metrics.buyShare) * 100 : null}
                caption={`closed ${result.candleCount} ${timeframeLabel}`}
              />

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Stat
                  label="Net delta"
                  value={metrics?.delta != null ? `${metrics.delta >= 0 ? '+' : ''}${formatNumber(metrics.delta, 0)}` : '--'}
                  color={metrics?.delta != null ? (metrics.delta >= 0 ? PALETTE.pos : PALETTE.neg) : undefined}
                />
                <Stat
                  label="CVD (UTC reset)"
                  value={metrics?.cvd != null ? `${metrics.cvd >= 0 ? '+' : ''}${formatNumber(metrics.cvd, 0)}` : '--'}
                  color={metrics?.cvd != null ? (metrics.cvd >= 0 ? PALETTE.pos : PALETTE.neg) : undefined}
                />
                <Stat
                  label={`Book imbalance (top ${feed.imbalanceLevels})`}
                  value={imbalance != null ? imbalance.toFixed(2) : '--'}
                  color={imbalance != null ? (imbalance >= 0 ? PALETTE.pos : PALETTE.neg) : undefined}
                  title="(bid size - ask size) / (bid size + ask size) over the top levels"
                />
                <Stat
                  label="Window volume"
                  value={metrics?.volume != null ? formatNumber(metrics.volume, 0) : '--'}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-micro uppercase tracking-[0.06em] text-ink-subtle">
                  <span>Cumulative delta</span>
                  <span className="normal-case tracking-normal">
                    resets{' '}
                    <span className="font-mono tabular text-ink-muted">
                      {detail?.resetAt ? new Date(detail.resetAt).toISOString().slice(11, 16) : '00:00'} UTC
                    </span>
                  </span>
                </div>
                <div style={{ height: 44 }}>
                  <CvdSparkline values={(detail?.cvdSeries ?? []).map(p => p.cvd)} />
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-line pt-2 text-micro text-ink-subtle">
                <span>
                  Venue <span className="text-ink-muted">{feed.venue}</span>
                </span>
                <span>
                  Basis{' '}
                  <span
                    className="font-mono tabular"
                    style={{ color: basis == null ? undefined : basis >= 0 ? PALETTE.pos : PALETTE.neg }}
                  >
                    {basis == null ? '--' : `${basis >= 0 ? '+' : ''}${formatNumber(basis, precision)}`}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {live && mode === 'BOOK_FLOW' && (
        <div className="grid grid-cols-1 gap-3 p-3 xl:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-micro uppercase tracking-[0.06em] text-ink-subtle">
              <span>Depth of market · top 20</span>
              <span>
                Imbalance{' '}
                <span
                  className="font-mono tabular"
                  style={{ color: imbalance == null ? undefined : imbalance >= 0 ? PALETTE.pos : PALETTE.neg }}
                >
                  {imbalance != null ? imbalance.toFixed(2) : '--'}
                </span>
              </span>
            </div>
            <DomLadder book={feed.book} precision={precision} />
          </div>
          <div>
            <div className="mb-1 text-micro uppercase tracking-[0.06em] text-ink-subtle">Tape · last 30 prints</div>
            <TradeTape prints={feed.tape} precision={precision} />
          </div>
        </div>
      )}
    </Panel>
  );
};
