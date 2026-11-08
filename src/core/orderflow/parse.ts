// ============================================
// BINANCE USDT-M FLOW MESSAGE PARSING
// ============================================
// Pure parsing of the public market streams, split out from the socket so it can
// be tested against captured frames without a network.
//
// Streams (combined form, `{ stream, data }`, or the raw `data` alone):
//
//   <sym>@depth20@100ms  partial book snapshot, top 20 levels, every 100 ms
//   <sym>@trade          one aggressive fill, carrying the `m` flag
//   <sym>@bookTicker     best bid/ask with sizes
//
// THE `m` FLAG. In the venue's schema `m` is `isBuyerMaker`: true means the BUYER
// was resting, so the AGGRESSOR was the SELLER (a market sell hit the bid). False
// means the aggressor was the BUYER. `tradeSide` is the one place that mapping
// lives; nothing downstream re-derives it.
//
// Numbers arrive as decimal STRINGS and are parsed to numbers here, because the
// venue's string form is exact and its JSON form is not.

import type {
  BookLevel,
  BookSnapshot,
  BookTicker,
  ParsedFlowMessage,
  TradePrint,
} from './types';

/** `m` (isBuyerMaker) -> which side took liquidity. */
export function tradeSide(buyerIsMaker: boolean): 'BUY' | 'SELL' {
  return buyerIsMaker ? 'SELL' : 'BUY';
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function levels(raw: unknown): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  const out: BookLevel[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const price = num(entry[0]);
    const size = num(entry[1]);
    if (price === null || size === null) continue;
    out.push({ price, size });
  }
  return out;
}

/** Unwrap the combined-stream envelope, or pass a raw payload through. */
function payloadOf(record: Record<string, unknown>): Record<string, unknown> | null {
  const data = record.data;
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  return record;
}

/**
 * Parse one raw WebSocket frame. Never throws: an unreadable frame is UNKNOWN.
 */
export function parseFlowMessage(raw: string, receivedAt: number = Date.now()): ParsedFlowMessage {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { kind: 'UNKNOWN' };
  }
  if (!decoded || typeof decoded !== 'object') return { kind: 'UNKNOWN' };

  const payload = payloadOf(decoded as Record<string, unknown>);
  if (!payload) return { kind: 'UNKNOWN' };

  switch (payload.e) {
    case 'depthUpdate':
      return parseDepth(payload, receivedAt);
    case 'trade':
      return parseTrade(payload, receivedAt);
    case 'bookTicker':
      return parseBookTicker(payload, receivedAt);
    default:
      return { kind: 'UNKNOWN' };
  }
}

function parseDepth(payload: Record<string, unknown>, receivedAt: number): ParsedFlowMessage {
  const bids = levels(payload.b);
  const asks = levels(payload.a);
  if (bids.length === 0 && asks.length === 0) return { kind: 'UNKNOWN' };
  // The venue lists bids highest-first and asks lowest-first already; sort
  // defensively so the ladder's best-first ordering never depends on that.
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  const snapshot: BookSnapshot = {
    exchangeTime: num(payload.T) ?? num(payload.E) ?? receivedAt,
    receivedAt,
    bids,
    asks,
    updateId: num(payload.u) ?? 0,
  };
  return { kind: 'DEPTH', snapshot };
}

function parseTrade(payload: Record<string, unknown>, receivedAt: number): ParsedFlowMessage {
  const price = num(payload.p);
  const qty = num(payload.q);
  const time = num(payload.T) ?? num(payload.E) ?? receivedAt;
  if (price === null || qty === null) return { kind: 'UNKNOWN' };

  const buyerIsMaker = payload.m === true;
  const print: TradePrint = {
    id: num(payload.t) ?? 0,
    time,
    price,
    qty,
    buyerIsMaker,
    side: tradeSide(buyerIsMaker),
  };
  return { kind: 'TRADE', print };
}

function parseBookTicker(payload: Record<string, unknown>, receivedAt: number): ParsedFlowMessage {
  const bidPrice = num(payload.b);
  const askPrice = num(payload.a);
  const bidSize = num(payload.B);
  const askSize = num(payload.A);
  if (bidPrice === null || askPrice === null) return { kind: 'UNKNOWN' };

  const ticker: BookTicker = {
    exchangeTime: num(payload.T) ?? num(payload.E) ?? receivedAt,
    receivedAt,
    bidPrice,
    bidSize: bidSize ?? 0,
    askPrice,
    askSize: askSize ?? 0,
  };
  return { kind: 'BOOK_TICKER', ticker };
}
