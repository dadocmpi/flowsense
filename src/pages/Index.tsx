// ============================================
// FLOWSENSE — MAIN SCREEN
// ============================================
// A dense, sober risk/trading terminal. Top to bottom:
//
//   1. the top bar: instrument, venue, price, UTC clock, per-stream source/age,
//      asset tabs and timeframe buttons
//   2. three compasses in one row — Technical indicators, Summary, Order flow
//   3. the volume profile (real, from the venue tape)
//   4. the technical indicators table (two thirds) beside the entry check (one
//      third)
//   5. the client-side Risk panel
//
// Everything renders expanded on load; nothing is hidden behind a click except
// the "Compass inputs" disclosure, which is an audit list.

import React, { useEffect, useMemo, useState } from 'react';
import { useInstrumentFeed } from '../hooks/useInstrumentFeed';
import { useTimeframeReadings } from '../hooks/useTimeframeReadings';
import { useOrderFlowFeed } from '../hooks/useOrderFlowFeed';
import { InstrumentSelector } from '../components/compass/InstrumentSelector';
import { TimeframeButtons } from '../components/compass/TimeframeButtons';
import { CompassCard } from '../components/compass/CompassCard';
import { TechnicalTable } from '../components/compass/TechnicalTable';
import { EntryCheckPanel, type EntryChip } from '../components/compass/EntryCheckPanel';
import { OrderFlowPanel } from '../components/flow/OrderFlowPanel';
import type { FlowMode } from '../components/flow/flowMode';
import { VolumeProfilePanel } from '../components/flow/VolumeProfilePanel';
import { Panel } from '../components/common/Panel';
import { StatusDot } from '../components/common/ui';
import { PALETTE } from '../components/common/palette';
import { ALL_INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument, type Instrument } from '../core/instruments';
import { TIMEFRAME_LABELS, TIMEFRAMES, type Timeframe } from '../core/types';
import { probeFuturesProvider, providerConfiguredState } from '../core/providers';
import { checkEntry, type EntryCompassInput, type EntryDirection } from '../core/entryCheck';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';
import { formatAge, formatClockUtc, formatNumber, formatSigned, formatSignedPercent } from '../components/compass/format';

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

const UNREACHABLE_TITLE = 'Data source unreachable';

/** Our own wording for a rate-limited price feed; never the vendor's raw text. */
function RateLimitNotice({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((until - now) / 1_000));
  return <span className="font-medium text-warn">Rate limit — retrying in {seconds}s</span>;
}

const Index: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_INSTRUMENT_ID);
  const [entryDirection, setEntryDirection] = useState<EntryDirection>('LONG');
  const [flowMode, setFlowMode] = useState<FlowMode>('ORDER_FLOW');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');
  const instrument: Instrument = useMemo(
    () => findInstrument(selectedId) ?? findInstrument(DEFAULT_INSTRUMENT_ID)!,
    [selectedId]
  );

  const feed = useInstrumentFeed(instrument, selectedTimeframe);
  const { current, stored } = useTimeframeReadings(feed, selectedTimeframe);

  // The real venue feed: DOM, tape, imbalance, volume profile and feed health.
  const timeframeCandles = feed.seriesByTimeframe[selectedTimeframe] ?? [];
  const orderFlowFeed = useOrderFlowFeed(selectedTimeframe, timeframeCandles);

  // One clock for every "ago" and the header, so the screen reads one time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const [providerConfigured, setProviderConfigured] = useState<Record<'twelvedata' | 'alpaca', boolean> | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    probeFuturesProvider(controller.signal)
      .then(result => {
        if (!active) return;
        setProviderConfigured(providerConfiguredState() ?? { twelvedata: result.configured, alpaca: result.configured });
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

  // The entry check reads the three compasses of the SELECTED timeframe only.
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

  const change = frame?.change ?? null;
  const changePercent = frame?.changePercent ?? null;
  const changeColor = change === null ? undefined : change > 0 ? PALETTE.pos : change < 0 ? PALETTE.neg : PALETTE.inkMuted;
  const changeLabel = frame?.changeBasis === 'SESSION' ? 'Session' : 'Window';

  const priceStreamLabel =
    feed.stale && feed.rateLimitedUntil !== null
      ? 'rate limited'
      : feed.market.state === 'CLOSED'
        ? 'market closed'
        : feed.streamStatus === 'LIVE'
          ? 'live'
          : feed.streamStatus === 'RATE_LIMITED'
            ? 'rate limited'
            : 'polling';

  return (
    <div className="flex min-h-screen w-full flex-col bg-base-0 font-sans text-ink">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-line bg-base-0/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1920px] flex-col gap-2 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-title font-semibold tracking-tight">FlowSense</span>
              <span className="text-micro uppercase tracking-[0.08em] text-ink-subtle">Market compass</span>
              <span className="text-line">|</span>
              <span className="text-label text-ink-muted">
                {instrument.name}
                <span className="text-ink-subtle"> · {instrument.exchange}</span>
                {instrument.proxy && <span className="text-warn"> · proxy</span>}
              </span>
              <span className="font-mono text-data font-semibold tabular">
                {feed.price > 0 ? formatNumber(feed.price, pricePrecision) : '--'}
                <span className="ml-1 text-label font-normal text-ink-subtle">{instrument.quote}</span>
              </span>
              {change !== null && (
                <span className="font-mono text-label tabular" style={{ color: changeColor }}>
                  {formatSigned(change, pricePrecision)}{' '}
                  <span className="text-ink-subtle">({changeLabel})</span>{' '}
                  {changePercent !== null && formatSignedPercent(changePercent)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro">
              <span className="flex items-center gap-1.5">
                <span className="text-ink-subtle uppercase tracking-[0.06em]">UTC</span>
                <span className="font-mono tabular text-ink-muted">{formatClockUtc(now)}</span>
              </span>

              <span className="flex items-center gap-1.5">
                <StatusDot tone={feed.market.state === 'CLOSED' ? 'warn' : feed.stale ? 'warn' : 'pos'} />
                <span className="text-ink-subtle uppercase tracking-[0.06em]">Candles</span>
                <span className="text-ink-muted">{feed.sourceLabel}</span>
                <span className="text-ink-subtle">{priceStreamLabel}</span>
                <span className="font-mono tabular text-ink-muted">{formatAge(feed.lastUpdate, now)}</span>
              </span>

              <span className="flex items-center gap-1.5">
                <StatusDot
                  tone={
                    orderFlowFeed.health.status === 'LIVE'
                      ? 'pos'
                      : orderFlowFeed.health.status === 'DISABLED'
                        ? 'neutral'
                        : orderFlowFeed.health.status === 'CONNECTING' || orderFlowFeed.health.status === 'RECONNECTING'
                          ? 'warn'
                          : 'neg'
                  }
                />
                <span className="text-ink-subtle uppercase tracking-[0.06em]">Flow</span>
                <span className="text-ink-muted">{orderFlowFeed.venue}</span>
                <span className="font-mono tabular text-ink-muted">{formatAge(orderFlowFeed.health.lastMessageAt, now)}</span>
              </span>

              {feed.stale && feed.rateLimitedUntil !== null && <RateLimitNotice until={feed.rateLimitedUntil} />}
              {feed.market.state === 'CLOSED' && <span className="text-warn">Market closed</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <InstrumentSelector selectedId={instrument.id} onSelect={setSelectedId} availability={availability} />
            <TimeframeButtons selected={selectedTimeframe} onSelect={setSelectedTimeframe} busy={busy} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-3 px-4 py-3">
        {!feed.configured && !feed.isLoading && (
          <Panel title={feed.sourceReachable ? ERROR_TITLES.NOT_CONFIGURED : UNREACHABLE_TITLE} meta={<span>{instrument.id}</span>}>
            <p className="text-body text-ink-muted">
              {feed.unavailableReason ?? feed.error?.message ?? 'This instrument has no configured data source.'}
            </p>
            <p className="mt-2 text-label text-ink-subtle">
              FlowSense shows nothing rather than a fabricated number. Gold needs{' '}
              <span className="font-mono">TWELVE_DATA_API_KEY</span>; the index assets need{' '}
              <span className="font-mono">ALPACA_API_KEY</span> and <span className="font-mono">ALPACA_API_SECRET</span>.
            </p>
          </Panel>
        )}

        {feed.configured && feed.error && !feed.isLoading && feed.candles.length === 0 && (
          <Panel title={ERROR_TITLES[feed.error.kind] ?? ERROR_TITLES.UNKNOWN} meta={<span>{instrument.id}</span>}>
            <p className="text-body text-ink-muted">{feed.error.message}</p>
          </Panel>
        )}

        {/* ── Three compasses ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <CompassCard
            title="Technical indicators"
            meta={<span>{timeframeLabel}</span>}
            gauge={frame?.available ? frame.technical : null}
            figures={
              frame?.available
                ? [
                    { label: 'MAs', value: `${frame.technical.details.filter(d => d.group === 'MA').length}` },
                    { label: 'Osc', value: `${frame.technical.details.filter(d => d.group !== 'MA').length}` },
                    { label: 'Buy', value: `${frame.technical.tally.buy}`, color: PALETTE.pos },
                    { label: 'Sell', value: `${frame.technical.tally.sell}`, color: PALETTE.neg },
                    { label: 'Neutral', value: `${frame.technical.tally.neutral}` },
                    { label: 'Score', value: `${Math.round(frame.technical.score)}` },
                  ]
                : [
                    { label: 'Candles', value: `${frame?.candleCount ?? 0}` },
                    { label: 'Needed', value: `${DEFAULT_COMPASS_CONFIG.minCandles}` },
                  ]
            }
            unavailableText={frame ? 'Not enough candles' : feed.isLoading ? 'Loading…' : 'No data'}
            unavailableHint={
              frame && !frame.available
                ? `${frame.candleCount} candles on ${timeframeLabel} — needs ${DEFAULT_COMPASS_CONFIG.minCandles}.`
                : undefined
            }
          />

          <CompassCard
            title="Summary"
            meta={<span>{timeframeLabel}</span>}
            gauge={frame?.available ? frame.summary : null}
            figures={[
              { label: 'Last price', value: frame && frame.price > 0 ? formatNumber(frame.price, pricePrecision) : '--' },
              { label: `Change (${changeLabel})`, value: change !== null ? formatSigned(change, pricePrecision) : '--', color: changeColor },
              { label: 'Change %', value: changePercent !== null ? formatSignedPercent(changePercent) : '--', color: changeColor },
              { label: 'Updated', value: formatAge(current?.updatedAt ?? null, now) },
              { label: 'Candles', value: frame ? `${frame.candleCount}` : '--' },
              {
                label: 'Order flow',
                value: frame?.orderFlow ? 'real' : 'none',
                color: frame?.orderFlow ? PALETTE.pos : PALETTE.inkSubtle,
              },
            ]}
            unavailableText={frame ? 'Not enough candles' : feed.isLoading ? 'Loading…' : 'No data'}
          />

          <OrderFlowPanel
            feed={orderFlowFeed}
            mode={flowMode}
            onModeChange={setFlowMode}
            precision={pricePrecision}
            timeframeLabel={timeframeLabel}
            referencePrice={frame && frame.price > 0 ? frame.price : null}
            now={now}
          />
        </div>

        {/* ── Real volume profile ─────────────────────────────────────── */}
        <VolumeProfilePanel
          profile={orderFlowFeed.profile}
          previousProfile={orderFlowFeed.previousProfile}
          precision={pricePrecision}
          venue={orderFlowFeed.venue}
          health={orderFlowFeed.health}
          now={now}
        />

        {/* ── Technical table + entry check ───────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Panel title="Technical indicators" meta={<span>{instrument.id} · {timeframeLabel}</span>}>
              {frame?.available ? (
                <TechnicalTable details={frame.technical.details} />
              ) : (
                <p className="py-2 text-body text-ink-subtle">
                  {feed.isLoading
                    ? 'Loading candles…'
                    : frame
                      ? `Not enough candles on ${timeframeLabel} to compute a reading.`
                      : 'No data for this timeframe.'}
                </p>
              )}
            </Panel>
          </div>

          <div>
            <Panel title="Entry check" meta={<span>{instrument.id} · {timeframeLabel}</span>}>
              {entryCheck ? (
                <EntryCheckPanel
                  result={entryCheck}
                  direction={entryDirection}
                  onDirectionChange={setEntryDirection}
                  chips={chips}
                  timeframeLabel={timeframeLabel}
                />
              ) : (
                <p className="py-2 text-body text-ink-subtle">
                  {feed.isLoading ? 'Loading candles…' : 'No reading for this timeframe yet.'}
                </p>
              )}
            </Panel>
          </div>
        </div>
      </main>

      <footer className="border-t border-line px-4 py-2">
        <p className="mx-auto max-w-[1920px] text-micro text-ink-subtle">
          FlowSense — analysis only. Not investment advice. Price/candles:{' '}
          <span className="text-ink-muted">{feed.sourceLabel}</span>. Order flow:{' '}
          <span className="text-ink-muted">{orderFlowFeed.venue}</span> (public venue feed).
        </p>
      </footer>
    </div>
  );
};

export default Index;
