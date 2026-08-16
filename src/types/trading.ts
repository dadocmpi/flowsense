export interface AssetConfig {
  symbol: string;
  twelveSymbol: string;
  name: string;
  precision: number;
}

export const SUPPORTED_ASSETS: AssetConfig[] = [
  { symbol: 'XAU/USD', twelveSymbol: 'XAU/USD', name: 'Gold / US Dollar', precision: 2 },
];

export interface IndicatorSignal {
  name: string;
  value: string;
  action: 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';
}

export interface IndicatorSummary {
  buyCount: number;
  neutralCount: number;
  sellCount: number;
  score: number; // 0 to 100
  verdict: 'STRONG SELL' | 'SELL' | 'NEUTRAL' | 'BUY' | 'STRONG BUY';
}

export interface OrderBookLevel {
  price: number;
  size: number;
  percentage: number;
}

export interface TradeFeedItem {
  id: string;
  price: number;
  size: number;
  time: string;
  type: 'BUY' | 'SELL';
}

export interface TwelveDataState {
  symbol: string;
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
  institutionalPressure: 'HIGH' | 'MEDIUM' | 'LOW';
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeFeedItem[];
  
  // Compass Summaries
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
}