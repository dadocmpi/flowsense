// ============================================
// ORDER BOOK ADAPTER (server-side)
// ============================================
// The RIGHT reading is the resting ORDER BOOK. The browser never holds a
// vendor key, so the book is read through this server module and returned as a
// raw quote; the pressure percentage is computed client-side (src/core/orderbook)
// from that quote, so the number can never disagree with the book.
//
// WHERE THE BOOK COMES FROM
// The book is served by the asset's OWN market-data provider when that provider
// publishes one:
//
//   ES / YM / NQ -> Alpaca   /v2/stocks/snapshots (bid/ask price+size, volume)
//   GC           -> Twelve Data, which publishes NO book, so GC has none
//
// Alpaca is therefore the only book source in this build, and it needs no extra
// key: the ALPACA_API_KEY / ALPACA_API_SECRET the index assets already use are
// enough. It is on by default; set ORDERFLOW_PROVIDER=none to switch the book off.
//
// CONTRACT
//   return a quote -> the card renders the book and its pressure percentage
//   return null    -> the card shows "No order book source configured"
//
// The key stays server-side: this module reads it, and the browser only ever
// receives the numbers.

import { fetchAlpacaBook } from './alpaca.js';
import { alpacaConfigured, alpacaKeyId, alpacaSecretKey } from './futuresShared.js';
import { assetProvider, assetProviderConfig } from './assets.js';

/** A raw book snapshot, exactly the shape the client builds its reading from. */
export interface BookQuote {
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  /** Traded volume over the vendor's reference window (the session). */
  volume: number | null;
  /** Vendor-reported source label, for the provenance line. */
  source: string;
  /** Epoch ms the vendor stamped the quote with. */
  at: number | null;
}

export type OrderFlowVendor = 'none' | 'alpaca';

/**
 * Which adapter this deployment is configured to use.
 *
 * Alpaca is the default whenever its credentials are present, because it is the
 * book source for the index assets the app already reads through it; nothing
 * extra has to be configured. `ORDERFLOW_PROVIDER=none` disables the book.
 */
export function resolveOrderFlowVendor(): OrderFlowVendor {
  const raw = (process.env.ORDERFLOW_PROVIDER ?? '').trim().toLowerCase();
  if (raw === 'none') return 'none';
  if (raw === '' || raw === 'alpaca') return alpacaConfigured() ? 'alpaca' : 'none';
  // Any other named provider is not wired up in this build; say so rather than
  // pretending a source exists.
  return 'none';
}

/** The vendor key. Read only on the server; never returned to the client. */
export function orderFlowApiKey(): string | null {
  return alpacaSecretKey();
}

/**
 * True when a book source is configured AND has everything it needs.
 *
 * Alpaca without both credentials is not configured: saying so is more useful
 * than failing later with a vendor error the user cannot act on.
 */
export function orderFlowConfigured(): boolean {
  return resolveOrderFlowVendor() === 'alpaca';
}

/** A human label for the configured source, for the provenance line. */
export function orderFlowLabel(): string {
  return orderFlowConfigured() ? 'Alpaca (IEX)' : 'None';
}

/**
 * Read the resting book for one instrument.
 *
 * Returns null — never a fabricated quote — when the instrument's provider has no
 * book (Gold), when the book has no two-sided quote, or when the source is not
 * configured. The key is in `orderFlowApiKey()`.
 */
export async function fetchOrderFlowReading(params: {
  instrumentId: string;
  timeframe: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<BookQuote | null> {
  // Only the asset's own provider can supply its book. Gold reads Twelve Data,
  // which publishes no book, so it has none — the card says so.
  if (assetProvider(params.instrumentId) !== 'alpaca') return null;

  const config = assetProviderConfig(params.instrumentId);
  if (!config) return null;

  const keyId = alpacaKeyId();
  if (!keyId || !params.apiKey) return null;

  const book = await fetchAlpacaBook({
    symbol: config.symbol,
    keyId,
    secretKey: params.apiKey,
    signal: params.signal,
  });
  if (!book) return null;

  return { ...book, source: `Alpaca (${config.symbol}, IEX)` };
}
