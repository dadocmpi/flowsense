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

import React, { useMemo, useState } from 'react';
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
import { providerForInstrument } from '../core/providers';
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

const STATUS_TEXT: Record<string, string> = {
  CONNECTING: 'Connecting',
  LIVE: 'Live',
  RECONNECTING: 'Reconnecting',
  OFFLINE: 'Offline',
  UNAVAILABLE: 'Snapshot',
};

const STATUS_TONE: Record<string, string> = {
  CONNECTING: 'text-amber-400',
  LIVE: 'text-[#26a69a]',
  RECONNECTING: 'text-amber-400',
  OFFLINE: 'text-[#ef5350]',
  UNAVAILABLE: 'text-white/50',
};

const Index: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_INSTRUMENT_ID);
  const [entryDirection, setEntryDirection] = useState<EntryDirection>('LONG');
  const instrument: Instrument = useMemo(
    () => findInstrument(selectedId) ?? findInstrument(DEFAULT_INSTRUMENT_ID)!,
    [selectedId]
  );

  const feed = useInstrumentFeed(instrument);
  const { reading, selected, setSelected, history } = useMultiTimeframeCompass(feed);

  // Which instruments currently have a configured source, for the selector.
  const availability = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const candidate of [...instrumentsByGroup('FUTURES'), ...instrumentsByGroup('CRYPTO')]) {
      const provider = providerForInstrument(candidate);
      map[candidate.id] = provider ? provider.isConfigured() : false;
    }
    // The selected instrument's own feed has the freshest answer.
    map[instrument.id] = feed.configured;
    return map;
  }, [instrument.id, feed.configured]);

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
            </div>
          </div>

          <InstrumentSelector selectedId={instrument.id} onSelect={handleSelect} availability={availability} />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-panel px-4 py-6 sm:px-8 sm:py-8">
        {/* ── Unavailable / error state ────────────────────────────────── */}
        {!feed.configured && !feed.isLoading && (
          <Section title={ERROR_TITLES.NOT_CONFIGURED} subtitle={instrument.id}>
            <div className="flex flex-col gap-2">
              <p className="text-body text-white/70">
                {feed.unavailableReason ??
                  feed.error?.message ??
                  'This instrument has no configured data source.'}
              </p>
              <p className="text-label text-white/45">
                FlowSense shows nothing rather than a fabricated number. See{' '}
                <span className="font-mono text-white/70">Data source and scope</span> at the bottom of this page for
                how to configure a source.
              </p>
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
            <p className="text-body text-white/60">
              No real order flow for {instrument.id}. {feed.sourceLabel} provides candles only, and order flow is
              never estimated from candles — so this panel stays empty rather than showing a synthetic book or tape.
              Real order flow is available on the Binance crypto pairs.
            </p>
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
                <Line label="Source" value={feed.sourceLabel} />
                <Line
                  label="Continuous contract"
                  value={
                    instrument.continuousSymbol
                      ? `${instrument.continuousSymbol} (${instrument.roll?.method ?? 'frontMonth'})`
                      : 'Not applicable'
                  }
                />
                <Line
                  label="Timeframes"
                  value={`${BASE_TIMEFRAME} base, plus each timeframe fetched natively`}
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
                  <strong className="text-white/90">Real:</strong> OHLCV candles from the configured futures
                  provider, requested as a continuous front-month contract. All eight timeframes, the compass, the
                  confluence matrix and the session VWAP / POC are computed from those candles.
                </li>
                <li>
                  <strong className="text-white/90">Not available:</strong> order book depth, trade tape and
                  buy/sell split. A candle feed cannot produce a genuine aggressor split, so the order-flow panel is
                  empty for futures rather than estimated.
                </li>
                <li>
                  <strong className="text-white/90">Requires configuration:</strong> a server-side API key. Until{' '}
                  <span className="font-mono text-white/80">FUTURES_PROVIDER</span> and{' '}
                  <span className="font-mono text-white/80">FUTURES_API_KEY</span> are set, futures instruments show
                  a &ldquo;no data source configured&rdquo; state and no numbers at all.
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
