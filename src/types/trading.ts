// ============================================
// TRADING TYPES — CRYPTO / BINANCE MODEL
// ============================================
// Scope is deliberately crypto-only for now: Binance public market data gives
// us real candles, a real order book and a real tick-by-tick trade tape, all
// without an API key. Other asset classes are a later addition — adding a
// market we cannot source honestly would mean faking it.
//
// Everything the UI shows is either a Binance response or arithmetic over one.
// No bids, asks, trades or buy/sell splits are ever synthesised.

import type { Candle } from '../lib/indicators';

export type { Candle };

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type AssetCategory = 'CRYPTO';

export interface AssetConfig {
  symbol: string;
  /** Binance spot symbol used for REST and streams. */
  binanceSymbol: string;
  name: string;
  exchange: string;
  precision: number;
  category: AssetCategory;
  /** Quote currency of the pair. */
  quote: string;
}

export const SUPPORTED_ASSETS: AssetConfig[] = [
  { symbol: 'BTC/USDT', binanceSymbol: 'BTCUSDT', name: 'Bitcoin / TetherUS', exchange: 'BINANCE', precision: 2, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'ETH/USDT', binanceSymbol: 'ETHUSDT', name: 'Ethereum / TetherUS', exchange: 'BINANCE', precision: 2, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'SOL/USDT', binanceSymbol: 'SOLUSDT', name: 'Solana / TetherUS', exchange: 'BINANCE', precision: 2, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'BNB/USDT', binanceSymbol: 'BNBUSDT', name: 'BNB / TetherUS', exchange: 'BINANCE', precision: 2, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'XRP/USDT', binanceSymbol: 'XRPUSDT', name: 'XRP / TetherUS', exchange: 'BINANCE', precision: 4, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'DOGE/USDT', binanceSymbol: 'DOGEUSDT', name: 'Dogecoin / TetherUS', exchange: 'BINANCE', precision: 5, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'ADA/USDT', binanceSymbol: 'ADAUSDT', name: 'Cardano / TetherUS', exchange: 'BINANCE', precision: 4, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'AVAX/USDT', binanceSymbol: 'AVAXUSDT', name: 'Avalanche / TetherUS', exchange: 'BINANCE', precision: 2, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'LINK/USDT', binanceSymbol: 'LINKUSDT', name: 'Chainlink / TetherUS', exchange: 'BINANCE', precision: 2, category: 'CRYPTO', quote: 'USDT' },
  { symbol: 'LTC/USDT', binanceSymbol: 'LTCUSDT', name: 'Litecoin / TetherUS', exchange: 'BINANCE', precision: 2, category: 'CRYPTO', quote: 'USDT' },
];

export const DEFAULT_SYMBOL = 'BTC/USDT';

export function findAssetConfig(symbol: string): AssetConfig {
  return SUPPORTED_ASSETS.find(asset => asset.symbol === symbol) || SUPPORTED_ASSETS[0];
}

// ---- Indicators ----
export interface IndicatorSignal {
  name: string;
  value: string;
  action: 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';
  description?: string;
}

export interface IndicatorSummary {
  buyCount: number;
  neutralCount: number;
  sellCount: number;
  score: number; // 0 to 100
  verdict: 'STRONG SELL' | 'SELL' | 'NEUTRAL' | 'BUY' | 'STRONG BUY';
}

// ---- Real order book / tape (Binance public streams) ----
// These mirror exactly what Binance sends. Nothing is derived or scaled.
export interface OrderBookLevel {
  price: number;
  size: number;
  /** price * size, in quote currency. */
  total: number;
  /** Relative size bar, 0-100, scaled to the largest level shown. */
  percentage: number;
}

export interface TradeFeedItem {
  id: string;
  price: number;
  size: number;
  /** HH:MM:SS.mmm in UTC. */
  time: string;
  /** Aggressor side: Binance's `m` flag is true when the buyer was the maker. */
  type: 'BUY' | 'SELL';
  quoteValue: number;
}

export interface OrderFlowState {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeFeedItem[];
  /** Buy minus sell volume accumulated from the live tape since the stream
   *  connected. Resets on reconnect. */
  volumeDelta: number;
  /** Buy-initiated volume from the live tape since the stream connected. */
  buyerVolume: number;
  /** Sell-initiated volume from the live tape since the stream connected. */
  sellerVolume: number;
  /** Share of the live tape that buyers initiated since connecting, 0-100. */
  buyersPercent: number;
  /** Share of the live tape that sellers initiated since connecting, 0-100. */
  sellersPercent: number;
  /** Buy minus sell volume across the fetched candle window, from the real
   *  per-candle taker-buy split. A different window from the live tape. */
  cumulativeDelta: number;
  /** Whether the live stream is currently connected. */
  isLive: boolean;
  streamStatus: 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'OFFLINE';
  lastUpdate: number;
}

// ---- Session / range aggregates derived from real candles ----
export interface PriceRange {
  high: number;
  low: number;
  open: number;
  close: number;
  startTime: number;
}

// ---- Market data snapshot ----
export interface MarketDataState {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  precision: number;

  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  averageVolume: number;
  datetime: string;
  isMarketOpen: boolean;

  candles: Candle[];

  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  volumeIndicators: IndicatorSignal[];

  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  volumeSummary: IndicatorSummary;

  atr: number | null;
  vwap: number | null;
  pointOfControl: number | null;

  session: PriceRange | null;
  previousDay: PriceRange | null;
  weekly: PriceRange | null;
  openingRange: PriceRange | null;
}

export interface DataQualityScore {
  overall: number; // 0-100
  metrics: {
    priceAvailable: boolean;
    candlesValid: boolean;
    indicatorsValid: boolean;
    volumeAvailable: boolean;
    multiTimeframeValid: boolean;
    lastUpdateTime: number;
    freshness: 'LIVE' | 'DELAYED' | 'STALE' | 'DISCONNECTED';
    source: 'BINANCE' | 'UNAVAILABLE';
  };
}

export type MarketDataErrorKind =
  | 'GEO_BLOCKED'
  | 'RATE_LIMIT'
  | 'SYMBOL_NOT_FOUND'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'UNKNOWN';

export interface MarketDataError {
  kind: MarketDataErrorKind;
  message: string;
}

export interface MarketDataResult {
  data: MarketDataState;
  orderFlow: OrderFlowState;
  dataQuality: DataQualityScore;
  isLoading: boolean;
  error: MarketDataError | null;
  lastUpdated: number | null;
  nextRefreshIn: number;
  refresh: () => void;
}
