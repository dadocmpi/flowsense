// ============================================
// TRADING TYPES — TWELVE DATA (REST) MODEL
// ============================================
// Data comes from Twelve Data over REST polling through the server-side proxy.
// Twelve Data does not expose order book / tape for these instruments, so this
// model deliberately has NO bids, asks, recent trades or buy/sell pressure.
// Anything resembling order flow would be fabricated, and is not represented.

import type { Candle } from '../lib/indicators';

export type { Candle };

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type AssetCategory = 'COMMODITY' | 'INDEX' | 'FOREX' | 'STOCK' | 'CRYPTO';

export interface AssetConfig {
  symbol: string;
  name: string;
  exchange: string;
  precision: number;
  category: AssetCategory;
  // Twelve Data free plan covers US stocks, forex and crypto in real time.
  // Commodities and indices require the Grow plan or above.
  requiresPaidPlan: boolean;
}

export const SUPPORTED_ASSETS: AssetConfig[] = [
  {
    symbol: 'XAU/USD',
    name: 'Gold Spot / US Dollar',
    exchange: 'FOREX',
    precision: 2,
    category: 'COMMODITY',
    requiresPaidPlan: true,
  },
  {
    symbol: 'SPX',
    name: 'S&P 500 Index',
    exchange: 'INDEX',
    precision: 2,
    category: 'INDEX',
    requiresPaidPlan: true,
  },
  {
    symbol: 'EUR/USD',
    name: 'Euro / US Dollar',
    exchange: 'FOREX',
    precision: 5,
    category: 'FOREX',
    requiresPaidPlan: false,
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    precision: 2,
    category: 'STOCK',
    requiresPaidPlan: false,
  },
  {
    symbol: 'BTC/USD',
    name: 'Bitcoin / US Dollar',
    exchange: 'CRYPTO',
    precision: 2,
    category: 'CRYPTO',
    requiresPaidPlan: false,
  },
];

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
    source: 'TWELVE_DATA' | 'UNAVAILABLE';
  };
}

export type MarketDataErrorKind =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'PLAN_LIMIT'
  | 'RATE_LIMIT'
  | 'SYMBOL_NOT_FOUND'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'BUDGET_EXHAUSTED'
  | 'UNKNOWN';

export interface MarketDataError {
  kind: MarketDataErrorKind;
  message: string;
}

export interface MarketDataResult {
  data: MarketDataState;
  dataQuality: DataQualityScore;
  isLoading: boolean;
  error: MarketDataError | null;
  lastUpdated: number | null;
  nextRefreshIn: number;
  refresh: () => void;
}
