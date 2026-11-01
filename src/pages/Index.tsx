// ============================================
// FLOWSENSE — MAIN SCREEN
// ============================================
// Layout, top to bottom, and it fits 1920x1080 without scrolling:
//   1. the top bar: price, feed state, provenance, asset tabs, timeframe buttons
//   2. the LONG / SHORT entry check, FULL WIDTH, always visible
//   3. three compasses in one row — Technical indicators, Summary, Order flow
//   4. one merged "Technical indicators" table (moving averages + oscillators),
//      full width
//
// There is no multi-timeframe confluence grid, no timeframe-detail panel and no
// separate technical-metrics panel any more. Nothing is collapsible: everything
// renders expanded on load.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed } from '../hooks/useInstrumentFeed';
import { useTimeframeReadings } from '../hooks/useTimeframeReadings';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { TimeframeButtons } from '../components/compass/TimeframeButtons';
import { CompassCard } from '../components/compass/CompassCard';
import { TechnicalTable } from '../components/compass/TechnicalTable';
import { EntryCheckPanel } from '../components/compass/EntryCheckPanel';
import { Section } from '../components/common/Section';
import { ALL_INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
import { TIMEFRAME_LABELS, TIMEFRAMES, type Timeframe } from '../core/types';
import { probeFuturesProvider } from '../core/providers';
import { checkEntry, type EntryDirection, type EntryTimeframeInput } from '../core/entryCheck';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';
import {
  formatAge,
  formatClock,
  formatNumber,
  formatSigned,
  formatSignedPercent,
} from '../components/compass/format';
import { cn } from '@/lib/utils';

const ERROR_TITLES: Record<string, string> = {
  NOT_CONFIGURED: 'No data source configured',
  UNSUPPORTED_INSTRUMENT: 'Instrument not supported by this source',
  GEO_BLOCKED: 'Data source unavailable in this region',
  RATE_LIMIT: 'Data source rate limit reached',
  CREDIT_LIMIT: 'Waiting for credits',
  SYMBOL_NOT_FOUND: 'Symbol not available on current plan',
  NETWORK: 'Network error',
  UPSTREAM: 'Data source error',
  UNKNOWN: 'Unexpected error',
};

/** Shown instead of "no data source configured" when the route itself is unreachable. */
const UNREACHABLE_TITLE = 'Data source unreachable';

const STATUS_TEXT: Record<string, string> = {
  CONNECTING: 'Connecting',
  LIVE: 'Live',
  RECONNECTING: 'Reconnecting',
  OFFLINE: 'Offline',
  // The provider has candles but no live feed; the price is a REST poll, so it
  // is delayed by definition and must not be dressed as a live tick.
  UNAVAILABLE: 'Delayed (polling)',
  RATE_LIMITED: 'Rate limit',
};

const STATUS_TONE: Record<string, string> = {
  CONNECTING: 'text-amber-400',
  LIVE: 'text-[#26a69a]',
  RECONNECTING: 'text-amber-400',
  OFFLINE: 'text-[#ef5350]',
  UNAVAILABLE: 'text-amber-400',
  RATE_LIMITED: 'text-amber-400',
};

/**
 * "Rate limit — retrying in 12s". Our own wording, never the vendor's raw text:
 * the raw message is an internal detail, and the countdown is the useful part.
 */
function RateLimitNotice({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.ceil((until - now) / 1_000));
  return <span className="font-bold text-amber-400">Rate limit — retrying in {seconds}s</span>;
}

/** "GC1! · Gold futures (continuous)" — the symbol and what it really is. */
function sourceDetail(feed: ReturnType<typeof useInstrumentFeed>): string | null {
  const resolved = feed.resolvedSource;
  if (!resolved) return null;
  const symbol = resolved.vendorSymbol ?? resolved.symbol;
  return `${symbol} · ${resolved.description}`;
}

const Index: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_INSTRUMENT_ID);
  const [entryDirection, setEntryDirection] = useState<EntryDirection>('LONG');
  // The timeframe the user is looking at. It is the only timeframe the feed
  // fetches on load; the rest load on demand when selected.
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');
  const instrument: Instrument = useMemo(
    () => findInstrument(selectedId) ?? findInstrument(DEFAULT_INSTRUMENT_ID)!,
    [selectedId]
  );

  const feed = useInstrumentFeed(instrument, selectedTimeframe);
  const { current, stored, orderFlow } = useTimeframeReadings(feed, selectedTimeframe);

  // Ages are shown live ("updated 42s ago"), so a one-second tick drives them.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Whether the futures source is configured is a server-side fact. The feed
  // only asks for the selected instrument, so ask once here too: otherwise the
  // selector would mark every futures tab unavailable until it is opened.
  const [futuresConfigured, setFuturesConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    probeFuturesProvider(controller.signal)
      .then(result => {
        if (active) setFuturesConfigured(result.configured);
      })
      .catch(() => {
        if (active) setFuturesConfigured(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  // Which instruments currently have a configured source, for the selector.
  // A futures entry stays `undefined` until the probe answers: marking every
  // futures tab unavailable before we know would be a guess, not a fact.
  const availability = useMemo(() => {
    const map: Record<string, boolean | undefined> = {};
    for (const candidate of ALL_INSTRUMENTS) {
      map[candidate.id] = futuresConfigured ?? undefined;
    }
    // The selected instrument's own feed has the freshest answer.
    if (feed.configured) map[instrument.id] = true;
    return map;
  }, [instrument.id, feed.configured, futuresConfigured]);

  const frame = current?.reading ?? null;
  const pricePrecision = instrument.precision;
  const timeframeLabel = TIMEFRAME_LABELS[selectedTimeframe];
  // Only the selected timeframe's own request blocks the buttons. Disabling them
  // for the whole seven-request load would lock the user out of the control they
  // need while it runs.
  const busy = feed.loadingTimeframes.includes(selectedTimeframe);
  const loadedCount = feed.loadedTimeframes.length;

  // A timeframe that failed for a NON-credit reason is named, with our own
  // wording, rather than silently reading "No data". A partial failure — one
  // timeframe not on the plan — must not be hidden behind a chip.
  const failedTimeframes = TIMEFRAMES.map(timeframe => ({
    timeframe,
    status: feed.timeframeStatus[timeframe],
  })).filter(
    entry =>
      entry.status?.state === 'ERROR' &&
      entry.status.error !== null &&
      entry.status.error.kind !== 'RATE_LIMIT' &&
      entry.status.error.kind !== 'CREDIT_LIMIT'
  );

  // The entry check reads EVERY timeframe's summary for the selected asset, so
  // it answers "does the market agree with the trade I am about to take?" across
  // the whole board. A timeframe that has not arrived yet is reported as loading
  // rather than as no data.
  const entryCheck = useMemo(() => {
    const byTimeframe = new Map(stored.map(entry => [entry.timeframe, entry]));
    const readings: EntryTimeframeInput[] = TIMEFRAMES.map(timeframe => {
      const status = feed.timeframeStatus[timeframe];
      const entry = byTimeframe.get(timeframe);
      const loading =
        !entry && (status?.state === 'IDLE' || status?.state === 'LOADING' || status?.state === 'WAITING_FOR_CREDITS');
      return {
        timeframe,
        label: entry?.reading.summary.label ?? 'NEUTRAL',
        score: entry?.reading.summary.score ?? 0,
        available: entry?.reading.available ?? false,
        loading,
      };
    });
    return checkEntry(entryDirection, readings, DEFAULT_COMPASS_CONFIG);
  }, [stored, entryDirection, feed.timeframeStatus]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const change = frame?.change ?? null;
  const changePercent = frame?.changePercent ?? null;
  const changeTone =
    change === null
      ? 'text-white/50'
      : change > 0
        ? 'text-[#26a69a]'
        : change < 0
          ? 'text-[#ef5350]'
          : 'text-white/70';
  const changeLabel = frame?.changeBasis === 'SESSION' ? 'Session' : 'Window';

  const orderFlowMetrics = frame?.orderFlow?.metrics ?? null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#050608] font-sans text-white selection:bg-amber-500/30">
      {/* ── Top bar: price, feed state, provenance, tabs, timeframes ────── */}
      <header className="z-50 w-full border-b border-white/[0.04] bg-[#07080a]/95 px-4 py-2.5 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-[1840px] flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-title font-black tracking-tight">FlowSense</span>
              <span className="text-label text-white/40">
                {instrument.name} <span className="text-white/25">· {instrument.exchange}</span>
              </span>
              <span className="font-mono text-data font-bold text-white">
                {feed.price > 0 ? formatNumber(feed.price, pricePrecision) : '--'}
                <span className="ml-1 text-label font-normal text-white/40">{instrument.quote}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label">
              <span className="flex items-center gap-1.5">
                {feed.stale && feed.rateLimitedUntil !== null ? (
                  <RateLimitNotice until={feed.rateLimitedUntil} />
                ) : (
                  <span className={cn('font-bold', STATUS_TONE[feed.streamStatus])}>
                    ● {STATUS_TEXT[feed.streamStatus] ?? feed.streamStatus}
                  </span>
                )}
                <span className="font-mono text-white/40">{formatClock(feed.lastUpdate)}</span>
              </span>
              {/* A blocked fetch leaves the last real series on screen. Say so
                  plainly rather than letting it pass as current. */}
              {feed.stale && (
                <span
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-amber-400"
                  title="The credit limit blocked a fresh fetch; this is the last series we loaded."
                >
                  Stale
                </span>
              )}
              {/* A closed market is stated plainly: the reading below it is the
                  last real one, not a live one. */}
              {feed.market.state === 'CLOSED' && (
                <span className="font-bold text-amber-400" title={feed.market.reason}>
                  Market closed
                </span>
              )}
            </div>
          </div>

          {/* What we are really reading. A proxy is called a proxy, never the
              futures contract. */}
          {sourceDetail(feed) && (
            <div className="flex flex-wrap items-center gap-2 text-label text-white/45">
              <span className="uppercase tracking-wider text-white/30">Source</span>
              <span className="font-mono text-white/70">{feed.sourceLabel}</span>
              <span className="text-white/25">·</span>
              <span className="font-mono text-white/70">{sourceDetail(feed)}</span>
              {feed.resolvedSource?.kind === 'proxy' && (
                <span
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-amber-400"
                  title="This is a proxy for the futures contract, not the contract itself."
                >
                  Proxy
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <InstrumentSelector selectedId={instrument.id} onSelect={handleSelect} availability={availability} />
            <div className="flex flex-wrap items-center gap-3">
              <TimeframeButtons selected={selectedTimeframe} onSelect={setSelectedTimeframe} busy={busy} />
              <span className="text-micro text-white/35">
                {busy ? 'Loading…' : `${timeframeLabel} · ${loadedCount}/7 timeframes loaded`}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1840px] flex-1 flex-col gap-3 px-4 py-4 sm:px-8">
        {/* ── Unavailable / error state ────────────────────────────────── */}
        {!feed.configured && !feed.isLoading && (
          <Section
            title={feed.sourceReachable ? ERROR_TITLES.NOT_CONFIGURED : UNREACHABLE_TITLE}
            subtitle={instrument.id}
            dense
          >
            <div className="flex flex-col gap-2">
              <p className="text-body text-white/70">
                {feed.unavailableReason ?? feed.error?.message ?? 'This instrument has no configured data source.'}
              </p>
              {feed.sourceReachable ? (
                <p className="text-label text-white/45">
                  FlowSense shows nothing rather than a fabricated number. Gold, S&amp;P 500 and Dow need{' '}
                  <span className="font-mono text-white/70">TWELVE_DATA_API_KEY</span> set in the deployment
                  environment.
                </p>
              ) : (
                <p className="text-label text-white/45">
                  The server route that holds the API key did not answer. On a local dev server the{' '}
                  <span className="font-mono text-white/70">api/</span> functions are not running — use{' '}
                  <span className="font-mono text-white/70">vercel dev</span>. In production this is a network or
                  deployment problem, not a missing key.
                </p>
              )}
            </div>
          </Section>
        )}

        {/* A configured source can still fail; that is a real error, not a
            missing one, so it is reported separately. */}
        {feed.configured && feed.error && !feed.isLoading && feed.candles.length === 0 && (
          <Section title={ERROR_TITLES[feed.error.kind] ?? ERROR_TITLES.UNKNOWN} subtitle={instrument.id} dense>
            <p className="text-body text-white/70">{feed.error.message}</p>
          </Section>
        )}

        {/* ── Entry check, full width, directly above the compasses ──────
            Always visible: the LONG / SHORT switch never disappears, and a
            timeframe still loading reads "Loading" rather than "No data". */}
        <Section title="Entry check" subtitle={`${instrument.id} · does the market agree?`} dense>
          <EntryCheckPanel
            result={entryCheck}
            direction={entryDirection}
            onDirectionChange={setEntryDirection}
          />

          {failedTimeframes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-white/[0.06] pt-3">
              <span className="text-micro font-semibold uppercase tracking-wider text-amber-400">
                Timeframes unavailable
              </span>
              {failedTimeframes.map(({ timeframe, status }) => (
                <span key={timeframe} className="text-label text-white/55">
                  <span className="font-mono text-white/70">{TIMEFRAME_LABELS[timeframe]}</span>{' '}
                  — {ERROR_TITLES[status!.error!.kind] ?? ERROR_TITLES.UNKNOWN}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* ── Three compasses in one row ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <CompassCard
            title="Technical indicators"
            subtitle={timeframeLabel}
            gauge={frame?.available ? frame.technical : null}
            figures={
              frame?.available
                ? [
                    { label: 'MAs', value: `${frame.technical.details.filter(d => d.group === 'MA').length}` },
                    { label: 'Osc', value: `${frame.technical.details.filter(d => d.group !== 'MA').length}` },
                    { label: 'Buy', value: `${frame.technical.tally.buy}`, tone: 'text-[#4db6ac]' },
                    { label: 'Sell', value: `${frame.technical.tally.sell}`, tone: 'text-[#e57373]' },
                    { label: 'Neutral', value: `${frame.technical.tally.neutral}` },
                    { label: 'Score', value: `${Math.round(frame.technical.score)}` },
                  ]
                : [
                    { label: 'Candles', value: `${frame?.candleCount ?? 0}` },
                    { label: 'Needed', value: `${DEFAULT_COMPASS_CONFIG.minCandles}` },
                  ]
            }
            unavailableText={frame ? 'Not enough candles' : feed.isLoading ? 'Loading candles…' : 'No data'}
            unavailableHint={
              frame && !frame.available
                ? `${frame.candleCount} candles on ${timeframeLabel} — needs ${DEFAULT_COMPASS_CONFIG.minCandles} for a reading.`
                : undefined
            }
          />

          <CompassCard
            title="Summary"
            subtitle={timeframeLabel}
            gauge={frame?.available ? frame.summary : null}
            figures={[
              {
                label: 'Last price',
                value: frame && frame.price > 0 ? formatNumber(frame.price, pricePrecision) : '--',
              },
              {
                label: `Change (${changeLabel})`,
                value: change !== null ? formatSigned(change, pricePrecision) : '--',
                tone: changeTone,
              },
              {
                label: 'Change %',
                value: changePercent !== null ? formatSignedPercent(changePercent) : '--',
                tone: changeTone,
              },
              { label: 'Updated', value: formatAge(current?.updatedAt ?? null, now) },
              { label: 'Candles', value: frame ? `${frame.candleCount}` : '--' },
              { label: 'Order flow', value: orderFlow?.configured ? 'included' : 'none' },
            ]}
            unavailableText={frame ? 'Not enough candles' : feed.isLoading ? 'Loading candles…' : 'No data'}
          />

          <CompassCard
            title="Order flow"
            subtitle={orderFlow?.configured ? orderFlow.label : 'none'}
            gauge={frame?.orderFlow?.gauge ?? null}
            figures={[
              {
                label: 'Delta',
                value: orderFlowMetrics?.delta != null ? formatNumber(orderFlowMetrics.delta, 0) : '--',
              },
              {
                label: 'CVD',
                value: orderFlowMetrics?.cvd != null ? formatNumber(orderFlowMetrics.cvd, 0) : '--',
              },
              {
                label: 'Imbalance',
                value: orderFlowMetrics?.imbalance != null ? orderFlowMetrics.imbalance.toFixed(2) : '--',
              },
              {
                label: 'Absorption',
                value:
                  orderFlowMetrics?.absorption != null
                    ? `${Math.round(orderFlowMetrics.absorption * 100)}%`
                    : '--',
              },
            ]}
            unavailableText="No order flow source configured"
            unavailableHint="Twelve Data has no order-flow data. Set ORDERFLOW_PROVIDER and ORDERFLOW_API_KEY to add one."
          />
        </div>

        {/* ── The merged table, full width ─────────────────────────────── */}
        <Section title="Technical indicators" subtitle={`${instrument.id} · ${timeframeLabel}`} dense>
          {frame?.available ? (
            <TechnicalTable details={frame.technical.details} />
          ) : (
            <p className="py-2 text-body italic text-white/45">
              {feed.isLoading
                ? 'Loading candles…'
                : frame
                  ? `Not enough candles on ${timeframeLabel} to compute a reading.`
                  : 'No data for this timeframe.'}
            </p>
          )}
        </Section>

      </main>

      <footer className="border-t border-white/[0.04] px-4 py-3 sm:px-8">
        <p className="mx-auto max-w-[1840px] text-micro text-white/30">
          FlowSense — analysis only. Not investment advice.
        </p>
      </footer>
    </div>
  );
};

export default Index;
