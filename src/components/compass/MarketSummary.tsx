import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MarketDataState } from '../../types/trading';
import { cn } from '@/lib/utils';
import { marketStateLabel } from '../../lib/labels';

interface MarketSummaryProps {
  data: MarketDataState;
  marketState: string;
  /** Rendered inside the Advanced details area, below the technical metrics. */
  advancedExtras?: React.ReactNode;
}

function formatPrice(value: number, precision: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-2 text-sm last:border-0">
      <span className="text-white/50">{label}</span>
      <span className={cn('font-mono text-white/90', tone)}>{value}</span>
    </div>
  );
}

/**
 * The one summary block. Price, change and the market state are front and
 * centre; every secondary metric lives behind the Advanced details toggle so it
 * does not compete with the compass.
 */
export const MarketSummary: React.FC<MarketSummaryProps> = ({
  data,
  marketState,
  advancedExtras,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const lastCandle = data.candles[data.candles.length - 1];
  const isUp = data.percentChange >= 0;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span>{data.name}</span>
            <span className="text-white/20">•</span>
            <span className="font-mono">{data.symbol}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold text-white sm:text-4xl">
              {data.price > 0 ? formatPrice(data.price, data.precision) : '--'}
            </span>
            <span className={cn('font-mono text-lg font-bold', isUp ? 'text-green-400' : 'text-red-500')}>
              {isUp ? '+' : ''}{data.percentChange.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-white/40">
            {data.change >= 0 ? '+' : ''}{data.change.toFixed(data.precision)} {data.currency} today
          </div>
        </div>

        <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
          <span className="text-xs font-semibold text-white/70">{marketStateLabel(marketState)}</span>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen(prev => !prev)}
        className="mt-5 flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.04]"
      >
        <span>{advancedOpen ? 'Hide details' : 'Advanced details'}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
      </button>

      {advancedOpen && (
        <div className="pt-4">
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/40">Technical metrics</h4>
              <Metric label="Average true range (14)" value={data.atr !== null ? formatPrice(data.atr, data.precision) : 'Unavailable'} />
              <Metric label="Volume-weighted average price" value={data.vwap !== null ? formatPrice(data.vwap, data.precision) : 'Unavailable'} />
              <Metric label="Volume point of control" value={data.pointOfControl !== null ? formatPrice(data.pointOfControl, data.precision) : 'Unavailable'} />
              <Metric label="Session range" value={`${formatPrice(data.low, data.precision)} – ${formatPrice(data.high, data.precision)}`} />
              <Metric label="Candle volume" value={lastCandle && lastCandle.volume > 0 ? lastCandle.volume.toLocaleString() : 'Unavailable'} />
            </div>

            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/40">Data source</h4>
              {advancedExtras}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
