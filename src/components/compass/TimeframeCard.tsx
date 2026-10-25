// ============================================
// TIMEFRAME CARD
// ============================================
// One timeframe's three gauges plus its market-structure and metrics read.

import React from 'react';
import type { TimeframeReading } from '../../core/types';
import { CompassGauge } from './CompassGauge';
import { formatNumber } from './format';

interface TimeframeCardProps {
  reading: TimeframeReading;
  precision: number;
  /** The instrument's quote currency, for the metric labels. */
  quote: string;
}

function StructureLine({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-1.5 text-label last:border-0">
      <span className="text-white/45">{label}</span>
      <span className={`font-mono ${tone ?? 'text-white/85'}`}>{value}</span>
    </div>
  );
}

const ZONE_LABEL: Record<string, string> = {
  PREMIUM: 'Premium',
  DISCOUNT: 'Discount',
  EQUILIBRIUM: 'Equilibrium',
  UNKNOWN: 'Unknown',
};

const ZONE_TONE: Record<string, string> = {
  PREMIUM: 'text-[#e57373]',
  DISCOUNT: 'text-[#4db6ac]',
  EQUILIBRIUM: 'text-amber-400',
  UNKNOWN: 'text-white/50',
};

function bosLabel(value: 'BULLISH' | 'BEARISH' | null): string {
  if (value === 'BULLISH') return 'Bullish';
  if (value === 'BEARISH') return 'Bearish';
  return 'None';
}

function bosTone(value: 'BULLISH' | 'BEARISH' | null): string {
  if (value === 'BULLISH') return 'text-[#4db6ac]';
  if (value === 'BEARISH') return 'text-[#e57373]';
  return 'text-white/45';
}

export const TimeframeCard: React.FC<TimeframeCardProps> = ({ reading, precision, quote }) => {
  const { structure, metrics } = reading;

  if (!reading.available) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-panel">
        <div className="flex items-baseline justify-between">
          <h3 className="text-title font-bold text-white">{reading.timeframe}</h3>
          <span className="text-label text-white/40">{reading.candleCount} candles</span>
        </div>
        <p className="mt-4 text-body italic text-white/50">
          Not enough candles on this timeframe to compute a reading.
        </p>
      </div>
    );
  }

  const priceText = formatNumber(reading.price, precision);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-title font-bold text-white">{reading.timeframe}</h3>
        <span className="font-mono text-label text-white/50">
          {priceText} {quote}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CompassGauge title="Moving averages" gauge={reading.movingAverages} size="sm" />
        <CompassGauge title="Technical indicators" gauge={reading.indicators} size="sm" />
        <CompassGauge title="Summary" gauge={reading.summary} size="sm" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-6 border-t border-white/[0.06] pt-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-micro font-semibold uppercase tracking-wider text-white/40">Market structure</h4>
          <StructureLine
            label="Last break of structure"
            value={bosLabel(structure.lastBos)}
            tone={bosTone(structure.lastBos)}
          />
          <StructureLine
            label="Last change of character"
            value={bosLabel(structure.lastChoch)}
            tone={bosTone(structure.lastChoch)}
          />
          <StructureLine
            label="Zone"
            value={ZONE_LABEL[structure.zone]}
            tone={ZONE_TONE[structure.zone]}
          />
          <StructureLine
            label="Swing range"
            value={
              structure.rangeHigh !== null && structure.rangeLow !== null
                ? `${formatNumber(structure.rangeLow, precision)} – ${formatNumber(structure.rangeHigh, precision)}`
                : 'Unavailable'
            }
          />
        </div>

        <div>
          <h4 className="mb-1 text-micro font-semibold uppercase tracking-wider text-white/40">
            Technical metrics
          </h4>
          <StructureLine label="ATR (14)" value={metrics.atr !== null ? formatNumber(metrics.atr, precision) : '--'} />
          <StructureLine label="Session VWAP" value={metrics.vwap !== null ? formatNumber(metrics.vwap, precision) : '--'} />
          <StructureLine
            label="Session high / low"
            value={
              metrics.sessionHigh !== null && metrics.sessionLow !== null
                ? `${formatNumber(metrics.sessionLow, precision)} – ${formatNumber(metrics.sessionHigh, precision)}`
                : '--'
            }
          />
          <StructureLine
            label="Volume POC"
            value={metrics.pointOfControl !== null ? formatNumber(metrics.pointOfControl, precision) : '--'}
          />
        </div>
      </div>
    </div>
  );
};
