// ============================================
// FLOWSENSE — SINGLE-SCREEN MARKET COMPASS
// ============================================
// One screen, no scrolling. Top bar (asset, timeframe, price); three columns —
// the timeframe list on the left, the main compass in the centre and the entry
// check on the right; one small provenance line at the bottom.
//
// Every number shown is a provider response or arithmetic over one. Where data
// is unavailable the app says so rather than showing a fabricated figure.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed } from '../hooks/useInstrumentFeed';
import { useMultiTimeframeCompass } from '../hooks/useMultiTimeframeCompass';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { TimeframeSelector } from '../components/compass/TimeframeSelector';
import { TimeframeList } from '../components/compass/TimeframeList';
import { CompassGauge } from '../components/compass/CompassGauge';
import { EntryCheckPanel } from '../components/compass/EntryCheckPanel';
import { DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
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

/** The status dot: what the feed is actually doing, stated plainly. */
function statusOf(feed: ReturnType<typeof useInstrumentFeed>): { label: string; tone: string } {
  if (feed.market.state === 'CLOSED') return { label: 'Closed', tone: 'bg-amber-500' };
  if (feed.feedMode === 'POLL' || feed.streamStatus === 'UNAVAILABLE') {
    return { label: 'Delayed', tone: 'bg-amber-500' };
  }
  if (feed.streamStatus === 'LIVE') return { label: 'Live', tone: 'bg-[#26a69a]' };
  if (feed.streamStatus === 'OFFLINE') return { label: 'Offline', tone: 'bg-[#ef5350]' };
  return { label: 'Connecting', tone: 'bg-white/40' };
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
  // selector would mark every tab unavailable until it is opened.
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
  const availability = useMemo(() => {
    const map: Record<string, boolean | undefined> = {};
    map[instrument.id] = futuresConfigured ?? undefined;
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

  // Daily change: the live price against the previous daily close.
  const dailyChange = useMemo(() => {
    const daily = feed.seriesByTimeframe['1D'];
    if (!daily || daily.length < 2) return null;
    const previousClose = daily[daily.length - 2].close;
    const last = feed.price > 0 ? feed.price : daily[daily.length - 1].close;
    if (!Number.isFinite(previousClose) || previousClose === 0 || !Number.isFinite(last)) return null;
    const change = last - previousClose;
    return { change, percent: (change / previousClose) * 100 };
  }, [feed.seriesByTimeframe, feed.price]);

  const status = statusOf(feed);
  const isProxy = feed.resolvedSource?.kind === 'proxy';

  // Why the centre cannot show a reading, when it cannot.
  const unavailableMessage = !feed.configured && !feed.isLoading
    ? feed.unavailableReason ?? feed.error?.message ?? 'This instrument has no configured data source.'
    : feed.error && feed.candles.length === 0 && !feed.isLoading
      ? feed.error.message
      : null;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#050608] font-sans text-white selection:bg-amber-500/30">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-6 border-b border-white/[0.06] px-6 py-3">
        <span className="text-title font-black tracking-tight">FlowSense</span>

        <InstrumentSelector selectedId={instrument.id} onSelect={setSelectedId} availability={availability} />

        <div className="h-6 w-px bg-white/10" />

        <TimeframeSelector selected={selected} onSelect={setSelected} />

        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-data-lg font-bold leading-none text-white">
              {feed.price > 0 ? formatNumber(feed.price, pricePrecision) : '--'}
            </span>
            <span className="text-label font-normal text-white/40">{instrument.quote}</span>
          </div>

          <div
            className={cn(
              'font-mono text-data font-bold',
              !dailyChange
                ? 'text-white/30'
                : dailyChange.change >= 0
                  ? 'text-[#4db6ac]'
                  : 'text-[#e57373]'
            )}
          >
            {dailyChange
              ? `${dailyChange.change >= 0 ? '+' : ''}${formatNumber(dailyChange.change, pricePrecision)} (${dailyChange.percent >= 0 ? '+' : ''}${dailyChange.percent.toFixed(2)}%)`
              : '--'}
          </div>

          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', status.tone)} aria-hidden />
            <span className="text-label font-bold text-white/70">{status.label}</span>
          </div>

          <span className="font-mono text-label text-white/40">{formatClock(feed.lastUpdate)}</span>
        </div>
      </header>

      {/* ── Three columns ─────────────────────────────────────────────────── */}
      <main className="grid min-h-0 flex-1 grid-cols-[22rem_1fr_24rem] gap-6 px-6 py-5">
        {/* LEFT: the only place every timeframe appears */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/[0.06] bg-[#0b0c10] p-4">
          {reading ? (
            <TimeframeList reading={reading} selected={selected} onSelect={setSelected} />
          ) : (
            <p className="m-auto text-body italic text-white/40">
              {feed.isLoading ? 'Loading candles…' : 'No candles available.'}
            </p>
          )}
        </section>

        {/* CENTRE: the dominant compass */}
        <section className="flex min-h-0 flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0b0c10] px-6">
          {frame && frame.available ? (
            <CompassGauge gauge={frame.summary} />
          ) : (
            <div className="max-w-lg text-center">
              <p className="text-title font-bold text-white/80">
                {unavailableMessage ? ERROR_TITLES[feed.error?.kind ?? 'NOT_CONFIGURED'] ?? ERROR_TITLES.UNKNOWN : 'Reading unavailable'}
              </p>
              <p className="mt-3 text-body text-white/55">
                {unavailableMessage ??
                  (feed.isLoading
                    ? 'Loading candles…'
                    : `Not enough candles on ${selected} to compute a reading.`)}
              </p>
            </div>
          )}
        </section>

        {/* RIGHT: the entry check */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/[0.06] bg-[#0b0c10] p-5">
          {entryCheck ? (
            <EntryCheckPanel result={entryCheck} direction={entryDirection} onDirectionChange={setEntryDirection} />
          ) : (
            <p className="m-auto text-body italic text-white/40">Entry check unavailable.</p>
          )}
        </section>
      </main>

      {/* ── Provenance line ───────────────────────────────────────────────── */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-6 py-2 text-micro text-white/35">
        <span className="font-mono text-white/50">{feed.sourceLabel}</span>
        {feed.resolvedSource && (
          <>
            <span>·</span>
            <span className="font-mono text-white/50">
              {feed.resolvedSource.vendorSymbol ?? feed.resolvedSource.symbol}
            </span>
            {isProxy && <span className="font-bold text-amber-400">proxy</span>}
            <span>·</span>
            <span className="font-mono">{feed.resolvedSource.description}</span>
          </>
        )}
        <span className="ml-auto font-mono">Updated {formatClock(feed.lastUpdate)}</span>
      </footer>
    </div>
  );
};

export default Index;
