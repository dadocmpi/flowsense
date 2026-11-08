// ============================================
// FLOWSENSE — MAIN SCREEN
// ============================================
// Layout, top to bottom, and it fits 1920x1080 without scrolling:
//   1. the top bar: price, session change, market-status pill, the asset
//      selector and the timeframe selector as segmented controls
//   2. the Trend Summary strip: the multi-timeframe picture (M1 -> 1D) in one row
//   3. three compasses in one row — Signal Gauge, Summary, Order Flow
//   4. one merged "Indicator Detail" table (moving averages + oscillators)
//      beside the LONG / SHORT entry check, at the SAME height
//
// The right compass is REAL order flow from the venue configured for the asset.
// When the venue has no market for the instrument, or cannot be reached, the card
// says so and draws no bar — it never falls back to a candle-derived estimate.
//
// There is no multi-timeframe confluence grid, no timeframe-detail panel and no
// separate technical-metrics panel. Nothing is collapsible except the table's
// low-value "More" density control; all primary data renders on load.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed } from '../hooks/useInstrumentFeed';
import { useTimeframeReadings } from '../hooks/useTimeframeReadings';
import { useOrderFlow } from '../hooks/useOrderFlow';
import { useFlowShift } from '../hooks/useFlowShift';
import { useThrottledValue } from '../hooks/useThrottledValue';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { TimeframeButtons } from '../components/compass/TimeframeButtons';
import { CompassCard } from '../components/compass/CompassCard';
import { TechnicalTable } from '../components/compass/TechnicalTable';
import { EntryCheckPanel, type EntryChip } from '../components/compass/EntryCheckPanel';
import { TrendSummaryStrip, type TrendCell } from '../components/compass/TrendSummaryStrip';
import { OrderFlowPanel, type FlowMode } from '../components/flow/OrderFlowPanel';
import { Panel } from '../components/common/Panel';
import { Pill, type PillTone } from '../components/common/Pill';
import { Skeleton, SkeletonLines } from '../components/common/Skeleton';
import { ALL_INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
import { TIMEFRAME_LABELS, TIMEFRAMES, type Timeframe } from '../core/types';
import { probeFuturesProvider, providerConfiguredState } from '../core/providers';
import { checkEntry, type EntryCompassInput, type EntryDirection } from '../core/entryCheck';
import { flowStateFromImbalance } from '../core/orderflow';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';
import {
  changeGlyph,
  formatAge,
  formatClock,
  formatNumber,
  formatSigned,
  formatSignedPercent,
  formatTime,
} from '../components/compass/format';
import { usEquitySessionState } from '../core/marketSessions';
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
  UNAVAILABLE: 'Live',
  RATE_LIMITED: 'Rate limit',
};

const STATUS_TONE: Record<string, PillTone> = {
  CONNECTING: 'warn',
  LIVE: 'buy',
  RECONNECTING: 'warn',
  OFFLINE: 'sell',
  UNAVAILABLE: 'buy',
  RATE_LIMITED: 'warn',
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
  return <span className="font-medium text-warn">Rate limit — retrying in {seconds}s</span>;
}

/**
 * The market-status pill: Open / Closed / Pre-market, with the exchange time and
 * the viewer's local time. The exchange clock is ET for the US-equity assets
 * (Alpaca) and the viewer's own local time for spot Gold, whose session follows
 * the viewer's clock.
 */
function MarketStatusPill({
  isEquity,
  now,
}: {
  isEquity: boolean;
  now: number;
}) {
  const state = useMemo(() => {
    if (!isEquity) return { open: true, reason: 'Spot Gold trades continuously' };
    return usEquitySessionState(now);
  }, [isEquity, now]);

  const exchangeLabel = isEquity ? 'ET' : null;
  const exchangeTime = useMemo(
    () =>
      isEquity
        ? new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/New_York',
          }).format(now)
        : null,
    [isEquity, now]
  );
  const localTime = formatTime(now);

  // Pre-market: an equity before 09:30 ET on a weekday, not a holiday.
  const preMarket = useMemo(() => {
    if (!isEquity) return false;
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
      timeZone: 'America/New_York',
    }).formatToParts(now);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
    const weekday = get('weekday');
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    return hour * 60 + minute < 9 * 60 + 30;
  }, [isEquity, now]);

  const tone: PillTone = state.open ? 'buy' : preMarket ? 'warn' : 'muted';
  const word = state.open ? 'Open' : preMarket ? 'Pre-market' : 'Closed';
  const glyph = state.open ? '●' : '○';

  return (
    <Pill tone={tone} glyph={glyph} title={state.reason}>
      {word}
      {exchangeTime && exchangeLabel ? ` · ${exchangeTime} ${exchangeLabel}` : ''}
      {` · ${localTime} local`}
    </Pill>
  );
}

const Index: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_INSTRUMENT_ID);
  const [entryDirection, setEntryDirection] = useState<EntryDirection>('LONG');
  const [flowMode, setFlowMode] = useState<FlowMode>('FLOW');
  const [flowWindow, setFlowWindow] = useState<'1m' | '5m' | '15m'>('5m');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');
  const instrument: Instrument = useMemo(
    () => findInstrument(selectedId) ?? findInstrument(DEFAULT_INSTRUMENT_ID)!,
    [selectedId]
  );

  const feed = useInstrumentFeed(instrument, selectedTimeframe);
  const orderFlow = useOrderFlow(instrument, selectedTimeframe, flowWindow);
  const { current, stored } = useTimeframeReadings(feed, selectedTimeframe, orderFlow.reading);

  // The strength bar is throttled to ~2 updates/second so a burst of venue
  // updates cannot make it flicker.
  const throttledReading = useThrottledValue(orderFlow.reading, 500);

  // Dominance and the "flow turning" alert, from the same thresholds as the bar.
  const flowState = useMemo(() => {
    const session = throttledReading?.session ?? null;
    if (!session) return null;
    return flowStateFromImbalance(session.imbalance);
  }, [throttledReading]);
  const shiftAlert = useFlowShift(flowState?.state ?? null);

  // Ages are shown live ("updated 42s ago"), so a one-second tick drives them.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Whether each provider is configured is a server-side fact.
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

  const availability = useMemo(() => {
    const map: Record<string, boolean | undefined> = {};
    for (const candidate of ALL_INSTRUMENTS) {
      map[candidate.id] = providerConfigured ? providerConfigured[candidate.providerId] : undefined;
    }
    if (feed.configured) map[instrument.id] = true;
    return map;
  }, [instrument.id, feed.configured, providerConfigured]);

  const frame = current?.reading ?? null;
  const pricePrecision = instrument.precision;
  const timeframeLabel = TIMEFRAME_LABELS[selectedTimeframe];
  const busy = feed.loadingTimeframes.length > 0;
  const isEquity = instrument.providerId === 'alpaca';

  const flowCapabilities = orderFlow.capabilities;
  useEffect(() => {
    if (!flowCapabilities.hasOrderBook && flowMode === 'BOOK') setFlowMode('FLOW');
  }, [flowCapabilities.hasOrderBook, flowMode]);

  // The entry check reads the three compasses of the SELECTED timeframe only.
  const entryCheck = useMemo(() => {
    if (!frame) return null;
    const flowLabel = frame.orderFlow?.gauge.label ?? null;
    const compasses: EntryCompassInput[] = [
      { key: 'technical', label: 'Signal gauge', scoreLabel: frame.available ? frame.technical.label : null },
      { key: 'summary', label: 'Summary', scoreLabel: frame.available ? frame.summary.label : null },
      { key: 'orderFlow', label: 'Order flow', scoreLabel: frame.available ? flowLabel : null },
    ];
    return checkEntry(entryDirection, compasses, DEFAULT_COMPASS_CONFIG);
  }, [frame, entryDirection]);

  // The real order-flow stance against the checked direction, for the optional
  // confirmation row. It never changes the compass logic — it is an extra line.
  const flowStance = useMemo<'AGREE' | 'DISAGREE' | 'NEUTRAL' | null>(() => {
    const stance = entryCheck?.compasses.find(compass => compass.key === 'orderFlow');
    if (!stance || stance.stance === 'UNAVAILABLE') return null;
    return stance.stance;
  }, [entryCheck]);

  // The timeframe tiles, filled from timeframes the store has loaded.
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

  // The Trend Summary strip: the same per-timeframe compass results, in one row.
  const trendCells: TrendCell[] = useMemo(() => {
    const byTimeframe = new Map(stored.map(entry => [entry.timeframe, entry]));
    return TIMEFRAMES.map(timeframe => {
      const entry = byTimeframe.get(timeframe);
      const market = feed.timeframeMarket[timeframe];
      const marketClosed = market?.state === 'CLOSED';
      const available = entry?.reading.available ?? false;
      return {
        timeframe,
        scoreLabel: available ? entry!.reading.summary.label : null,
        score: available ? entry!.reading.summary.score : null,
        marketClosed,
        notLoaded: !entry,
      };
    });
  }, [stored, feed.timeframeMarket]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const change = frame?.change ?? null;
  const changePercent = frame?.changePercent ?? null;
  const changeTone =
    change === null ? 'text-ink-muted' : change > 0 ? 'text-buy' : change < 0 ? 'text-sell' : 'text-ink-secondary';
  const changeLabel = frame?.changeBasis === 'SESSION' ? 'Session' : 'Window';

  const flowProvenance = useMemo(() => {
    const venueName = (venue: string) =>
      venue === 'alpaca' ? 'Alpaca' : venue === 'binance' ? 'Binance' : venue === 'none' ? 'Off' : venue;
    const reading = orderFlow.reading;
    if (!reading) {
      // No reading yet: name the venue that WOULD serve this asset, not the
      // build's overall label, so the header never implies the wrong source.
      const venue = orderFlow.venue;
      return venue && venue !== 'none' ? venueName(venue) : orderFlow.probe?.label ?? 'Order flow';
    }
    const parts = [reading.instrument ?? instrument.providerSymbol, venueName(reading.provider)];
    if (reading.feed) parts.push(reading.feed.toUpperCase());
    return parts.filter(Boolean).join(' · ');
  }, [orderFlow.reading, orderFlow.venue, orderFlow.probe, instrument.providerSymbol]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-app font-sans text-ink">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-hairline bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1840px] flex-col gap-2 px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-title font-semibold tracking-tight text-ink">FlowSense</span>
              <span className="text-label text-ink-muted">
                {instrument.name}
                {instrument.proxy && <span className="text-ink-faint"> · proxy</span>}
                <span className="text-ink-faint"> · {instrument.exchange}</span>
              </span>
              <span data-numeric className="font-mono text-data font-semibold text-ink">
                {feed.price > 0 ? formatNumber(feed.price, pricePrecision) : '--'}
                <span className="ml-1 text-label font-normal text-ink-muted">{instrument.quote}</span>
              </span>
              {change !== null && (
                <span data-numeric className={cn('font-mono text-label', changeTone)}>
                  <span aria-hidden className="mr-1">{changeGlyph(change)}</span>
                  {formatSigned(change, pricePrecision)} ({formatSignedPercent(changePercent ?? 0)})
                  <span className="ml-1 text-ink-faint">{changeLabel.toLowerCase()}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <MarketStatusPill isEquity={isEquity} now={now} />
              {feed.stale && feed.rateLimitedUntil !== null ? (
                <RateLimitNotice until={feed.rateLimitedUntil} />
              ) : (
                <Pill
                  tone={STATUS_TONE[feed.streamStatus] ?? 'muted'}
                  glyph="●"
                  title={`Last update ${formatClock(feed.lastUpdate)}`}
                >
                  {STATUS_TEXT[feed.streamStatus] ?? feed.streamStatus}
                </Pill>
              )}
              {feed.stale && feed.market.state !== 'CLOSED' && (
                <Pill tone="warn" title="The credit limit blocked a fresh fetch; this is the last series we loaded.">
                  Stale
                </Pill>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <InstrumentSelector selectedId={instrument.id} onSelect={handleSelect} availability={availability} />
            <TimeframeButtons selected={selectedTimeframe} onSelect={setSelectedTimeframe} busy={busy} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1840px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
        {/* ── Unavailable / error state ─────────────────────────────────── */}
        {!feed.configured && !feed.isLoading && (
          <Panel title={feed.sourceReachable ? ERROR_TITLES.NOT_CONFIGURED : UNREACHABLE_TITLE} subtitle={instrument.id} dense>
            <div className="flex flex-col gap-2">
              <p className="text-body text-ink-secondary">
                {feed.unavailableReason ?? feed.error?.message ?? 'This instrument has no configured data source.'}
              </p>
              {feed.sourceReachable ? (
                <p className="text-label text-ink-muted">
                  FlowSense shows nothing rather than a fabricated number. Gold needs{' '}
                  <span className="font-mono text-ink-secondary">TWELVE_DATA_API_KEY</span>; the S&amp;P 500, Dow and
                  Nasdaq assets need <span className="font-mono text-ink-secondary">ALPACA_API_KEY_ID</span> and{' '}
                  <span className="font-mono text-ink-secondary">ALPACA_API_SECRET_KEY</span> in the environment.
                </p>
              ) : (
                <p className="text-label text-ink-muted">
                  The server route that holds the API key did not answer. On a local dev server the{' '}
                  <span className="font-mono text-ink-secondary">api/</span> functions are not running — use{' '}
                  <span className="font-mono text-ink-secondary">vercel dev</span>. In production this is a network or
                  deployment problem, not a missing key.
                </p>
              )}
            </div>
          </Panel>
        )}

        {feed.configured && feed.error && !feed.isLoading && feed.candles.length === 0 && (
          <Panel title={ERROR_TITLES[feed.error.kind] ?? ERROR_TITLES.UNKNOWN} subtitle={instrument.id} dense>
            <p className="text-body text-ink-secondary">{feed.error.message}</p>
          </Panel>
        )}

        {/* ── Trend Summary strip ───────────────────────────────────────── */}
        <Panel
          title="Trend Summary"
          subtitle={`${instrument.id} · ${timeframeLabel}`}
          dense
          actions={<span className="text-micro text-ink-faint">Summary compass per timeframe</span>}
        >
          <TrendSummaryStrip cells={trendCells} />
        </Panel>

        {/* ── The three compasses in one row ────────────────────────────── */}
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
          <CompassCard
            title="Signal Gauge"
            subtitle={timeframeLabel}
            gauge={frame?.available ? frame.technical : null}
            figures={
              frame?.available
                ? [
                    { label: 'MAs', value: `${frame.technical.details.filter(d => d.group === 'MA').length}` },
                    { label: 'Osc', value: `${frame.technical.details.filter(d => d.group !== 'MA').length}` },
                    { label: 'Buy', value: `${frame.technical.tally.buy}`, tone: 'text-buy' },
                    { label: 'Sell', value: `${frame.technical.tally.sell}`, tone: 'text-sell' },
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
                tone: orderFlow.reading ? undefined : 'text-ink-faint',
              },
            ]}
            unavailableText={frame ? 'Not enough candles' : feed.isLoading ? 'Loading candles…' : 'No data'}
          />

          <OrderFlowPanel
            reading={throttledReading}
            capabilities={flowCapabilities}
            mode={flowMode}
            onModeChange={setFlowMode}
            window={flowWindow}
            onWindowChange={setFlowWindow}
            state={flowState}
            shiftAlert={shiftAlert}
            provenance={flowProvenance}
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
                    ? 'Set ORDERFLOW_PROVIDER to enable order flow.'
                    : undefined)
            }
            precision={pricePrecision}
            latencyMs={orderFlow.latencyMs}
            updatedAt={orderFlow.updatedAt}
          />
        </div>

        {/* ── Indicator Detail beside the Entry check, at equal height ──── */}
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
          <Panel
            title="Indicator Detail"
            subtitle={`${instrument.id} · ${timeframeLabel}`}
            dense
            scrollBody
            className="lg:col-span-2"
          >
            {frame?.available ? (
              <TechnicalTable details={frame.technical.details} />
            ) : feed.isLoading ? (
              <SkeletonLines lines={8} />
            ) : (
              <p className="py-2 text-body italic text-ink-muted">
                {frame
                  ? `Not enough candles on ${timeframeLabel} to compute a reading.`
                  : 'No data for this timeframe.'}
              </p>
            )}
          </Panel>

          <Panel title="Entry check" subtitle={`${instrument.id} · ${timeframeLabel}`} dense>
            {entryCheck ? (
              <EntryCheckPanel
                result={entryCheck}
                direction={entryDirection}
                onDirectionChange={setEntryDirection}
                chips={chips}
                timeframeLabel={timeframeLabel}
                flowStance={flowStance}
              />
            ) : feed.isLoading ? (
              <SkeletonLines lines={6} />
            ) : (
              <p className="py-2 text-body italic text-ink-muted">No reading for this timeframe yet.</p>
            )}
          </Panel>
        </div>

        {/* ── Secondary: feed provenance and quality, always visible ────── */}
        <Panel title="Feed detail" subtitle={`${instrument.id} · ${timeframeLabel}`} dense>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-4">
            {[
              { label: 'Provider', value: feed.sourceLabel || feed.providerId },
              { label: 'Symbol', value: feed.resolvedSource?.symbol ?? instrument.providerSymbol },
              { label: 'Feed mode', value: feed.feedMode },
              { label: 'Last update', value: formatClock(feed.lastUpdate) },
              { label: 'Market', value: feed.market.state },
              { label: 'Loaded timeframes', value: `${feed.loadedTimeframes.length} / ${TIMEFRAMES.length}` },
              { label: 'Candles (1m base)', value: `${feed.candles.length}` },
              { label: 'Partial volume', value: feed.resolvedSource?.partialVolume ? 'IEX (one exchange)' : '—' },
            ].map(item => (
              <div key={item.label} className="flex items-baseline justify-between gap-2">
                <dt className="text-micro uppercase tracking-[0.08em] text-ink-muted">{item.label}</dt>
                <dd className="truncate font-mono text-label text-ink-secondary" title={item.value}>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </main>

      <footer className="border-t border-hairline px-4 py-3 sm:px-6">
        <p className="mx-auto max-w-[1840px] text-micro text-ink-faint">
          FlowSense — analysis only. Not investment advice. Index assets are read through ETF proxies; order flow is
          real venue data, never derived from candles.
        </p>
      </footer>
    </div>
  );
};

export default Index;
