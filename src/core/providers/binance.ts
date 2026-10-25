// ============================================
// BINANCE PROVIDER — CRYPTO
// ============================================
// Wraps the existing public Binance client. No API key, no proxy: the public
// endpoints are unauthenticated and CORS-open, so the browser talks to them
// directly.
//
// Binance is the one source in this app that provides genuine order flow — a
// real order book and a real tick-by-tick tape with the exchange's own
// aggressor flag — which is why the crypto group keeps the order-flow panel
// and the futures group does not.

import type { Candle, Timeframe } from '../types';
import type { Instrument } from '../instruments';
import {
  BinanceError,
  fetchKlines,
  formatUtc,
  openMarketStream,
  type StreamHandle,
} from '../../lib/binanceClient';
import {
  ProviderError,
  type MarketDataProvider,
  type OrderBookLevel,
  type OrderFlowHandlers,
  type Subscription,
  type TickHandlers,
  type TradeTapeItem,
} from './types';

/** App timeframe -> Binance interval. The names happen to coincide. */
const BINANCE_INTERVALS: Record<Timeframe, string> = {
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
};

function toProviderError(error: unknown): ProviderError {
  if (error instanceof BinanceError) {
    const map: Record<string, ProviderError['kind']> = {
      GEO_BLOCKED: 'GEO_BLOCKED',
      RATE_LIMIT: 'RATE_LIMIT',
      SYMBOL_NOT_FOUND: 'SYMBOL_NOT_FOUND',
      NETWORK: 'NETWORK',
      UPSTREAM: 'UPSTREAM',
      UNKNOWN: 'UNKNOWN',
    };
    return new ProviderError(map[error.kind] ?? 'UNKNOWN', error.message, error.status);
  }
  return new ProviderError('UNKNOWN', error instanceof Error ? error.message : 'Unknown error');
}

export const binanceProvider: MarketDataProvider = {
  id: 'binance',
  label: 'Binance public market data',
  capabilities: { candles: true, ticks: true, orderFlow: true },

  // No credential is involved, so this source is always available.
  isConfigured: () => true,

  async getCandles(instrument, timeframe, limit, signal) {
    const interval = BINANCE_INTERVALS[timeframe] ?? '5m';
    try {
      return await fetchKlines(instrument.providerSymbol, interval, limit, signal);
    } catch (error) {
      throw toProviderError(error);
    }
  },

  subscribeTicks(instrument, handlers: TickHandlers): Subscription {
    const handle: StreamHandle = openMarketStream(
      instrument.providerSymbol,
      {
        onStatus: status => handlers.onStatus?.(status),
        onTicker: payload => {
          const price = Number.parseFloat(String(payload.c));
          if (!Number.isFinite(price)) return;
          handlers.onTick({ instrumentId: instrument.id, price, timestamp: Date.now() });
        },
        onAggTrade: payload => {
          const price = Number.parseFloat(String(payload.p));
          if (!Number.isFinite(price)) return;
          handlers.onTick({ instrumentId: instrument.id, price, timestamp: Date.now() });
        },
        onKline: payload => {
          if (!handlers.onCandle) return;
          const candle = candleFromKline(payload);
          if (candle) handlers.onCandle(inferTimeframe(payload) ?? '5m', candle);
        },
      },
      BINANCE_INTERVALS['5m']
    );
    return { close: () => handle.close() };
  },

  subscribeOrderFlow(instrument, handlers: OrderFlowHandlers): Subscription {
    const handle = openMarketStream(
      instrument.providerSymbol,
      {
        onStatus: status => handlers.onStatus?.(status),
        onDepth: payload => {
          const bids = levelsFrom(payload.bids);
          const asks = levelsFrom(payload.asks);
          if (bids.length > 0 || asks.length > 0) handlers.onBook?.(bids, asks);
        },
        onAggTrade: payload => {
          const trade = tradeFrom(payload);
          if (trade) handlers.onTrade?.(trade);
        },
      },
      BINANCE_INTERVALS['5m']
    );
    return { close: () => handle.close() };
  },
};

function num(value: unknown, fallback = NaN): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function candleFromKline(payload: Record<string, unknown>): Candle | null {
  const k = payload.k;
  if (typeof k !== 'object' || k === null) return null;
  const row = k as Record<string, unknown>;

  const openTime = num(row.t);
  if (!Number.isFinite(openTime)) return null;

  const volume = num(row.v, 0);
  const takerBuyVolume = num(row.V, 0);

  return {
    datetime: formatUtc(openTime),
    open: num(row.o),
    high: num(row.h),
    low: num(row.l),
    close: num(row.c),
    volume,
    takerBuyVolume: Math.min(takerBuyVolume, volume),
  };
}

function inferTimeframe(payload: Record<string, unknown>): Timeframe | null {
  const k = payload.k;
  if (typeof k !== 'object' || k === null) return null;
  const interval = (k as Record<string, unknown>).i;
  const map: Record<string, Timeframe> = {
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1D',
    '1w': '1W',
  };
  return typeof interval === 'string' ? map[interval] ?? null : null;
}

function levelsFrom(raw: unknown): OrderBookLevel[] {
  if (!Array.isArray(raw)) return [];

  const parsed: Array<{ price: number; size: number }> = [];
  let maxSize = 0;

  for (const entry of raw.slice(0, 10)) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const price = num(entry[0]);
    const size = num(entry[1]);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (size > maxSize) maxSize = size;
    parsed.push({ price, size });
  }

  return parsed.map(level => ({
    price: level.price,
    size: level.size,
    total: level.price * level.size,
    percentage: maxSize > 0 ? Math.min(100, (level.size / maxSize) * 100) : 0,
  }));
}

function tradeFrom(raw: unknown): TradeTapeItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const price = num(row.p);
  const size = num(row.q);
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null;

  const eventTime = num(row.T, Date.now());
  const d = new Date(eventTime);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');

  // Binance `m` = "buyer is the maker", so true means the seller aggressed.
  const buyerIsMaker = Boolean(row.m);

  return {
    id: String(row.a ?? eventTime),
    price,
    size,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`,
    type: (buyerIsMaker ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
    quoteValue: price * size,
  };
}
