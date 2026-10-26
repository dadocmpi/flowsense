// ============================================
// FLOWSENSE — SINGLE-COMPASS MARKET VIEW
// ============================================
// One screen, no scrolling:
//   1. the top bar: logo, asset buttons, live price with daily change, status
//      dot and the last update time
//   2. a two-column body: the compass (timeframe buttons above one large gauge)
//      on the left, the entry check on the right
//   3. a one-line footer with the data source, the symbol actually used and the
//      last update time
//
// The compass shows the Summary gauge only. The moving-average votes and the
// indicator votes still feed that score exactly as before — only the display
// changed. Every timeframe is still computed because the entry check reads all
// of them.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed } from '../hooks/useInstrumentFeed';
import { useMultiTimeframeCompass } from '../hooks/useMultiTimeframeCompass';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { TimeframeButtons } from '../components/compass/TimeframeButtons';
import { CompassGauge } from '../components/compass/CompassGauge';
import { EntryCheckPanel } from '../components/compass/EntryCheckPanel';
import { Section } from '../components/common/Section';
import { ALL_INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
import { probeFuturesProvider } from '../core/providers';
import { checkEntry, type EntryDirection } from '../core/entryCheck';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';
import { TIMEFRAMES, type Timeframe } from '../core/types';
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
  UNAVAILABLE: 'Delayed',
};

const STATUS_TONE: Record<string, string> = {
  CONNECTING: 'text-amber-400',
  LIVE: 'text-[#26a69a]',
  RECONNECTING: 'text-amber-400',
  OFFLINE: 'text-[#ef5350]',
  UNAVAILABLE: 'text-amber-400',
};

const ASSET_STORAGE_KEY = 'flowsense:asset';
const TIMEFRAME_STORAGE_KEY = 'flowsense:timeframe';

/** Read a persisted value, ignoring anything unavailable or malformed. */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A blocked or full storage is not worth interrupting the app for.
  }
}

/** The persisted timeframe, or M15 when nothing valid was stored. */
function readStoredTimeframe(): Timeframe {
  const stored = readStored(TIMEFRAME_STORAGE_KEY);
  return stored && (TIMEFRAMES as string[]).includes(stored) ? (stored as Timeframe) : '15m';
}

/** "GC1! · Gold futures (continuous)" — the symbol and what it really is. */
function sourceDetail(feed: ReturnType<typeof useInstrumentFeed>): string | null {
  const resolved = feed.resolvedSource;
  if (!resolved) return null;
  const symbol = resolved.vendorSymbol ?? resolved.symbol;
  return `${symbol} · ${resolved.description}`;
}

const Index: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(() => {
    const stored = readStored(ASSET_STORAGE_KEY);
    return stored && findInstrument(stored) ? stored : DEFAULT_INSTRUMENT_ID;
  });
  const [entryDirection, setEntryDirection] = useState<EntryDirection>('LONG');
  const [initialTimeframe] = useState<Timeframe>(readStoredTimeframe);

  const instrument: Instrument = useMemo(
    () => findInstrument(selectedId) ?? findInstrument(DEFAULT_INSTRUMENT_ID)!,
    [selectedId]
  );

  const feed = useInstrumentFeed(instrument);
  const { reading, selected, setSelected } = useMultiTimeframeCompass(feed, DEFAULT_COMPASS_CONFIG, initialTimeframe);

  // Persist the last choices so a reload comes back where the user left off.
  useEffect(() => {
    writeStored(ASSET_STORAGE_KEY, instrument.id);
  }, [instrument.id]);

  useEffect(() => {
    writeStored(TIMEFRAME_STORAGE_KEY, selected);
  }, [selected]);

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

  // Daily change against the previous daily close, from the provider's own 1D
  // bars. No daily history means no change to show, not a guessed one.
  const dailyChange = useMemo(() => {
    const daily = feed.seriesByTimeframe['1D'];
    if (!daily || daily.length < 2 || feed.price <= 0) return null;
    const previousClose = daily[daily.length - 2].close;
    if (!(previousClose > 0)) return null;
    const change = feed.price - previousClose;
    return { change, percent: (change / previousClose) * 100 };
  }, [feed.seriesByTimeframe, feed.price]);

  const blocked = (!feed.configured && !feed.isLoading) || (feed.error && feed.candles.length === 0 && !feed.isLoading);

  const statusLabel = feed.market.state === 'CLOSED' ? 'Closed' : STATUS_TEXT[feed.streamStatus] ?? feed.streamStatus;
  const statusTone =
    feed.market.state === 'CLOSED' ? 'text-amber-400' : STATUS_TONE[feed.streamStatus] ?? 'text-white/50';
  const detail = sourceDetail(feed);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050608] font-sans text-white selection:bg-amber-500/30">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/[0.04] bg-[#07080a]/95 px-[clamp(1rem,2vw,2.5rem)] py-[clamp(0.5rem,1.2vh,1rem)]">
        <div className="flex flex-wrap items-center justify-between gap-x-[clamp(1rem,2vw,2.5rem)] gap-y-2">
          <div className="flex items-baseline gap-3">
            <span className="font-black tracking-tight" style={{ fontSize: 'clamp(1.1rem,1.5vw,1.6rem)' }}>
              FlowSense
            </span>
            <span className="hidden text-label text-white/40 lg:inline">Multi-timeframe market compass</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-[clamp(0.9rem,2vw,2.25rem)] gap-y-2">
            <InstrumentSelector selectedId={instrument.id} onSelect={setSelectedId} availability={availability} />

            <div className="flex items-baseline gap-2">
              <span className="font-mono font-bold" style={{ fontSize: 'clamp(1.1rem,1.6vw,1.75rem)' }}>
                {feed.price > 0 ? formatNumber(feed.price, pricePrecision) : '--'}
              </span>
              {dailyChange ? (
                <span
                  className={cn(
                    'font-mono text-label font-semibold',
                    dailyChange.change >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'
                  )}
                >
                  {dailyChange.change >= 0 ? '+' : ''}
                  {formatNumber(dailyChange.change, pricePrecision)} ({dailyChange.percent >= 0 ? '+' : ''}
                  {dailyChange.percent.toFixed(2)}%)
                </span>
              ) : (
                <span className="font-mono text-label text-white/30">--</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className={cn('text-label font-bold', statusTone)}>● {statusLabel}</span>
              <span className="font-mono text-label text-white/40">{formatClock(feed.lastUpdate)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {blocked ? (
        <main className="flex min-h-0 flex-1 items-center justify-center px-[clamp(1rem,2vw,2.5rem)] py-6">
          <div className="w-full max-w-2xl">
            {!feed.configured && !feed.isLoading ? (
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
            ) : (
              <Section
                title={ERROR_TITLES[feed.error?.kind ?? 'UNKNOWN'] ?? ERROR_TITLES.UNKNOWN}
                subtitle={instrument.id}
              >
                <p className="text-body text-white/70">{feed.error?.message}</p>
              </Section>
            )}
          </div>
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-[65fr_35fr] gap-[clamp(0.75rem,1.5vw,2rem)] px-[clamp(1rem,2vw,2.5rem)] py-[clamp(0.75rem,1.6vh,1.5rem)]">
          {/* Compass column */}
          <section className="flex min-h-0 flex-col items-center justify-center gap-[clamp(0.5rem,1.5vh,1.5rem)]">
            <TimeframeButtons selected={selected} onSelect={setSelected} />

            {frame && frame.available ? (
              <CompassGauge gauge={frame.summary} />
            ) : (
              <p className="px-6 py-8 text-center text-body italic text-white/45">
                {frame
                  ? `${frame.candleCount} candles on ${selected} — not enough to compute a reading (needs ${DEFAULT_COMPASS_CONFIG.minCandles}).`
                  : feed.isLoading
                    ? 'Loading candles…'
                    : 'No candles available for this instrument.'}
              </p>
            )}
          </section>

          {/* Entry check column */}
          <section className="flex min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-[clamp(0.75rem,1.2vw,1.5rem)]">
            {entryCheck ? (
              <EntryCheckPanel result={entryCheck} direction={entryDirection} onDirectionChange={setEntryDirection} />
            ) : (
              <p className="m-auto text-center text-body italic text-white/45">Waiting for the timeframe readings…</p>
            )}
          </section>
        </main>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-white/[0.04] px-[clamp(1rem,2vw,2.5rem)] py-[clamp(0.3rem,0.7vh,0.5rem)]">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro text-white/35">
          <span className="uppercase tracking-wider text-white/25">Source</span>
          <span className="font-mono text-white/55">{feed.sourceLabel}</span>
          {detail && (
            <>
              <span className="text-white/20">·</span>
              <span className="font-mono text-white/55">{detail}</span>
            </>
          )}
          {feed.resolvedSource?.kind === 'proxy' && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-amber-400">
              Proxy
            </span>
          )}
          <span className="text-white/20">·</span>
          <span>Updated {formatClock(feed.lastUpdate)}</span>
        </p>
      </footer>
    </div>
  );
};

export default Index;
