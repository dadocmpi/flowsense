// ============================================
// FLOWSENSE — MAIN SCREEN
// ============================================
// Layout, top to bottom, and it fits 1920x1080 without scrolling:
//   1. the top bar: price, feed state, provenance, asset tabs, timeframe buttons
//   2. three compasses in one row — Technical indicators, Summary, Order flow
//   3. one merged "Technical indicators" table (moving averages + oscillators)
//   4. the LONG / SHORT entry check for the selected timeframe
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
import { EntryCheckPanel, type ChipState, type EntryChip } from '../components/compass/EntryCheckPanel';
import { TodayPanel } from '../components/compass/TodayPanel';
import { useNewsToday } from '../hooks/useNewsToday';
import { Section } from '../components/common/Section';
import { ALL_INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
import { TIMEFRAME_LABELS, TIMEFRAMES, type Timeframe } from '../core/types';
import { probeFuturesProvider, futuresCreditState } from '../core/providers';
import { confluenceCheck, type EntryDirection } from '../core/entryCheck';
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

/** "XAU/USD · Gold spot" — the symbol and what it really is. */
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
  const news = useNewsToday();

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
  const busy = feed.loadingTimeframes.length > 0;
  // The server's credit meter, read on each render so the daily-cap notice
  // reflects the last status/candles response. Null until it has answered once.
  const creditState = futuresCreditState();

  // The entry check reads across ALL timeframes: each loaded timeframe's Summary
  // contributes one vote, and the confluence is recomputed from what is available.
  const confluence = useMemo(() => {
    const inputs = TIMEFRAMES.map(timeframe => {
      const entry = stored.find(candidate => candidate.timeframe === timeframe);
      return {
        timeframe,
        label: entry?.reading.available ? entry.reading.summary.label : null,
      };
    });
    return confluenceCheck(entryDirection, inputs, DEFAULT_COMPASS_CONFIG);
  }, [stored, entryDirection]);

  // The chip row shows every timeframe, filled as each one arrives. The load
  // state comes from the feed (which knows what is loading, waiting or failed);
  // the reading comes from the store for a loaded timeframe.
  const chips: EntryChip[] = useMemo(() => {
    const byTimeframe = new Map(stored.map(entry => [entry.timeframe, entry]));
    return TIMEFRAMES.map(timeframe => {
      const state = feed.timeframeStates[timeframe];
      const entry = byTimeframe.get(timeframe);
      let chipState: ChipState;
      if (state?.status === 'loaded' && entry) chipState = 'READY';
      else if (state?.status === 'loading' || state?.status === 'idle') chipState = 'LOADING';
      else if (state?.status === 'waiting') chipState = 'WAITING';
      else chipState = 'NO_DATA';
      return {
        timeframe,
        state: chipState,
        scoreLabel: entry?.reading.available ? entry.reading.summary.label : null,
        updatedAt: entry?.updatedAt ?? state?.updatedAt ?? null,
      };
    });
  }, [stored, feed.timeframeStates]);

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
              {/* The data age of the live price, so a polled quote is never
                  mistaken for a tick. It is the age of the last real update. */}
              <span className="text-label text-white/35">
                {feed.lastUpdate !== null ? `data ${formatAge(feed.lastUpdate, now)}` : 'no data'}
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
              {/* The daily credit cap: a small notice at 80%, a clear stop at the
                  cap. The numbers come from the server's meter, never invented. */}
              {creditState?.dailyExhausted ? (
                <span
                  className="rounded border border-[#ef5350]/40 bg-[#ef5350]/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-[#ef5350]"
                  title={`Daily cap of ${creditState.dailyCap} credits reached (used ${creditState.dailyUsed}). Vendor calls are paused until the daily window resets.`}
                >
                  Daily cap reached — vendor calls paused
                </span>
              ) : creditState?.dailyWarn ? (
                <span
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-amber-400"
                  title={`${creditState.dailyUsed} of ${creditState.dailyCap} daily credits used.`}
                >
                  {creditState.dailyUsed}/{creditState.dailyCap} daily credits
                </span>
              ) : null}
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
                  FlowSense shows nothing rather than a fabricated number. Gold, S&amp;P 500, Dow and Nasdaq{' '}
                  need <span className="font-mono text-white/70">TWELVE_DATA_API_KEY</span> set in the deployment
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

          <div className="flex flex-col gap-3">
            <Section title="Entry check" subtitle={instrument.id} dense>
              {stored.length === 0 && !confluence.members.some(member => member.label) && feed.isLoading ? (
                <p className="py-2 text-body italic text-white/45">Loading candles…</p>
              ) : (
                <EntryCheckPanel
                  confluence={confluence}
                  direction={entryDirection}
                  onDirectionChange={setEntryDirection}
                  chips={chips}
                  now={now}
                />
              )}
            </Section>

            {/* Directly below the entry check, filling the column's empty space.
                It scrolls internally so the page itself never scrolls. */}
            <TodayPanel
              configured={news.probe?.configured ?? false}
              reachable={news.probe?.reachable ?? true}
              label={news.probe?.label ?? 'None'}
              note={news.probe?.note ?? null}
              events={news.events}
              headlines={news.headlines}
              fetchedAt={news.fetchedAt}
              loading={news.loading}
              now={now}
            />
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
