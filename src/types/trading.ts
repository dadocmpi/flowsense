export interface RealSymbolInfo {
  symbol: string;
  binanceSymbol: string;
  name: string;
  category: 'CRYPTO' | 'COMMODITIES';
  precision: number;
}

export const SUPPORTED_SYMBOLS: RealSymbolInfo[] = [
  { symbol: 'BTC/USDT', binanceSymbol: 'BTCUSDT', name: 'Bitcoin', category: 'CRYPTO', precision: 2 },
  { symbol: 'ETH/USDT', binanceSymbol: 'ETHUSDT', name: 'Ethereum', category: 'CRYPTO', precision: 2 },
  { symbol: 'SOL/USDT', binanceSymbol: 'SOLUSDT', name: 'Solana', category: 'CRYPTO', precision: 2 },
  { symbol: 'PAXG/USDT', binanceSymbol: 'PAXGUSDT', name: 'Ouro (PAX Gold)', category: 'COMMODITIES', precision: 2 },
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
  score: number; // 0 (Venda Forte) a 100 (Compra Forte)
  verdict: 'VENDA FORTE' | 'VENDA' | 'NEUTRO' | 'COMPRA' | 'COMPRA FORTE';
}

export interface RealOrderBookLevel {
  price: number;
  size: number;
  total: number;
  percentage: number;
}

export interface LiveTrade {
  id: number;
  price: number;
  size: number;
  time: string;
  isBuyerMaker: boolean;
}

export interface RealTradingState {
  symbol: string;
  price: number;
  priceChange24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  
  // Order Flow Real
  bids: RealOrderBookLevel[];
  asks: RealOrderBookLevel[];
  recentTrades: LiveTrade[];
  buyerVolume: number;
  sellerVolume: number;
  volumeDelta: number;
  
  // Indicadores Reais
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  orderFlowIndicators: IndicatorSignal[];
  
  // Resumos da Bússola
  overallSummary: IndicatorSummary;
  oscillatorsSummary: IndicatorSummary;
  maSummary: IndicatorSummary;
  orderFlowSummary: IndicatorSummary;
}