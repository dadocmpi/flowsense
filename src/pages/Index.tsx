// ============================================
// FLOWSENSE — MAIN SCREEN
// ============================================
// Layout, top to bottom, and it fits 1920x1080 without scrolling:
//   1. the top bar: price, feed state, provenance, asset tabs, timeframe buttons
//   2. three compasses in one row — Technical indicators, Summary, Order flow
//   3. one merged "Technical indicators" table (moving averages + oscillators)
//   4. the LONG / SHORT entry check for the selected timeframe
//
// The right compass is REAL order flow from the configured venue (Alpaca). When
// the venue has no market for the instrument, or cannot be reached, the card says
// so and draws no gauge — it never falls back to a candle-derived estimate.
//
// There is no multi-timeframe confluence grid, no timeframe-detail panel and no
// separate technical-metrics panel. Nothing is collapsible: everything renders
// expanded on load.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed } from '../hooks/useInstrumentFeed';
import { useTimeframeReadings } from '../hooks/useTimeframeReadings';
import { useOrderFlow } from '../hooks/useOrderFlow';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { TimeframeButtons } from '../components/compass/TimeframeButtons';
import { CompassCard } from '../components/compass/CompassCard';
import { TechnicalTable } from '../components/compass/TechnicalTable';
import { EntryCheckPanel, type EntryChip } from '../components/compass/EntryCheckPanel';
import { OrderFlowPanel, type FlowMode } from '../components/flow/OrderFlowPanel';
import { Section } from '../components/common/Section';
import { ALL_INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
import { TIMEFRAME_LABELS, TIMEFRAMES, type Timeframe } from '../core/types';
import { probeFuturesProvider, providerConfiguredState } from '../core/providers';
import { checkEntry, type EntryCompassInput, type EntryDirection } from '../core/entryCheck';
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
  SYMBOL_NOT_FOUND: 'Symbol unavailable',
  SUBSCRIPTION: 'Feed not included in the subscription',
  AUTH: 'Data source credentials rejected',
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
  // The provider serves candles and the price tracks the latest bar. The exact
  // transport (a socket or a poll) is not surfaced as a fault.
  UNAVAILABLE: 'Live',
  RATE_LIMITED: 'Rate limit',
};

const STATUS_TONE: Record<string, string> = {
  CONNECTING: 'text-amber-400',
  LIVE: 'text-[#26a69a]',
  RECONNECTING: 'text-amber-400',
  OFFLINE: 'text-[#ef5350]',
  UNAVAILABLE: 'text-[#26a69a]',
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

const Index: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_INSTRUMENT_ID);
  const [entryDirection, setEntryDirection] = useState<EntryDirection>('LONG');
  // The order-flow mode. Book Flow is offered only when the venue publishes a
  // real book; otherwise Order Flow is the only mode and no toggle is rendered.
  const [flowMode, setFlowMode] = useState<FlowMode>('ORDER_FLOW');
  // The timeframe the user is looking at. It is the only timeframe the feed
  // fetches on load; the rest load on demand when selected.
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');
  const instrument: Instrument = useMemo(
    () => findInstrument(selectedId) ?? findInstrument(DEFAULT_INSTRUMENT_ID)!,
    [selectedId]
  );

  const feed = useInstrumentFeed(instrument, selectedTimeframe);
  // Order flow is a SEPARATE provider, so it is read on its own and handed to
  // the reading store for the selected timeframe.
  const orderFlow = useOrderFlow(instrument, selectedTimeframe);
  const { current, stored } = useTimeframeReadings(feed, selectedTimeframe, orderFlow.reading);

  // Ages are shown live ("updated 42s ago"), so a one-second tick drives them.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Whether each provider is configured is a server-side fact. The feed only
  // asks for the selected instrument, so ask once here too: otherwise the
  // selector would mark every asset of an unconfigured provider as available.
  const [providerConfigured, setProviderConfigured] = useState<Record<'twelvedata' | 'alpaca', boolean> | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    probeFuturesProvider(controller.signal)
      .then(result => {
        if (!active) return;
        const perProvider = providerConfiguredState();
        setProviderConfigured(perProvider ?? { twelvedata: result.configured, alpaca: result.configured });
      })
      .catch(() => {
        if (active) setProviderConfigured({ twelvedata: false, alpaca: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  // Which instruments currently have a configured source, for the selector.
  // An entry stays `undefined` until the probe answers: marking every asset
  // unavailable before we know would be a guess, not a fact.
  const availability = useMemo(() => {
    const map: Record<string, boolean | undefined> = {};
    for (const candidate of ALL_INSTRUMENTS) {
      map[candidate.id] = providerConfigured ? providerConfigured[candidate.providerId] : undefined;
    }
    // The selected instrument's own feed has the freshest answer.
    if (feed.configured) map[instrument.id] = true;
    return map;
  }, [instrument.id, feed.configured, providerConfigured]);

  const frame = current?.reading ?? null;
  const pricePrecision = instrument.precision;
  const timeframeLabel = TIMEFRAME_LABELS[selectedTimeframe];
  const busy = feed.loadingTimeframes.length > 0;

  // What the configured order-flow venue can supply FOR THIS INSTRUMENT, as
  // resolved by the hook (venue capability AND a live reading). The venue is a
  // server-side fact, so it is never a hardcoded vendor.
  const flowCapabilities = orderFlow.capabilities;
  // A venue change that removes the book must not leave Book Flow selected.
  useEffect(() => {
    if (!flowCapabilities.hasOrderBook && flowMode === 'BOOK_FLOW') setFlowMode('ORDER_FLOW');
  }, [flowCapabilities.hasOrderBook, flowMode]);

  // The entry check reads the three compasses of the SELECTED timeframe only.
  // The order-flow compass is the real venue reading, or absent when the venue
  // has nothing for this instrument — it is never an estimate.
  const entryCheck = useMemo(() => {
    if (!frame) return null;
    const flowLabel = frame.orderFlow?.gauge.label ?? null;
    const compasses: EntryCompassInput[] = [
      { key: 'technical', label: 'Technical indicators', scoreLabel: frame.available ? frame.technical.label : null },
      { key: 'summary', label: 'Summary', scoreLabel: frame.available ? frame.summary.label : null },
      { key: 'orderFlow', label: 'Order flow', scoreLabel: frame.available ? flowLabel : null },
    ];
    return checkEntry(entryDirection, compasses, DEFAULT_COMPASS_CONFIG);
  }, [frame, entryDirection]);

  // The chip row is filled from timeframes the store has loaded. An unloaded
  // timeframe is reported as not loaded and is never fetched here. A timeframe
  // whose market is closed is marked so and excluded from the agreement figure.
  const chips: EntryChip[] = useMemo(() => {
    const byTimeframe = new Map(stored.map(entry => [entry.timeframe, entry]));
    return TIMEFRAMES.map(timeframe => {
      const entry = byTimeframe.get(timeframe);
      const market = feed.timeframeMarket[timeframe];
      const marketClosed = market?.state === 'CLOSED';
      return {
        timeframe,
        scoreLabel: entry?.reading.available ? entry.reading.summary.label : null,
        updatedAt: entry?.updatedAt ?? null,
        marketClosed,
        marketReason: marketClosed ? market?.reason : undefined,
      };
    });
  }, [stored, feed.timeframeMarket]);

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
                ) : feed.market.state === 'CLOSED' ? (
                  // A closed market is the plain truth, not a feed fault: the
                  // reading below is the last real close, and it must not read as
                  // an error.
                  <span className="font-bold text-amber-400" title={feed.market.reason}>
                    ● Market closed
                  </span>
                ) : (
                  <span className={cn('font-bold', STATUS_TONE[feed.streamStatus])}>
                    ● {STATUS_TEXT[feed.streamStatus] ?? feed.streamStatus}
                  </span>
                )}
                <span className="font-mono text-white/40">{formatClock(feed.lastUpdate)}</span>
              </span>
              {/* A blocked fetch leaves the last real series on screen. Say so
                  plainly rather than letting it pass as current. A closed market
                  is not stale, so it never earns this badge. */}
              {feed.stale && feed.market.state !== 'CLOSED' && (
                <span
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-amber-400"
                  title="The credit limit blocked a fresh fetch; this is the last series we loaded."
                >
                  Stale
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <InstrumentSelector selectedId={instrument.id} onSelect={handleSelect} availability={availability} />
            <div className="flex flex-wrap items-center gap-3">
              <TimeframeButtons selected={selectedTimeframe} onSelect={setSelectedTimeframe} busy={busy} />
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
                  FlowSense shows nothing rather than a fabricated number. Gold needs{' '}
                  <span className="font-mono text-white/70">TWELVE_DATA_API_KEY</span>; the S&amp;P 500, Dow and
                  Nasdaq assets need <span className="font-mono text-white/70">ALPACA_API_KEY</span> and{' '}
                  <span className="font-mono text-white/70">ALPACA_API_SECRET</span> set in the deployment
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

        {/* ── The three compasses in one row ──────────────────────────────
            The right slot is the real Order Flow card, driven by the configured
            venue. With no venue, or none with a market for this instrument, the
            card says so and draws no gauge. */}
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
              {
                label: 'Order flow',
                value: orderFlow.reading ? 'real' : 'none',
                tone: orderFlow.reading ? undefined : 'text-white/40',
              },
            ]}
            unavailableText={frame ? 'Not enough candles' : feed.isLoading ? 'Loading candles…' : 'No data'}
          />

          <OrderFlowPanel
            reading={orderFlow.reading}
            capabilities={flowCapabilities}
            mode={flowMode}
            onModeChange={setFlowMode}
            venueLabel={orderFlow.probe?.label ?? 'Order flow'}
            unavailableText={
              orderFlow.probe?.configured
                ? 'Feed unavailable'
                : orderFlow.state === 'LOADING'
                  ? 'Loading order flow…'
                  : 'No order flow source'
            }
            unavailableHint={
              orderFlow.reading
                ? undefined
                : orderFlow.note ??
                  (orderFlow.probe && !orderFlow.probe.configured
                    ? 'Set ALPACA_API_KEY/ALPACA_API_SECRET to enable order flow.'
                    : undefined)
            }
            precision={pricePrecision}
          />
        </div>

        {/* ── Below the compasses: the merged table and the entry check ──
            The table takes two thirds and the entry check one third. They sit
            side by side rather than stacked because the whole screen has to fit
            1920x1080 without scrolling, and this is the arrangement that keeps
            every row of the table and the full entry check on screen at once. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
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
          </div>

          <div>
            <Section title="Entry check" subtitle={`${instrument.id} · ${timeframeLabel}`} dense>
              {entryCheck ? (
                <EntryCheckPanel
                  result={entryCheck}
                  direction={entryDirection}
                  onDirectionChange={setEntryDirection}
                  chips={chips}
                  timeframeLabel={timeframeLabel}
                />
              ) : (
                <p className="py-2 text-body italic text-white/45">
                  {feed.isLoading ? 'Loading candles…' : 'No reading for this timeframe yet.'}
                </p>
              )}
            </Section>
          </div>
        </div>

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
