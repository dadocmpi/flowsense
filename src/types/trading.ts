export interface AssetConfig {
  symbol: string;
  twelveSymbol: string;
  name: string;
  precision: number;
}

export const SUPPORTED_ASSETS: AssetConfig[] = [
  { symbol: 'XAU/USD', twelveSymbol: 'XAU/USD', name: 'Ouro / Dólar', precision: 2 },
  { symbol: 'WTI/USD', twelveSymbol: 'WTI/USD', name: 'Petróleo WTI / Dólar', precision: 2 },
];

export interface IndicatorSignal {
  name: string;
  value: string;
  action: 'COMPRA FORTE' | 'COMPRA' | 'NEUTRO' | 'VENDA' | 'VENDA FORTE';
}

export interface IndicatorSummary {
  buyCount: number;
  neutralCount: number;
  sellCount: number;
  score: number; // 0 a 100
  verdict: 'VENDA FORTE' | 'VENDA' | 'NEUTRO' | 'COMPRA' | 'COMPRA FORTE';
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
  
  // Indicadores calculados
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  orderFlowIndicators: IndicatorSignal[];
  
  // Order Flow em tempo real
  buyersPercent: number;
  sellersPercent: number;
  volumeDelta: number;
  absorptionRate: string;
  institutionalPressure: 'ALTA' | 'MEDIA' | 'BAIXA';
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeFeedItem[];
  
  // Resumos da Bússola
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
}