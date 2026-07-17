export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

export interface Asset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  category: 'FOREX' | 'CRYPTO' | 'COMMODITIES';
}

export interface OrderBookLevel {
  price: number;
  size: number;
  percentage: number;
}

export interface TradingMetrics {
  tendencia: 'ALTA FORTE' | 'ALTA' | 'BAIXA FORTE' | 'BAIXA' | 'NEUTRO';
  forca: 'FORTE' | 'MODERADA' | 'FRACA';
  momento: 'ALTISTA' | 'BAIXISTA' | 'NEUTRO';
  confluencia: 'ALTA' | 'MEDIA' | 'BAIXA';
  buyersPercent: number;
  sellersPercent: number;
  delta: number;
  absorcao: 'ALTA' | 'MEDIA' | 'BAIXA';
}