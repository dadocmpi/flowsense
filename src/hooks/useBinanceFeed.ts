// ============================================================================
// BINANCE FEED - REAL-TIME WEBSOCKET FOR XAUUSD PROXY (PAXGUSDT)
// ============================================================================
// Provides ticker, depth (order book), and aggTrade (tape) streams
// with automatic reconnection and state synchronization.

import { useEffect, useRef, useState } from 'react';

export interface TickerData {
  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
  percentage: number;
}

export interface TradeData {
  id: string;
  price: number;
  size: number;
  time: string;
  isBuyerMaker: boolean;
  timestamp: number;
}

export interface BinanceFeedState {
  ticker: TickerData | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  recentTrades: TradeData[];
  buyerVolume: number;
  sellerVolume: number;
  volumeDelta: number;
  buyerDominance: number;
  orderBookImbalance: number;
  hasOrderBook: boolean;
  hasTape: boolean;
  isConnected: boolean;
  lastTickerUpdate: number;
  lastTapeUpdate: number;
  lastDepthUpdate: number;
}

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

export const useBinanceFeed = (symbol: string) => {
  const [state, setState] = useState<BinanceFeedState>({
    ticker: null,
    bids: [],
    asks: [],
    recentTrades: [],
    buyerVolume: 0,
    sellerVolume: 0,
    volumeDelta: 0,
    buyerDominance: 0.5,
    orderBookImbalance: 0,
    hasOrderBook: false,
    hasTape: false,
    isConnected: false,
    lastTickerUpdate: 0,
    lastTapeUpdate: 0,
    lastDepthUpdate: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const buyerVolRef = useRef(0);
  const sellerVolRef = useRef(0);

  useEffect(() => {
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;

      const ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker/${symbol.toLowerCase()}@depth10@100ms/${symbol.toLowerCase()}@aggTrade`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        reconnectAttemptsRef.current = 0;
        setState(prev => ({ ...prev, isConnected: true }));
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const msg = JSON.parse(event.data);
          const now = Date.now();

          // Ticker
          if (msg.e === '24hrTicker') {
            const ticker: TickerData = {
              price: parseFloat(msg.c),
              change: parseFloat(msg.p),
              percentChange: parseFloat(msg.P),
              high: parseFloat(msg.h),
              low: parseFloat(msg.l),
              open: parseFloat(msg.o),
              volume: parseFloat(msg.v),
              timestamp: now,
            };
            setState(prev => ({ ...prev, ticker, lastTickerUpdate: now }));
          }

          // Order book depth
          if (msg.bids && msg.asks) {
            let maxTotal = 0;
            const bids: OrderBookLevel[] = msg.bids.slice(0, 10).map((b: string[]) => {
              const price = parseFloat(b[0]);
              const size = parseFloat(b[1]);
              const total = price * size;
              if (total > maxTotal) maxTotal = total;
              return { price, size, total, percentage: 0 };
            });
            const asks: OrderBookLevel[] = msg.asks.slice(0, 10).map((a: string[]) => {
              const price = parseFloat(a[0]);
              const size = parseFloat(a[1]);
              const total = price * size;
              if (total > maxTotal) maxTotal = total;
              return { price, size, total, percentage: 0 };
            });

            const finalBids = bids.map(b => ({ ...b, percentage: Math.min(100, (b.total / (maxTotal || 1)) * 100) }));
            const finalAsks = asks.map(a => ({ ...a, percentage: Math.min(100, (a.total / (maxTotal || 1)) * 100) }));

            // Imbalance: positive = more bid volume
            const bidVol = finalBids.reduce((s, b) => s + b.size, 0);
            const askVol = finalAsks.reduce((s, a) => s + a.size, 0);
            const imbalance = bidVol + askVol > 0 ? (bidVol - askVol) / (bidVol + askVol) : 0;

            setState(prev => ({
              ...prev,
              bids: finalBids,
              asks: finalAsks,
              orderBookImbalance: imbalance,
              hasOrderBook: true,
              lastDepthUpdate: now,
            }));
          }

          // Trades
          if (msg.e === 'aggTrade') {
            const price = parseFloat(msg.p);
            const size = parseFloat(msg.q);
            const isBuyerMaker = msg.m;

            if (isBuyerMaker) {
              sellerVolRef.current += size;
            } else {
              buyerVolRef.current += size;
            }

            const d = new Date(msg.T);
            const timeStr = d.toTimeString().split(' ')[0] + '.' + Math.floor(d.getMilliseconds() / 100);

            const trade: TradeData = {
              id: `${msg.a}`,
              price,
              size,
              time: timeStr,
              isBuyerMaker,
              timestamp: msg.T,
            };

            const totalVol = buyerVolRef.current + sellerVolRef.current || 1;
            const buyerDom = buyerVolRef.current / totalVol;
            const delta = buyerVolRef.current - sellerVolRef.current;

            setState(prev => ({
              ...prev,
              recentTrades: [trade, ...prev.recentTrades.slice(0, 19)],
              buyerVolume: buyerVolRef.current,
              sellerVolume: sellerVolRef.current,
              volumeDelta: delta,
              buyerDominance: buyerDom,
              hasTape: true,
              lastTapeUpdate: now,
            }));
          }
        } catch (e) {
          // ignore parse error
        }
      };

      ws.onerror = () => {
        // close will trigger reconnect
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setState(prev => ({ ...prev, isConnected: false }));
        const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptsRef.current));
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(connect, backoff);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [symbol]);

  return state;
};