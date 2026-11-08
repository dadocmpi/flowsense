// ============================================
// ORDER-FLOW FEED HOOK
// ============================================
// A per-timeframe view over the live venue feed. It owns no socket of its own:
// the module-level store holds the one connection, and this hook derives the
// numbers the panels read from it.
//
// Everything the Compass consumes is computed from CLOSED candles: the forming
// bucket is dropped by `candleDeltas`, the imbalance is smoothed, and the state
// word uses hysteresis. The DOM ladder and the tape are live by nature and are
// shown live — they are never fed into a gauge.
//
// Nothing is fabricated: with no feed the reading is null and the health says
// why, with the real last-message time.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Candle, OrderFlowReading, Timeframe } from '../core/types';
import { TIMEFRAME_MINUTES } from '../core/types';
import type { BookSnapshot, BookTicker, FeedHealth, TradePrint } from '../core/orderflow/types';
import { bookImbalance, utcResetBoundary } from '../core/orderflow/aggregate';
import { buildLiveOrderFlowReading, type OrderFlowReadingResult } from '../core/orderflow/reading';
import { buildVolumeProfileFromHistogram, type VolumeProfile } from '../core/volumeProfile';
import { parseCandleTime } from '../core/candles';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import {
  ensureOrderFlowStarted,
  getOrderFlowVersion,
  readOrderFlowState,
  subscribeOrderFlowStore,
} from './orderFlowStore';

export interface OrderFlowFeed {
  health: FeedHealth;
  venue: string;
  /** True once the feed has delivered at least one message. */
  connected: boolean;
  /** The reading for the selected timeframe, or null while it cannot be built. */
  reading: OrderFlowReading | null;
  /** The full computed result, for the drawer's audit and the sparkline. */
  result: OrderFlowReadingResult | null;
  /** Live book, for the DOM ladder. */
  book: BookSnapshot | null;
  /** Live best bid/ask, for the basis and the header. */
  ticker: BookTicker | null;
  /** Newest prints, oldest first. */
  tape: TradePrint[];
  /** Resting-book imbalance over the configured levels, or null with no book. */
  imbalance: number | null;
  imbalanceLevels: number;
  /** Volume profile for the current UTC session. */
  profile: VolumeProfile;
  /** Volume profile for the previous UTC session. */
  previousProfile: VolumeProfile;
  /** Epoch ms of the UTC reset the CVD is measured from. */
  resetAt: number | null;
  /** The venue's last traded price, or null before the first print. */
  venuePrice: number | null;
  /** The instrument tick size used for the profile bins. */
  tickSize: number;
}

/** The empty profile, so a panel can render its designed empty state. */
const EMPTY_PROFILE: VolumeProfile = {
  available: false,
  bins: [],
  binSize: 0,
  poc: null,
  vah: null,
  val: null,
  valueAreaShare: 0.7,
  sessionHigh: null,
  sessionLow: null,
  totalVolume: 0,
  sessionStart: null,
  rangeLow: 0,
  rangeHigh: 0,
};

/**
 * Derive the order-flow view for one timeframe.
 *
 * `candles` is the selected timeframe's price series, used only to supply the
 * session high/low to the volume profile. It never feeds the flow numbers.
 */
export function useOrderFlowFeed(
  timeframe: Timeframe,
  candles: Candle[],
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): OrderFlowFeed {
  useEffect(() => {
    ensureOrderFlowStarted();
  }, []);

  const version = useSyncExternalStore(subscribeOrderFlowStore, getOrderFlowVersion, getOrderFlowVersion);

  // The store's version is the change signal; the state object is rebuilt from
  // the live aggregator whenever it moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => readOrderFlowState(), [version]);

  const { aggregator, health, book, ticker, prints } = state;
  const tickSize = config.orderFlow.tickSize;

  const imbalance = useMemo(
    () => (book ? bookImbalance(book.bids, book.asks, config.orderFlow.imbalanceLevels) : null),
    [book, config.orderFlow.imbalanceLevels]
  );

  const resetAt = aggregator.resetAt;
  const now = health.lastMessageAt ?? Date.now();
  const effectiveReset = resetAt ?? utcResetBoundary(now);

  const result = useMemo(
    () =>
      buildLiveOrderFlowReading({
        minutes: aggregator.minuteBuckets(),
        timeframeMinutes: TIMEFRAME_MINUTES[timeframe],
        resetAt: effectiveReset,
        imbalance,
        venue: health.venue,
        config,
      }),
    // The aggregator is a mutable instance; `version` is what tells us it moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, timeframe, effectiveReset, imbalance, config, health.venue]
  );

  const reading: OrderFlowReading | null = useMemo(() => {
    if (!result) return null;
    return {
      gauge: result.gauge,
      metrics: result.metrics,
      detail: {
        venue: health.venue,
        resetAt,
        state: result.state,
        smoothedImbalance: result.smoothedImbalance,
        cvdSeries: result.cvdSeries,
        candleCount: result.candleCount,
        imbalanceLevels: config.orderFlow.imbalanceLevels,
      },
      source: health.venue,
    };
  }, [result, health.venue, resetAt, config.orderFlow.imbalanceLevels]);

  // The UTC session's own candles, for the profile's session high/low.
  const sessionCandles = useMemo(() => {
    const boundary = aggregator.currentSession;
    if (boundary === null || candles.length === 0) return [];
    return candles.filter(candle => {
      const ms = parseCandleTime(candle.datetime);
      return Number.isFinite(ms) && ms >= boundary;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, version, aggregator]);

  const profile = useMemo(
    () =>
      buildVolumeProfileFromHistogram(
        aggregator.sessionHistogram().entries(),
        tickSize,
        { tickSize, targetBins: 60, valueAreaShare: 0.7 },
        aggregator.currentSession,
        sessionCandles
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, tickSize, sessionCandles, aggregator]
  );

  const previousProfile = useMemo(
    () =>
      buildVolumeProfileFromHistogram(
        aggregator.previousHistogram().entries(),
        tickSize,
        { tickSize, targetBins: 60, valueAreaShare: 0.7 },
        aggregator.previousSession,
        []
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, tickSize, aggregator]
  );

  const venuePrice = useMemo(() => {
    if (ticker) return (ticker.bidPrice + ticker.askPrice) / 2;
    if (prints.length > 0) return prints[prints.length - 1].price;
    if (book && book.bids.length > 0 && book.asks.length > 0) {
      return (book.bids[0].price + book.asks[0].price) / 2;
    }
    return null;
  }, [ticker, prints, book]);

  return {
    health,
    venue: health.venue,
    connected: health.lastMessageAt !== null,
    reading,
    result,
    book,
    ticker,
    tape: prints,
    imbalance,
    imbalanceLevels: config.orderFlow.imbalanceLevels,
    profile: profile.available ? profile : EMPTY_PROFILE,
    previousProfile: previousProfile.available ? previousProfile : EMPTY_PROFILE,
    resetAt,
    venuePrice,
    tickSize,
  };
}
