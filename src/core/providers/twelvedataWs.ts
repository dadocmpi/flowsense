// ============================================
// TWELVE DATA WEBSOCKET MESSAGE PARSING
// ============================================
// Pure parsing of the vendor's price stream, split out from the socket so it can
// be tested without a network.
//
// Endpoint: wss://ws.twelvedata.com/v1/quotes/price?apikey=...
// Subscribe: { action: 'subscribe', params: { symbols: 'XAU/USD' } }
// Messages:  { event: 'price', symbol: 'XAU/USD', price: 2330.5, timestamp: 1718 }
//
// IMPORTANT: this is a PRICE feed. It carries no order book and no aggressor
// flag, so it can only ever update the last candle's close. It is not order
// flow, and nothing here may be presented as such.

export interface PriceMessage {
  event: 'price';
  symbol: string;
  price: number;
  /** Vendor sends epoch SECONDS. */
  timestamp: number;
}

export interface StatusMessage {
  event: 'subscribe-status' | 'heartbeat' | string;
  status?: string;
  success?: Array<{ symbol: string; exchange?: string }>;
  fails?: Array<{ symbol: string; message?: string }>;
}

export type ParsedMessage =
  | { kind: 'PRICE'; message: PriceMessage }
  | { kind: 'STATUS'; message: StatusMessage; ok: boolean; detail?: string }
  | { kind: 'UNKNOWN' };

/** Parse one raw WebSocket frame. Never throws: an unreadable frame is UNKNOWN. */
export function parseWsMessage(raw: string): ParsedMessage {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { kind: 'UNKNOWN' };
  }
  if (!payload || typeof payload !== 'object') return { kind: 'UNKNOWN' };

  const record = payload as Record<string, unknown>;

  if (record.event === 'price') {
    const symbol = typeof record.symbol === 'string' ? record.symbol : null;
    const price = typeof record.price === 'number' ? record.price : Number.parseFloat(String(record.price));
    const seconds = typeof record.timestamp === 'number' ? record.timestamp : Number.parseFloat(String(record.timestamp));
    if (!symbol || !Number.isFinite(price) || !Number.isFinite(seconds)) return { kind: 'UNKNOWN' };
    return {
      kind: 'PRICE',
      // The vendor stamps seconds; the app works in epoch ms.
      message: { event: 'price', symbol, price, timestamp: seconds * 1000 },
    };
  }

  if (typeof record.event === 'string') {
    const message = record as unknown as StatusMessage;
    const ok = message.status ? message.status === 'ok' : !Array.isArray(message.fails) || message.fails.length === 0;
    const failDetail = message.fails?.[0]?.message;
    return { kind: 'STATUS', message, ok, detail: failDetail };
  }

  return { kind: 'UNKNOWN' };
}

/**
 * Whether a subscribe-status frame means "this plan has no WebSocket access".
 * Used to fall back to REST polling rather than retrying forever.
 */
export function isEntitlementFailure(detail: string | undefined): boolean {
  if (!detail) return false;
  const lower = detail.toLowerCase();
  return (
    lower.includes('not entitled') ||
    lower.includes('subscription') ||
    lower.includes('upgrade') ||
    lower.includes('permission') ||
    lower.includes('forbidden')
  );
}
