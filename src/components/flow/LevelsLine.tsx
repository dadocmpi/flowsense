// ============================================
// LEVELS LINE
// ============================================
// The price levels for an instrument with no real book: the busiest estimated
// zones drawn across the window's price range, plus the recent swing high / low
// and a marker for the last price.
//
// It is the candle-only stand-in for a book map, and it is labelled ESTIMATED.
// The bar shows where trading already happened, never where liquidity is resting.

import React from 'react';
import type { EstimatedLevels } from '../../core/priceLevels';
import { formatNumber } from '../compass/format';
import { cn } from '@/lib/utils';

interface LevelsLineProps {
  levels: EstimatedLevels;
  /** Price precision for the labels. */
  precision: number;
}

export const LevelsLine: React.FC<LevelsLineProps> = ({ levels, precision }) => {
  const { available, zones, swingHigh, swingLow, price, rangeLow, rangeHigh } = levels;
  const span = rangeHigh - rangeLow;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0b0c10] px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-title font-bold text-white">Price Levels</h3>
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-micro font-bold uppercase tracking-wider text-amber-400">
            Estimated
          </span>
        </div>
        <span className="text-micro uppercase tracking-wider text-white/40">
          {available ? `busiest zones · proxy ${levels.proxy}` : 'no levels'}
        </span>
      </div>

      {available && span > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {/* The price range, with each estimated zone shaded by its activity. */}
          <div className="relative h-4 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.02]">
            {zones.map(zone => {
              const left = ((zone.low - rangeLow) / span) * 100;
              const width = Math.max(1.5, ((zone.high - zone.low) / span) * 100);
              const opacity = 0.35 + Math.min(0.65, zone.share * 3);
              return (
                <div
                  key={`${zone.low}`}
                  className="absolute inset-y-0 bg-[#4db6ac]"
                  style={{ left: `${left}%`, width: `${width}%`, opacity }}
                  title={`Zone ${formatNumber(zone.low, precision)}–${formatNumber(zone.high, precision)} · ${(zone.share * 100).toFixed(1)}% of activity`}
                />
              );
            })}
            {/* The last price marker. */}
            <div
              className="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
              style={{ left: `${Math.max(0, Math.min(100, ((price - rangeLow) / span) * 100))}%` }}
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Swing high</dt>
              <dd className="font-mono text-label font-semibold text-[#e57373]">
                {swingHigh !== null ? formatNumber(swingHigh, precision) : '--'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Swing low</dt>
              <dd className="font-mono text-label font-semibold text-[#4db6ac]">
                {swingLow !== null ? formatNumber(swingLow, precision) : '--'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Price</dt>
              <dd className="font-mono text-label font-semibold text-white/90">{formatNumber(price, precision)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-micro uppercase tracking-wider text-white/35">Top zone</dt>
              <dd className="font-mono text-label font-semibold text-white/90">
                {zones[0] ? `${formatNumber(zones[0].mid, precision)}` : '--'}
                {zones[0] && <span className="ml-1 text-micro font-normal text-white/40">{(zones[0].share * 100).toFixed(0)}%</span>}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className={cn('mt-2 text-label text-white/45')}>
          Not enough price range to place levels yet.
        </p>
      )}
    </section>
  );
};
