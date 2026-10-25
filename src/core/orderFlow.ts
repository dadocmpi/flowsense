// ============================================
// ORDER FLOW AGGREGATION — pure
// ============================================
// Every figure here is accumulated from the provider's own tape. Nothing is
// estimated from candles.
//
// The split is a *stream total*: it covers the trades received since the
// stream opened, not the whole session, so it is labelled as such in the UI.
// The candle-window delta is kept separate for exactly that reason — the two
// cover different windows and must never be presented as one number.

import type { Candle } from './types';
import type { OrderBookLevel, OrderFlowSnapshot, StreamStatus, TradeTapeItem } from './providers/types';

export interface VolumeSplit {
  buyersPercent: number;
  sellersPercent: number;
  volumeDelta: number;
  /** False when no trades have been seen, so the UI can say so. */
  hasSplit: boolean;
}

/**
 * Buy/sell split from the real tape.
 *
 * With no trades the split is a flat 50/50 and `hasSplit` is false: the UI
 * renders an empty bar rather than implying the market is balanced.
 */
export function computeVolumeSplit(buyerVolume: number, sellerVolume: number): VolumeSplit {
  const buy = Math.max(0, Number.isFinite(buyerVolume) ? buyerVolume : 0);
  const sell = Math.max(0, Number.isFinite(sellerVolume) ? sellerVolume : 0);
  const total = buy + sell;

  if (total <= 0) {
    return { buyersPercent: 50, sellersPercent: 50, volumeDelta: 0, hasSplit: false };
  }

  const buyersPercent = (buy / total) * 100;
  return {
    buyersPercent,
    sellersPercent: 100 - buyersPercent,
    volumeDelta: buy - sell,
    hasSplit: true,
  };
}

/**
 * Cumulative delta across the candle window, from the provider's per-candle
 * aggressor split. Candles without a split are skipped entirely rather than
 * counted as balanced, so a partial window understates rather than misstates.
 */
export function cumulativeDeltaFromCandles(candles: Candle[]): number {
  const withSplit = candles.filter(c => c.takerBuyVolume !== undefined);
  if (withSplit.length === 0) return 0;

  const buy = withSplit.reduce((acc, c) => acc + (c.takerBuyVolume ?? 0), 0);
  const total = withSplit.reduce((acc, c) => acc + c.volume, 0);
  const sell = Math.max(0, total - buy);
  return buy - sell;
}

export function emptyOrderFlowSnapshot(): OrderFlowSnapshot {
  return {
    bids: [],
    asks: [],
    recentTrades: [],
    buyerVolume: 0,
    sellerVolume: 0,
    volumeDelta: 0,
    buyersPercent: 50,
    sellersPercent: 50,
    cumulativeDelta: 0,
    isLive: false,
    streamStatus: 'UNAVAILABLE',
    lastUpdate: 0,
  };
}

export interface OrderFlowState {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeTapeItem[];
  buyerVolume: number;
  sellerVolume: number;
}

export function emptyOrderFlowState(): OrderFlowState {
  return { bids: [], asks: [], recentTrades: [], buyerVolume: 0, sellerVolume: 0 };
}

export const MAX_TAPE_ITEMS = 50;

/**
 * Fold one real trade into the accumulator. The aggressor side is taken as
 * given — it comes from the exchange's own flag — and never inferred.
 */
export function applyTrade(state: OrderFlowState, trade: TradeTapeItem, maxTape = MAX_TAPE_ITEMS): OrderFlowState {
  return {
    ...state,
    buyerVolume: state.buyerVolume + (trade.type === 'BUY' ? trade.size : 0),
    sellerVolume: state.sellerVolume + (trade.type === 'SELL' ? trade.size : 0),
    recentTrades: [trade, ...state.recentTrades].slice(0, maxTape),
  };
}

/** Build the snapshot the UI renders from the accumulator and the candle window. */
export function buildOrderFlowSnapshot(
  state: OrderFlowState,
  candles: Candle[],
  streamStatus: StreamStatus,
  lastUpdate: number
): OrderFlowSnapshot {
  const split = computeVolumeSplit(state.buyerVolume, state.sellerVolume);
  return {
    bids: state.bids,
    asks: state.asks,
    recentTrades: state.recentTrades,
    buyerVolume: state.buyerVolume,
    sellerVolume: state.sellerVolume,
    volumeDelta: split.volumeDelta,
    buyersPercent: split.buyersPercent,
    sellersPercent: split.sellersPercent,
    cumulativeDelta: cumulativeDeltaFromCandles(candles),
    isLive: streamStatus === 'LIVE',
    streamStatus,
    lastUpdate,
  };
}

/**
 * A dropped socket must not leave a stale split on screen. Resetting the
 * accumulator clears the tape totals; the caller marks the status separately.
 */
export function resetOrderFlowState(): OrderFlowState {
  return emptyOrderFlowState();
}
