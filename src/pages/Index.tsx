// ============================================
// FLOWSENSE — MULTI-TIMEFRAME MARKET COMPASS
// ============================================
// Layout, top to bottom:
//   1. instrument selector and the selected instrument's live header
//   2. the multi-timeframe confluence matrix
//   3. the selected timeframe's three gauges, vote tables and structure read
//   4. technical metrics for the selected instrument
//   5. order flow, only where the provider has real order flow
//   6. signal history for the selected instrument and timeframe
//   7. data source and scope, stating what is real and what is unavailable
//
// No panel is collapsible: everything is visible on load.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed, BASE_TIMEFRAME, isFeedFresh } from '../hooks/useInstrumentFeed';
import { useMultiTimeframeCompass } from '../hooks/useMultiTimeframeCompass';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { ConfluenceMatrix } from '../components/compass/ConfluenceMatrix';
import { CompassGauge } from '../components/compass/CompassGauge';
import { VoteTable } from '../components/compass/VoteTable';
import { TimeframeCard } from '../components/compass/TimeframeCard';
import { TechnicalMetricsPanel } from '../components/compass/TechnicalMetricsPanel';
import { OrderFlowPanel } from '../components/compass/OrderFlowPanel';
import { SignalHistoryPanel } from '../components/compass/SignalHistoryPanel';
import { EntryCheckPanel } from '../components/compass/EntryCheckPanel';
import { Section } from '../components/common/Section';
import { DEFAULT_INSTRUMENT_ID, findInstrument, instrumentsByGroup, type Instrument } from '../core/instruments';
import { POLL_INTERVAL_MS, probeFuturesProvider, providerForInstrument } from '../core/providers';
import { checkEntry, type EntryDirection } from '../core/entryCheck';
import { TIMEFRAME_LABELS } from '../core/types';
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
  const { reading, selected, setSelected, history } = useMultiTimeframeCompass(feed);

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
    for (const candidate of instrumentsByGroup('CRYPTO')) {
      const provider = providerForInstrument(candidate);
      map[candidate.id] = provider ? provider.isConfigured() : false;
    }
    for (const candidate of instrumentsByGroup('FUTURES')) {
      map[candidate.id] = futuresConfigured ?? undefined;
    }
    // The selected instrument's own feed has the freshest answer.
    if (feed.configured) map[instrument.id] = true;
    return map;
  }, [instrument.id, feed.configured, futuresConfigured]);

  const frame = reading?.timeframes.find(t => t.timeframe === selected) ?? null;
  const fresh = isFeedFresh(feed.lastUpdate);
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
                  environment; see <span className="font-mono text-white/70">Data source and scope</span> at the bottom
                  of this page.
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

        {/* ── Confluence matrix ────────────────────────────────────────── */}
        <Section title="Multi-timeframe confluence" subtitle={`${instrument.id} · all timeframes`}>
          {reading ? (
            <ConfluenceMatrix reading={reading} selected={selected} onSelect={setSelected} />
          ) : (
            <p className="py-8 text-center text-body italic text-white/45">
              {feed.isLoading ? 'Loading candles…' : 'No candles available for this instrument.'}
            </p>
          )}
        </Section>

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

            {frame.available && (
              <Section title="Timeframe detail" subtitle={`${instrument.id} · ${selected}`}>
                <TimeframeCard reading={frame} precision={pricePrecision} quote={instrument.quote} />
              </Section>
            )}

            {frame.available && (
              <Section title="Technical metrics" subtitle={`${instrument.id} · ${selected}`}>
                <TechnicalMetricsPanel
                  metrics={frame.metrics}
                  precision={pricePrecision}
                  quote={instrument.quote}
                  session={DEFAULT_COMPASS_CONFIG.session}
                  timeframe={selected}
                  sessionMode={frame.sessionMode}
                />
              </Section>
            )}
          </>
        )}

        {/* ── Order flow, only where the provider has it ───────────────── */}
        <Section title="Order flow" subtitle={`${instrument.id} · ${feed.sourceLabel}`}>
          {feed.orderFlowAvailable ? (
            <OrderFlowPanel flow={feed.orderFlow} precision={pricePrecision} quote={instrument.quote} />
          ) : (
            <div className="flex flex-col gap-2 text-body text-white/60">
              <p>
                No real order flow for {instrument.id}. {feed.sourceLabel} provides candles
                {feed.feedMode === 'POLL' ? ' and a polled price' : ''} only, and order flow is never estimated from
                candles — so this panel stays empty rather than showing a synthetic book or tape.
              </p>
              <p className="text-label text-white/45">
                Real order flow — order book depth, trade tape and a genuine aggressor split — is available on the
                Binance crypto pairs, where the exchange publishes it directly.
              </p>
            </div>
          )}
        </Section>

        {/* ── Signal history ───────────────────────────────────────────── */}
        <Section title="Signal history" subtitle={`${instrument.id} · ${selected}`}>
          <SignalHistoryPanel
            history={history}
            instrumentId={instrument.id}
            timeframe={selected}
            precision={pricePrecision}
          />
        </Section>

        {/* ── Data source and scope ────────────────────────────────────── */}
        <Section title="Data source and scope" subtitle="What is real, and what is not available">
          <div className="space-y-6 text-body text-white/70">
            <div>
              <h3 className="mb-1 text-label font-semibold uppercase tracking-wider text-white/40">
                Current instrument
              </h3>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                <Line label="Instrument" value={`${instrument.name} (${instrument.id})`} />
                <Line label="Exchange" value={instrument.exchange} />
                <Line label="Provider" value={feed.sourceLabel} />
                <Line
                  label="Symbol in use"
                  value={
                    feed.resolvedSource
                      ? `${feed.resolvedSource.vendorSymbol ?? feed.resolvedSource.symbol} — ${feed.resolvedSource.description}`
                      : // Crypto's symbol is fixed and known before any request; only
                        // a futures symbol has to be resolved by the server.
                        instrument.group === 'CRYPTO'
                        ? instrument.providerSymbol
                        : 'Not resolved yet'
                  }
                />
                <Line
                  label="Reading"
                  value={
                    instrument.group === 'CRYPTO'
                      ? 'Spot pair, streamed live'
                      : feed.resolvedSource
                        ? feed.resolvedSource.kind === 'futures'
                          ? 'The futures contract itself'
                          : 'A proxy — not the futures contract'
                        : 'Unknown until the first request'
                  }
                />
                <Line
                  label="Price feed"
                  value={
                    feed.feedMode === 'STREAM'
                      ? 'Live stream (real ticks)'
                      : feed.feedMode === 'POLL'
                        ? `REST poll, ${POLL_INTERVAL_MS[BASE_TIMEFRAME] / 1000}s — delayed`
                        : 'None'
                  }
                />
                <Line
                  label="Market"
                  value={
                    feed.market.state === 'OPEN'
                      ? 'Open — bars arriving'
                      : feed.market.state === 'CLOSED'
                        ? `Closed — ${feed.market.reason}`
                        : 'Unknown — no bars to judge from'
                  }
                />
                <Line
                  label="Timeframes"
                  value={`${TIMEFRAME_LABELS[BASE_TIMEFRAME]} base, plus each timeframe fetched natively`}
                />
                <Line
                  label="Last update"
                  value={
                    feed.lastUpdate ? `${formatClock(feed.lastUpdate)}${fresh ? '' : ' (not streaming)'}` : 'Unavailable'
                  }
                />
              </dl>
            </div>

            <div>
              <h3 className="mb-1 text-label font-semibold uppercase tracking-wider text-white/40">
                Futures — Gold, S&P 500, Dow Jones
              </h3>
              <ul className="space-y-1.5">
                <li>
                  <strong className="text-white/90">Real:</strong> OHLCV candles from Twelve Data, requested
                  server-side so the API key never reaches the browser. All eight timeframes, the compass, the
                  confluence matrix and the session VWAP / POC are computed locally from those candles — the
                  vendor&rsquo;s own indicator endpoints are not used, which keeps the credit spend to one call per
                  symbol and timeframe.
                </li>
                <li>
                  <strong className="text-white/90">Symbol:</strong> the app tries the continuous contract first
                  (GC1!, ES1!, YM1!) and falls back to a proxy if the plan does not entitle it. When a proxy is in
                  use, it is labelled as one here and in the header — it is never presented as the futures contract.
                </li>
                <li>
                  <strong className="text-white/90">Not available:</strong> order book depth, trade tape and
                  buy/sell split. A candle feed cannot produce a genuine aggressor split, so the order-flow panel is
                  empty for futures rather than estimated.
                </li>
                <li>
                  <strong className="text-white/90">Requires configuration:</strong> a server-side API key. Until{' '}
                  <span className="font-mono text-white/80">TWELVE_DATA_API_KEY</span> is set in the deployment
                  environment, futures instruments show a &ldquo;no data source configured&rdquo; state and no
                  numbers at all. Run <span className="font-mono text-white/80">npm run check:symbols</span> to see
                  which symbols your plan entitles.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 text-label font-semibold uppercase tracking-wider text-white/40">
                Crypto — Binance USDT pairs
              </h3>
              <ul className="space-y-1.5">
                <li>
                  <strong className="text-white/90">Real:</strong> candles, a live combined WebSocket stream
                  (ticker, open kline, partial book depth, aggregated trades) and a genuine per-candle taker-buy
                  split. No API key is used or needed.
                </li>
                <li>
                  <strong className="text-white/90">Order flow:</strong> the depth panel and tape come from
                  Binance&rsquo;s own book and trades, with the exchange&rsquo;s aggressor flag deciding each
                  trade&rsquo;s side.
                </li>
                <li>
                  <strong className="text-white/90">Caveat:</strong> the live buy/sell split covers trades received
                  since the stream opened, not the whole session; the candle-window cumulative delta is a separate
                  figure and is labelled as such.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 text-label font-semibold uppercase tracking-wider text-white/40">
                Session boundary
              </h3>
              <p>
                For futures, VWAP, the session high/low and the volume point of control reset at the start of the
                current session ({DEFAULT_COMPASS_CONFIG.session.mode === 'RTH'
                  ? 'regular trading hours'
                  : 'full session'}
                , {DEFAULT_COMPASS_CONFIG.session.timezone}). The reset time is shown next to the metrics.
              </p>
              <p className="mt-2">
                Crypto trades continuously and has no session open, so its VWAP, range and POC are measured over the
                fetched candle window instead — the panel labels the window start rather than implying a session that
                does not exist.
              </p>
            </div>

            <p className="border-t border-white/[0.06] pt-4 text-label text-white/45">
              Every number on this page is either a provider response or arithmetic over one. Where a figure is not
              available it reads as unavailable — nothing here is simulated.
            </p>
          </div>
        </Section>
      </main>

      <footer className="border-t border-white/[0.04] px-4 py-6 sm:px-8">
        <p className="mx-auto max-w-[1400px] text-micro text-white/30">
          FlowSense — analysis only. Not investment advice.
        </p>
      </footer>
    </div>
  );
};

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.04] py-1.5">
      <dt className="text-white/45">{label}</dt>
      <dd className="font-mono text-white/85">{value}</dd>
    </div>
  );
}

export default Index;
