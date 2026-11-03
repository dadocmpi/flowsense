// ============================================
// CONFLUENCE COMPASS
// ============================================
// The main compass: a semicircular gauge over a -100..+100 score, the five
// STRONG SELL … STRONG BUY labels with the active one highlighted, four tabs
// (OVERALL, OSCILLATORS, MOVING AVG, FLOW), a large verdict box and the
// Sell / Neutral / Buy counters.
//
// The score is damped with an EMA and a hysteresis deadband before it is drawn,
// so the needle glides and the label cannot flicker across a cut-off. Every
// number shown is either a provider response, arithmetic over candles, or the
// live flow reading — nothing is fabricated.
//
// Every factor the compass is built from is listed, including the ones with too
// few candles to compute: those read "N/A" with the warmup they need, rather
// than silently vanishing from the list.

import React, { useMemo, useState } from 'react';
import type { GaugeReading, ScoreLabel } from '../../core/types';
import { buildGauge, labelFromScore } from '../../core/scoring';
import { gaugeRosters, type RosterRow } from '../../core/compassRoster';
import { flowScore, type FlowReading } from '../../core/tickflow';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';
import { useSmoothedGauge } from '../../hooks/useSmoothedGauge';
import { ConfluenceGauge } from './ConfluenceGauge';
import { labelShort, labelTextColor, voteTextColor, voteWord } from './format';
import { cn } from '@/lib/utils';

export type CompassView = 'OVERALL' | 'OSCILLATORS' | 'MOVING_AVG' | 'FLOW';

const VIEWS: { id: CompassView; label: string }[] = [
  { id: 'OVERALL', label: 'OVERALL' },
  { id: 'OSCILLATORS', label: 'OSCILLATORS' },
  { id: 'MOVING_AVG', label: 'MOVING AVG' },
  { id: 'FLOW', label: 'FLOW' },
];

const LABELS: { id: ScoreLabel; text: string }[] = [
  { id: 'STRONG_SELL', text: 'STRONG SELL' },
  { id: 'SELL', text: 'SELL' },
  { id: 'NEUTRAL', text: 'NEUTRAL' },
  { id: 'BUY', text: 'BUY' },
  { id: 'STRONG_BUY', text: 'STRONG BUY' },
];

interface ConfluenceCompassProps {
  /** Display name of the timeframe, e.g. "M15". */
  timeframeLabel: string;
  /** The blended technical gauge (moving averages + oscillators). */
  technical: GaugeReading;
  /** Number of candles behind the reading. */
  candleCount: number;
  /** False when there were too few candles for any reading. */
  available: boolean;
  /** Live flow reading (order flow or book), or null when no feed is connected. */
  flow: FlowReading | null;
  /** True when a flow source is connected. */
  flowConfigured: boolean;
  /** Provenance label for the flow source. */
  flowLabel: string;
}

export const ConfluenceCompass: React.FC<ConfluenceCompassProps> = ({
  timeframeLabel,
  technical,
  candleCount,
  available,
  flow,
  flowConfigured,
  flowLabel,
}) => {
  const [view, setView] = useState<CompassView>('OVERALL');
  const config = DEFAULT_COMPASS_CONFIG;

  const { movingAverages, oscillators } = useMemo(() => {
    const maDetails = technical.details.filter(detail => detail.group === 'MA');
    const oscDetails = technical.details.filter(detail => detail.group !== 'MA');
    const { movingAverages: maRows, oscillators: oscRows } = gaugeRosters(technical.details, candleCount);
    return {
      // A gauge with no details is a N/A gauge, not a score of zero.
      movingAverages: {
        gauge: maDetails.length > 0 ? buildGauge(maDetails, config.maWeights, config) : null,
        rows: maRows,
      },
      oscillators: {
        gauge: oscDetails.length > 0 ? buildGauge(oscDetails, config.indicatorWeights, config) : null,
        rows: oscRows,
      },
    };
  }, [technical, candleCount, config]);

  const flowGauge: GaugeReading | null = useMemo(() => {
    if (!flow || !flowConfigured || flow.sampleCount === 0) return null;
    const score = flowScore(flow);
    return {
      score,
      label: labelFromScore(score, config),
      tally: { buy: 0, neutral: 0, sell: 0 },
      details: [],
    };
  }, [flow, flowConfigured, config]);

  const active = useMemo(() => {
    switch (view) {
      case 'MOVING_AVG':
        return { gauge: movingAverages.gauge as GaugeReading | null, rows: movingAverages.rows as RosterRow[] };
      case 'OSCILLATORS':
        return { gauge: oscillators.gauge as GaugeReading | null, rows: oscillators.rows as RosterRow[] };
      case 'FLOW':
        return { gauge: flowGauge, rows: [] as RosterRow[] };
      default:
        return { gauge: technical as GaugeReading | null, rows: [...movingAverages.rows, ...oscillators.rows] as RosterRow[] };
    }
  }, [view, technical, movingAverages, oscillators, flowGauge]);

  const smoothed = useSmoothedGauge(active.gauge, available && active.gauge !== null, config, view);
  const score = smoothed?.score ?? 0;
  const activeLabel = smoothed?.label ?? null;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-4">
      {/* Header: title + timeframe */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-title font-bold text-white">Confluence Compass</h3>
        <span className="text-micro uppercase tracking-wider text-white/40">{timeframeLabel}</span>
      </div>

      {/* Tabs */}
      <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Compass view">
        {VIEWS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              'rounded-md border px-2.5 py-1 font-mono text-micro font-bold tracking-wide transition-colors',
              view === tab.id
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                : 'border-white/[0.08] bg-white/[0.02] text-white/55 hover:border-white/20 hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Gauge */}
      <div className="mt-3 flex flex-col items-center">
        {view === 'FLOW' && !flowConfigured ? (
          <div className="flex min-h-[150px] flex-col items-center justify-center gap-1 text-center">
            <span className="text-label font-semibold text-white/45">Sem feed de fluxo conectado</span>
            <span className="text-micro text-white/30">
              Order flow reads the live tape; Book flow reads a real order book.
            </span>
          </div>
        ) : !available || !active.gauge ? (
          <div className="flex min-h-[150px] flex-col items-center justify-center gap-1 text-center">
            <span className="text-label font-semibold text-white/45">Not enough candles</span>
            <span className="text-micro text-white/30">
              {candleCount} candles — needs {config.minCandles} for a reading.
            </span>
          </div>
        ) : (
          <ConfluenceGauge
            score={score}
            label={smoothed!.label}
            labelText={labelShort(smoothed!.label).toUpperCase()}
          />
        )}
      </div>

      {/* Five labels; the active one is highlighted. */}
      <div className="mt-3 grid grid-cols-5 gap-1">
        {LABELS.map(entry => {
          const isActive = activeLabel === entry.id;
          return (
            <span
              key={entry.id}
              className={cn(
                'rounded border px-1 py-1 text-center text-[0.5625rem] font-bold uppercase tracking-wide transition-colors',
                isActive
                  ? cn('border-transparent bg-white/[0.06]', labelTextColor(entry.id))
                  : 'border-transparent text-white/25'
              )}
            >
              {entry.text}
            </span>
          );
        })}
      </div>

      {/* Verdict box + counters */}
      {view === 'FLOW' ? (
        <FlowVerdict flow={flow} configured={flowConfigured} label={flowLabel} />
      ) : (
        <GaugeVerdict gauge={smoothed} available={available && active.gauge !== null} />
      )}

      {/* Factor list */}
      {active.rows.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-2">
          <RosterList rows={active.rows} />
        </div>
      )}
    </div>
  );
};

/** The large verdict box and the Sell / Neutral / Buy counters for a gauge. */
function GaugeVerdict({ gauge, available }: { gauge: GaugeReading | null; available: boolean }) {
  if (!available || !gauge) {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
        <span className="text-title font-black text-white/40">N/A</span>
        <p className="mt-1 text-label text-white/40">Not enough candles to compute a verdict.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('text-headline font-black leading-none', labelTextColor(gauge.label))}>
          {labelShort(gauge.label).toUpperCase()}
        </span>
        <span className="font-mono text-label text-white/45">score {Math.round(gauge.score)}</span>
      </div>
      <div className="mt-2 flex items-center gap-4 font-mono text-label">
        <span className="text-[#e57373]">Sell {gauge.tally.sell}</span>
        <span className="text-amber-400">Neutral {gauge.tally.neutral}</span>
        <span className="text-[#4db6ac]">Buy {gauge.tally.buy}</span>
      </div>
    </div>
  );
}

/** The flow tab's verdict: buyers/sellers and pressure, never a vote tally. */
function FlowVerdict({
  flow,
  configured,
  label,
}: {
  flow: FlowReading | null;
  configured: boolean;
  label: string;
}) {
  if (!configured || !flow || flow.sampleCount === 0) {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
        <span className="text-title font-black text-white/40">N/A</span>
        <p className="mt-1 text-label text-white/40">
          {configured ? 'Waiting for the first print…' : 'No flow source connected.'}
        </p>
      </div>
    );
  }

  const pressureColor =
    flow.pressure === 'HIGH' ? 'text-[#ef5350]' : flow.pressure === 'MEDIUM' ? 'text-amber-400' : 'text-white/60';

  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-headline font-black leading-none text-white">{flow.buyersPct.toFixed(0)}%</span>
        <span className="font-mono text-label text-white/45">{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-label">
        <span className="text-[#4db6ac]">Buyers {flow.buyersPct.toFixed(0)}%</span>
        <span className="text-[#e57373]">Sellers {flow.sellersPct.toFixed(0)}%</span>
        <span className={pressureColor}>Pressure {flow.pressure}</span>
      </div>
    </div>
  );
}

/** The factor list: every expected factor, with N/A for the ones still warming up. */
function RosterList({ rows }: { rows: RosterRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {rows.map(row => (
        <div
          key={row.name}
          className="flex items-baseline justify-between gap-2 border-b border-white/[0.04] py-[2px] last:border-0"
          title={
            row.available
              ? row.detail?.note ?? row.name
              : `N/A — needs ${row.minCandles} candles (${row.candleCount} available)`
          }
        >
          <span className="truncate text-micro text-white/60">{row.name}</span>
          <span className="flex items-baseline gap-2 font-mono text-micro">
            <span className="text-white/85">{row.available ? row.detail?.display : 'N/A'}</span>
            <span className={cn('w-14 text-right font-bold', row.available ? voteTextColor(row.detail!.vote) : 'text-white/30')}>
              {row.available ? voteWord(row.detail!.vote) : 'N/A'}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
