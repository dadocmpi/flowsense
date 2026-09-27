import React, { useState } from 'react';
import { ChevronDown, Radio } from 'lucide-react';
import { MarketDataState, DataQualityScore } from '../../types/trading';
import { cn } from '@/lib/utils';
import { dataLabelText, marketStateLabel } from '../../lib/labels';

interface MarketSummaryProps {
  data: MarketDataState;
  dataQuality: DataQualityScore;
  dataLabel: 'LIVE' | 'DELAYED' | 'CACHED' | 'SIMULATED' | 'UNAVAILABLE';
  marketState: string;
  /** Rendered inside the Advanced details area, below the technical metrics. */
  advancedExtras?: React.ReactNode;
}

function formatPrice(value: number, precision: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

const FEED_TONE: Record<string, string> = {
  LIVE: 'bg-green-400',
  DELAYED: 'bg-amber-400',
  CACHED: 'bg-blue-400',
  SIMULATED: 'bg-purple-400',
  UNAVAILABLE: 'bg-red-500',
};

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-2 text-sm last:border-0">
      <span className="text-white/50">{label}</span>
      <span className={cn('font-mono text-white/90', tone)}>{value}</span>
    </div>
  );
}

/**
 * The one summary block. Price and change are front and centre with a live
 * status indicator; every secondary metric lives behind the Advanced details
 * toggle so it does not compete with the compass.
 */
export const MarketSummary: React.FC<MarketSummaryProps> = ({
  data,
  dataQuality,
  dataLabel,
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

        <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
          <Radio className={cn('h-3.5 w-3.5', dataLabel === 'LIVE' ? 'text-green-400' : 'text-white/40')} />
          <span className={cn('h-2 w-2 rounded-full', FEED_TONE[dataLabel] ?? 'bg-white/40', dataLabel === 'LIVE' && 'animate-pulse')} />
          <span className="text-xs font-semibold text-white/70">{dataLabelText(dataLabel)}</span>
          <span className="text-xs text-white/30">•</span>
          <span className="text-xs text-white/50">{marketStateLabel(marketState)}</span>
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
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/40">Data quality</h4>
              <Metric
                label="Overall quality"
                value={`${dataQuality.overall}%`}
                tone={dataQuality.overall >= 80 ? 'text-green-400' : dataQuality.overall >= 60 ? 'text-amber-400' : 'text-red-500'}
              />
              <Metric label="Source" value={dataQuality.metrics.source === 'BINANCE' ? 'Binance' : 'Unavailable'} />
              <Metric label="Status" value={dataQuality.metrics.freshness === 'LIVE' ? 'Live' : dataQuality.metrics.freshness.toLowerCase()} />
              <Metric label="Last bar" value={data.datetime || 'Unavailable'} />
              <Metric label="Candles loaded" value={String(data.candles.length)} />
            </div>
          </div>

          {advancedExtras && <div className="mt-6 border-t border-white/[0.06] pt-6">{advancedExtras}</div>}
        </div>
      )}
    </section>
  );
};
