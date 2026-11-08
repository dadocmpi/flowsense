// ============================================
// WS -> PRICE FRAME RELAY (pure)
// ============================================
// The vendor's price WebSocket speaks a slightly different frame than the
// client's parser accepts, so the relay translates in one pure function that
// can be tested without a socket:
//
//   vendor   { event: 'price', symbol: 'XAU/USD', price: '2330.5', timestamp: 1718 }
//   client   { event: 'price', symbol: 'XAU/USD', price: 2330.5, timestamp: 1718 }
//
// The vendor sends the price and timestamp as strings; the client's
// `parseWsMessage` only accepts finite numbers. Normalising here keeps the
// client parser strict and the translation testable.
//
// This is a PRICE feed: it carries no order book and no aggressor flag. It can
// only ever update the last candle's close, and the tick rule on the client
// infers the side from the price direction — never a vendor-reported one.

/**
 * Translate one vendor frame into the frame the client parser expects.
 *
 * Returns the frame as a JSON string to forward, or null when the frame is not
 * a usable price frame (an unreadable body, a heartbeat, or a malformed price).
 */
export function relayPriceFrame(raw: string): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  if (record.event !== 'price') return null;

  const symbol = typeof record.symbol === 'string' ? record.symbol : null;
  const price = typeof record.price === 'number' ? record.price : Number.parseFloat(String(record.price));
  const timestamp =
    typeof record.timestamp === 'number' ? record.timestamp : Number.parseFloat(String(record.timestamp));

  if (!symbol || !Number.isFinite(price) || !Number.isFinite(timestamp)) return null;

  return JSON.stringify({ event: 'price', symbol, price, timestamp });
}

/**
 * The subscribe frame the vendor expects for a symbol.
 *
 * A price stream is one credit per symbol per minute on Twelve Data; the relay
 * opens ONE upstream socket per client and subscribes to the ONE symbol the
 * client asked for, so a page cannot multiply the spend.
 */
export function subscribeFrame(symbol: string): string {
  return JSON.stringify({ action: 'subscribe', params: { symbols: symbol } });
}

/** The vendor WebSocket endpoint, with the key in the query string. */
export function vendorSocketUrl(apiKey: string): string {
  return `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(apiKey)}`;
}
