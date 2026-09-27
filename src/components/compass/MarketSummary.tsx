import React from 'react';
import { MarketDataState } from '../../types/trading';
import { cn } from '@/lib/utils';
import { marketStateLabel } from '../../lib/labels';

interface MarketSummaryProps {
  data: MarketDataState;
  marketState: string;
  /** Rendered with the technical metrics, under the data source heading. */
  advancedExtras?: React.ReactNode;
}

function formatPrice(value: number, precision: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-2 text-body last:border-0">
      <span className="text-white/50">{label}</span>
      <span className={cn('font-mono text-white/90', tone)}>{value}</span>
    </div>
  );
}

/**
 * The one summary block. Price, change and the market state are front and
 * centre; every secondary metric renders below them, always expanded, so no
 * figure is hidden behind a toggle.
 */
export const MarketSummary: React.FC<MarketSummaryProps> = ({
  data,
  marketState,
  advancedExtras,
}) => {
  const lastCandle = data.candles[data.candles.length - 1];
  const isUp = data.percentChange >= 0;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-panel sm:p-panel-lg">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-label text-white/50">
            <span>{data.name}</span>
            <span className="text-white/20">•</span>
            <span className="font-mono">{data.symbol}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-data-lg font-bold text-white">
              {data.price > 0 ? formatPrice(data.price, data.precision) : '--'}
            </span>
            <span className={cn('font-mono text-data font-bold', isUp ? 'text-green-400' : 'text-red-500')}>
              {isUp ? '+' : ''}{data.percentChange.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1 font-mono text-label text-white/40">
            {data.change >= 0 ? '+' : ''}{data.change.toFixed(data.precision)} {data.currency} today
          </div>
        </div>

        <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
          <span className="text-label font-semibold text-white/70">{marketStateLabel(marketState)}</span>
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.06] pt-5">
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 md:gap-y-0">
          <div>
            <h4 className="mb-1 text-label font-semibold uppercase tracking-wider text-white/40">Technical metrics</h4>
            <Metric label="Average true range (14)" value={data.atr !== null ? formatPrice(data.atr, data.precision) : 'Unavailable'} />
            <Metric label="Volume-weighted average price" value={data.vwap !== null ? formatPrice(data.vwap, data.precision) : 'Unavailable'} />
            <Metric label="Volume point of control" value={data.pointOfControl !== null ? formatPrice(data.pointOfControl, data.precision) : 'Unavailable'} />
            <Metric label="Session range" value={`${formatPrice(data.low, data.precision)} – ${formatPrice(data.high, data.precision)}`} />
            <Metric label="Candle volume" value={lastCandle && lastCandle.volume > 0 ? lastCandle.volume.toLocaleString() : 'Unavailable'} />
          </div>

          <div>
            <h4 className="mb-1 text-label font-semibold uppercase tracking-wider text-white/40">Data source</h4>
            {advancedExtras}
          </div>
        </div>
      </div>
    </section>
  );
};
