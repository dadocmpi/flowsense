export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface AssetConfig {
  symbol: string;
  name: string;
  exchange: string;
  precision: number;
  contractSize: string;
  tickSize: number;
}

export const SUPPORTED_ASSETS: AssetConfig[] = [
  { 
    symbol: 'MGC1!', 
    name: 'Micro Gold Futures (Continuous)', 
    exchange: 'COMEX / CME', 
    precision: 2,
    contractSize: '10 troy oz',
    tickSize: 0.10
  },
];

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
  divergenceDetected?: boolean;
  divergenceMessage?: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  totalUsd: number;
  cumulativeSize: number;
  cumulativeUsd: number;
  percentage: number;
}

export interface TradeFeedItem {
  id: string;
  price: number;
  size: number;
  time: string;
  type: 'BUY' | 'SELL';
  aggressor: 'BUY_AGGR' | 'SELL_AGGR';
}

export interface SparklinePoint {
  time: string;
  delta: number;
  pressure: number; // 0: low, 1: med, 2: high, 3: extreme
  buyersPercent: number;
  price: number;
}

export type InstitutionalPressureLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface TwelveDataState {
  symbol: string;
  timeframe: Timeframe;
  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  datetime: string;
  isLive: boolean;
  isMarketOpen: boolean;
  
  // Indicators
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  orderFlowIndicators: IndicatorSignal[];
  
  // Order Flow
  buyersPercent: number;
  sellersPercent: number;
  volumeDelta: number;
  absorptionRate: string;
  institutionalPressure: InstitutionalPressureLevel;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeFeedItem[];
  sparklineData: SparklinePoint[];
  
  // Compass Summaries & Divergence
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
}