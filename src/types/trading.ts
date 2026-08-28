export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface UserZoneConfig {
  enabled: boolean;
  direction: 'BUY' | 'SELL';
  zoneName: string;
  minPrice: number;
  maxPrice: number;
  stopLoss: number;
  takeProfit: number;
  startTime: string; // "09:00"
  endTime: string;   // "11:30"
  notes?: string;
}

export interface SniperDecision {
  status: 'ENTER_NOW' | 'ZONE_ARMED' | 'WAITING_FLOW' | 'OUT_OF_ZONE' | 'OUT_OF_TIME' | 'DISABLED';
  action: 'BUY' | 'SELL' | 'HOLD';
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'STANDBY';
  headline: string;
  subtext: string;
  confluencesMet: string[];
  missingFactors: string[];
  zoneProgress: number; // 0 to 100% position inside zone
  isInsideZone: boolean;
  isInsideTimeWindow: boolean;
  flowConfirmed: boolean;
}

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
  {
    symbol: 'ES1!',
    name: 'E-mini S&P 500 Futures (Continuous)',
    exchange: 'CME',
    precision: 2,
    contractSize: '50 USD',
    tickSize: 0.25
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
}

export interface OrderBookLevel {
  price: number;
  size: number;
  cumulativeSize: number;
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
  institutionalPressure: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeFeedItem[];
  
  // Summaries
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
}