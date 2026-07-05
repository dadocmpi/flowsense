export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

export interface Asset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  category: 'FOREX' | 'INDICES' | 'COMMODITIES';
}

export interface OrderFlowRow {
  id: string;
  time: string;
  delta: number;
  absorption: 'High' | 'Low' | 'None';
  imbalance: 'Buy' | 'Sell' | 'None';
  efficiency: number;
  displacement: boolean;
}