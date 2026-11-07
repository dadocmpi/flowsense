// ============================================
// ORDER BOOK LINE
// ============================================
// The RIGHT reading, as a single real-time line under the compasses. It shows
// the resting book — the size bid against the size offered — and the pressure
// percentage that falls out of it, refreshed on the book's own cadence.
//
// It draws NO number when there is no real book: an unavailable source says so,
// and a neutral 50% is never drawn in its place, because a balanced-looking bar
// would read as a real "balanced market" call.

import React from 'react';
import type { OrderFlowReading } from '../../core/types';
import { formatAge, formatCompact, formatNumber, labelShort, scoreColor } from './format';

interface OrderBookLineProps {
  /** The current resting book, or null when there is nothing to read. */
  reading: OrderFlowReading | null;
  /** Whether a book source is configured at all. */
  configured: boolean;
  /** Vendor-reported source label, for the provenance line. */
  source: string | null;
  /** Epoch ms the reading was last refreshed. */
  updatedAt: number | null;
  /** Price precision for the bid/ask figures. */
  precision: number;
  now: number;
}

export const OrderBookLine: React.FC<OrderBookLineProps> = ({
  reading,
  configured,
  source,
  updatedAt,
  precision,
  now,
}) => {
  const metrics = reading?.metrics ?? null;
  const bidShare = metrics?.bidSharePercent ?? null;
  const label = reading?.gauge.label ?? null;
  const tone = label ? scoreColor(reading!.gauge.score) : '#94a3b8';

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0b0c10] px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h3 className="text-title font-bold text-white">Order Book</h3>
          <span className="text-micro uppercase tracking-wider text-white/40">
            {configured && source ? `${source} · ${formatAge(updatedAt, now)}` : 'no source'}
          </span>
        </div>
        {reading && bidShare !== null && label && (
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-title font-black" style={{ color: tone }}>
              {bidShare.toFixed(1)}%
            </span>
            <span className="text-label font-semibold" style={{ color: tone }}>
              {labelShort(label)}
            </span>
          </div>
        )}
      </div>

      {reading && metrics && bidShare !== null ? (
        <div className="mt-2.5 flex flex-col gap-2">
          {/* Resting size split: bid (green) against ask (red), meeting at 50%. */}
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.04]"
            role="img"
            aria-label={`Resting book: ${bidShare.toFixed(1)}% bid, ${(100 - bidShare).toFixed(1)}% ask`}
          >
            <div className="h-full bg-[#26a69a]" style={{ width: `${bidShare}%` }} />
            <div className="h-full bg-[#ef5350]" style={{ width: `${100 - bidShare}%` }} />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Bid</dt>
              <dd className="font-mono text-label font-semibold text-[#4db6ac]">
                {metrics.bid !== null ? formatNumber(metrics.bid, precision) : '--'}
                {metrics.bidSize !== null && (
                  <span className="ml-1 text-micro font-normal text-white/40">{formatCompact(metrics.bidSize)}</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Ask</dt>
              <dd className="font-mono text-label font-semibold text-[#e57373]">
                {metrics.ask !== null ? formatNumber(metrics.ask, precision) : '--'}
                {metrics.askSize !== null && (
                  <span className="ml-1 text-micro font-normal text-white/40">{formatCompact(metrics.askSize)}</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Spread</dt>
              <dd className="font-mono text-label font-semibold text-white/90">
                {metrics.spreadPercent !== null ? `${metrics.spreadPercent.toFixed(3)}%` : '--'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Volume</dt>
              <dd className="font-mono text-label font-semibold text-white/90">
                {metrics.volume !== null ? formatCompact(metrics.volume) : '--'}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-2 text-label text-white/45">
          {configured
            ? 'No resting book for this instrument.'
            : 'No order book source configured.'}{' '}
          <span className="text-white/30">
            {configured
              ? 'This provider publishes no bid/ask book (Gold reads Twelve Data).'
              : 'Set ALPACA_API_KEY and ALPACA_API_SECRET to read the book.'}
          </span>
        </p>
      )}
    </section>
  );
};
