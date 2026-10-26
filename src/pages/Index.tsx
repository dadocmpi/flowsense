// ============================================
// FLOWSENSE — MULTI-TIMEFRAME MARKET COMPASS
// ============================================
// Layout, top to bottom:
//   1. instrument selector and the selected instrument's live header
//   2. the multi-timeframe confluence matrix
//   3. the selected timeframe's three gauges, vote tables and structure read
//   4. technical metrics for the selected instrument
//
// No panel is collapsible: everything is visible on load.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed } from '../hooks/useInstrumentFeed';
import { useMultiTimeframeCompass } from '../hooks/useMultiTimeframeCompass';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { CompassGauge } from '../components/compass/CompassGauge';
import { VoteTable } from '../components/compass/VoteTable';
import { EntryCheckPanel } from '../components/compass/EntryCheckPanel';
import { Section } from '../components/common/Section';
import { ALL_INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
import { probeFuturesProvider } from '../core/providers';
import { checkEntry, type EntryDirection } from '../core/entryCheck';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';
import { formatClock, formatNumber } from '../components/compass/format';
import { cn } from '@/lib/utils';

const ERROR_TITLES: Record<string, string> = {
  NOT_CONFIGURED: 'No data source configured',
  UNSUPPORTED_INSTRUMENT: 'Instrument not supported by this source',
  GEO_BLOCKED: 'Data source unavailable in this region',
  RATE_LIMIT: 'Data source rate limit reached',
  SYMBOL_NOT_FOUND: 'Symbol unavailable',
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
};

const STATUS_TONE: Record<string, string> = {
  CONNECTING: 'text-amber-400',
  LIVE: 'text-[#26a69a]',
  RECONNECTING: 'text-amber-400',
  OFFLINE: 'text-[#ef5350]',
  UNAVAILABLE: 'text-amber-400',
};

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
  const instrument: Instrument = useMemo(
    () => findInstrument(selectedId) ?? findInstrument(DEFAULT_INSTRUMENT_ID)!,
    [selectedId]
  );

  const feed = useInstrumentFeed(instrument);
  const { reading, selected, setSelected } = useMultiTimeframeCompass(feed);

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

  const frame = reading?.timeframes.find(t => t.timeframe === selected) ?? null;
  const pricePrecision = instrument.precision;

  // The entry check reads every timeframe's summary, so it answers "does the
  // market agree with the trade I am about to take?" across the whole board.
  const entryCheck = useMemo(
    () =>
      reading
        ? checkEntry(
            entryDirection,
            reading.timeframes.map(tf => ({
              timeframe: tf.timeframe,
              label: tf.summary.label,
              score: tf.summary.score,
              available: tf.available,
            })),
            DEFAULT_COMPASS_CONFIG
          )
        : null,
    [reading, entryDirection]
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen w-full bg-[#050608] font-sans text-white selection:bg-amber-500/30">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.04] bg-[#07080a]/95 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="text-title font-black tracking-tight">FlowSense</span>
              <span className="text-label text-white/40">Multi-timeframe market compass</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-label">
              <span className="text-white/45">
                {instrument.name} <span className="text-white/25">· {instrument.exchange}</span>
              </span>
              <span className="font-mono text-data font-bold text-white">
                {feed.price > 0 ? formatNumber(feed.price, pricePrecision) : '--'}
                <span className="ml-1 text-label font-normal text-white/40">{instrument.quote}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn('font-bold', STATUS_TONE[feed.streamStatus])}>
                  ● {STATUS_TEXT[feed.streamStatus] ?? feed.streamStatus}
                </span>
                <span className="font-mono text-white/40">{formatClock(feed.lastUpdate)}</span>
              </span>
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

          <InstrumentSelector selectedId={instrument.id} onSelect={handleSelect} availability={availability} />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-panel px-4 py-6 sm:px-8 sm:py-8">
        {/* ── Unavailable / error state ────────────────────────────────── */}
        {!feed.configured && !feed.isLoading && (
          <Section
            title={feed.sourceReachable ? ERROR_TITLES.NOT_CONFIGURED : UNREACHABLE_TITLE}
            subtitle={instrument.id}
          >
            <div className="flex flex-col gap-2">
              <p className="text-body text-white/70">
                {feed.unavailableReason ??
                  feed.error?.message ??
                  'This instrument has no configured data source.'}
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
          <Section title={ERROR_TITLES[feed.error.kind] ?? ERROR_TITLES.UNKNOWN} subtitle={instrument.id}>
            <p className="text-body text-white/70">{feed.error.message}</p>
          </Section>
        )}

        {/* ── Entry check ──────────────────────────────────────────────── */}
        {entryCheck && (
          <Section title="Entry check" subtitle={`${instrument.id} · does the market agree?`}>
            <EntryCheckPanel result={entryCheck} direction={entryDirection} onDirectionChange={setEntryDirection} />
          </Section>
        )}

        {/* ── Selected timeframe: gauges, tables, structure ────────────── */}
        {frame && (
          <>
            <Section title="Compass" subtitle={`${instrument.id} · ${selected}`}>
              {frame.available ? (
                <>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    <CompassGauge title="Moving averages" gauge={frame.movingAverages} size="lg" />
                    <CompassGauge title="Technical indicators" gauge={frame.indicators} size="lg" />
                    <CompassGauge title="Summary" gauge={frame.summary} size="lg" />
                  </div>

                  <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-2 text-title font-bold text-white">Moving averages</h3>
                      <VoteTable details={frame.movingAverages.details} valueHeading="Level" />
                    </div>
                    <div>
                      <h3 className="mb-2 text-title font-bold text-white">Technical indicators</h3>
                      <VoteTable details={frame.indicators.details} valueHeading="Value" />
                    </div>
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-body italic text-white/45">
                  {frame.candleCount} candles on {selected} — not enough to compute a reading (needs{' '}
                  {DEFAULT_COMPASS_CONFIG.minCandles}).
                </p>
              )}
            </Section>
          </>
        )}

      </main>

      <footer className="border-t border-white/[0.04] px-4 py-6 sm:px-8">
        <p className="mx-auto max-w-[1400px] text-micro text-white/30">
          FlowSense — analysis only. Not investment advice.
        </p>
      </footer>
    </div>
  );
};

export default Index;
