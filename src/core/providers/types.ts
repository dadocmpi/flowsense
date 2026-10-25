// ============================================
// MARKET DATA PROVIDER INTERFACE
// ============================================
// Every data source in the app implements this interface. Nothing else in the
// codebase fetches market data directly, so swapping a source means writing one
// provider and registering it — no changes to the scoring or the UI.
//
// The contract is deliberately narrow and honest:
//
//  * getCandles must return real candles, or throw. It must never pad, fill or
//    synthesise a series.
//  * subscribeTicks is optional. A provider that has no live feed simply does
//    not implement it, and the UI shows the reading as delayed/static rather
//    than pretending to stream.
//  * subscribeOrderFlow is optional AND separate from subscribeTicks. A
//    provider may have a real price feed but no genuine order flow; in that
//    case order flow stays unavailable and the UI hides it. Order flow is
//    never derived from candles.

import type { Candle, Timeframe } from '../types';
import type { Instrument, ProviderId } from '../instruments';

export interface ProviderCapabilities {
  /** Real candles via getCandles. */
  candles: boolean;
  /** A live tick/price feed via subscribeTicks. */
  ticks: boolean;
  /** Genuine order-book depth and/or a trade tape via subscribeOrderFlow. */
  orderFlow: boolean;
}

/** Why a provider could not serve a request, in a form the UI can render. */
export type ProviderErrorKind =
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_INSTRUMENT'
  | 'GEO_BLOCKED'
  | 'RATE_LIMIT'
  | 'SYMBOL_NOT_FOUND'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'UNKNOWN';

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  status: number;

  constructor(kind: ProviderErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
  }
}

export interface Tick {
  instrumentId: string;
  price: number;
  /** Epoch ms the provider stamped the tick with. */
  timestamp: number;
}

/** A real order-book level. */
export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
  percentage: number;
}

export interface TradeTapeItem {
  id: string;
  price: number;
  size: number;
  /** UTC wall clock, HH:MM:SS.mmm. */
  time: string;
  /**
   * Aggressor side. Populated ONLY from the exchange's own flag (for Binance,
   * `aggTrade.m`). A provider that cannot report the aggressor must leave the
   * tape empty rather than guess.
   */
  type: 'BUY' | 'SELL';
  quoteValue: number;
}

export interface OrderFlowSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeTapeItem[];
  /** Buy-initiated volume accumulated from the tape since the stream opened. */
  buyerVolume: number;
  /** Sell-initiated volume accumulated from the tape since the stream opened. */
  sellerVolume: number;
  /** Buy minus sell volume accumulated from the tape since the stream opened. */
  volumeDelta: number;
  buyersPercent: number;
  sellersPercent: number;
  /**
   * Buy minus sell volume across the fetched candle window, from the
   * provider's per-candle aggressor split. A different window from the live
   * tape and only populated where the provider genuinely reports the split.
   */
  cumulativeDelta: number;
  isLive: boolean;
  streamStatus: StreamStatus;
  lastUpdate: number;
}

export type StreamStatus = 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'OFFLINE' | 'UNAVAILABLE';

export interface OrderFlowHandlers {
  onBook?: (bids: OrderBookLevel[], asks: OrderBookLevel[]) => void;
  onTrade?: (trade: TradeTapeItem) => void;
  onStatus?: (status: StreamStatus) => void;
}

export interface TickHandlers {
  onTick: (tick: Tick) => void;
  /** An in-progress candle for `timeframe`, pushed by the provider. */
  onCandle?: (timeframe: Timeframe, candle: Candle) => void;
  onStatus?: (status: StreamStatus) => void;
}

export interface Subscription {
  close: () => void;
}

export interface MarketDataProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;
  /**
   * True when the provider has everything it needs to serve requests
   * (typically a server-side API key). The UI uses this to decide between
   * "no data source configured" and a real error.
   */
  isConfigured(): boolean;
  /** Real candles for one instrument and timeframe, oldest first. */
  getCandles(instrument: Instrument, timeframe: Timeframe, limit: number, signal?: AbortSignal): Promise<Candle[]>;
  /** Optional live price feed. */
  subscribeTicks?(instrument: Instrument, handlers: TickHandlers): Subscription;
  /** Optional live order flow. Only implement with a genuine source. */
  subscribeOrderFlow?(instrument: Instrument, handlers: OrderFlowHandlers): Subscription;
}

/** What the UI needs to describe a source honestly. */
export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  capabilities: ProviderCapabilities;
  /** Why it is not configured, for the data-source panel. */
  note?: string;
}
