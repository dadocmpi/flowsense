// ============================================
// TWELVE DATA SYMBOL MAPPING (server-side)
// ============================================
// The server-side reader of the ONE symbol catalog: src/config/symbols.ts. This
// file adds the one thing the config cannot — reading the environment override —
// and re-exports the catalog so nothing else has to reach across the boundary.
//
// There is exactly ONE configured symbol per asset. The app does NOT probe at
// runtime: probing cost a credit per candidate, so a plan that did not entitle
// the futures contract spent three credits per timeframe before it found a
// working proxy — a full page load could spend the whole minute on discovery
// alone. Instead the working symbol is a configuration fact (the instrument's
// `SYMBOL_*` environment variable, or the default in src/config/symbols.ts), and
// a symbol that fails returns an error for that asset rather than spending more
// credits on another attempt.
//
// `kind` tells the UI how to label what it is reading honestly:
//
//   kind 'futures'  a real futures contract (continuous or dated)
//   kind 'proxy'    a spot / index / ETF stand-in for the futures contract
//
// A proxy is NEVER presented as the futures contract. If a deployment is
// configured to read SPY, the UI says "SPY (proxy)".
//
// Which symbol a given plan entitles is discovered ONCE, out of band, with
// `npm run check:symbols`; the answer is pinned in the config or the environment.
// Nothing here is fabricated: an unconfigured or failing symbol produces an
// honest error, never a synthetic series.

import {
  INSTRUMENT_SYMBOLS as SYMBOL_CONFIG,
  instrumentSymbolConfig,
  type InstrumentSymbolConfig,
  type SymbolCandidate,
  type SymbolKind,
} from '../../src/config/symbols.js';

export type { SymbolCandidate, SymbolKind } from '../../src/config/symbols.js';

/**
 * The catalog of configured instruments, re-exported from the config file so the
 * routes and the discovery CLI have one source of truth.
 *
 * Gold, S&P 500, Dow Jones and Nasdaq. One proxy symbol each by default, because
 * the continuous-futures contracts are not entitled on every Twelve Data plan.
 */
export const INSTRUMENT_SYMBOLS: InstrumentSymbolConfig[] = SYMBOL_CONFIG;

/**
 * Timezone sent to Twelve Data on every request.
 *
 * The app stores candles as UTC and renders them in the viewer's local zone, so
 * the request must be pinned to a fixed zone rather than left to the vendor's
 * default. Pinning it means a payload is reproducible regardless of where the
 * serverless function happens to run.
 */
export const TWELVEDATA_TIMEZONE = 'UTC';

/** Twelve Data's per-request outputsize ceiling on the shipped plan tier. */
export const TWELVEDATA_MAX_OUTPUTSIZE = 5000;

export function instrumentSymbols(instrumentId: string): InstrumentSymbolConfig | undefined {
  return instrumentSymbolConfig(instrumentId);
}

export interface DiscoveryCandidate {
  instrumentId: string;
  name: string;
  symbol: string;
  kind: SymbolKind;
  description: string;
}

/**
 * The symbols the discovery CLI and the diagnostic route probe.
 *
 * This is a superset of the app's single configured symbol. Discovery exists to
 * find a replacement when the default does not work on a plan, so it still knows
 * the proxy-then-futures options — but only an explicit diagnostic run ever
 * touches them. The app itself requests only `configuredSymbol`.
 */
export const DISCOVERY_CANDIDATES: DiscoveryCandidate[] = [
  { instrumentId: 'GC', name: 'Gold', symbol: 'XAU/USD', kind: 'proxy', description: 'Gold spot' },
  { instrumentId: 'GC', name: 'Gold', symbol: 'GLD', kind: 'proxy', description: 'SPDR Gold Shares ETF' },
  { instrumentId: 'GC', name: 'Gold', symbol: 'GC1!', kind: 'futures', description: 'Gold futures (continuous)' },
  { instrumentId: 'ES', name: 'S&P 500', symbol: 'SPY', kind: 'proxy', description: 'SPDR S&P 500 ETF' },
  { instrumentId: 'ES', name: 'S&P 500', symbol: 'ES1!', kind: 'futures', description: 'E-mini S&P 500 futures (continuous)' },
  { instrumentId: 'YM', name: 'Dow Jones', symbol: 'DIA', kind: 'proxy', description: 'SPDR Dow Jones ETF' },
  { instrumentId: 'YM', name: 'Dow Jones', symbol: 'YM1!', kind: 'futures', description: 'E-mini Dow futures (continuous)' },
  { instrumentId: 'NQ', name: 'Nasdaq', symbol: 'QQQ', kind: 'proxy', description: 'Invesco QQQ Trust (Nasdaq-100)' },
  { instrumentId: 'NQ', name: 'Nasdaq', symbol: 'NQ1!', kind: 'futures', description: 'E-mini Nasdaq-100 futures (continuous)' },
];

/** The single symbol configured for an instrument, or undefined if unmapped. */
export function configuredSymbol(instrumentId: string): SymbolCandidate | undefined {
  const entry = instrumentSymbols(instrumentId);
  if (!entry) return undefined;

  // A per-instrument environment override pins the symbol in ONE place, so a
  // deployment whose plan does not carry the default symbol never pays for a
  // runtime probe to discover that. The variable NAME comes from the config, so
  // it is declared once.
  const override = (process.env[entry.envVar] ?? '').trim();
  return override.length > 0 ? overrideCandidate(override) : entry.symbol;
}

/**
 * A symbol named by configuration rather than the catalog.
 *
 * A continuous contract (`!`-suffixed) is still a futures contract; anything
 * else is reported as a proxy rather than being called the futures contract.
 */
function overrideCandidate(symbol: string): SymbolCandidate {
  return symbol.endsWith('!')
    ? { symbol, kind: 'futures', description: `${symbol} (configured)`, continuous: true }
    : { symbol, kind: 'proxy', description: `${symbol} (configured)` };
}

export function findCandidate(instrumentId: string, symbol: string): SymbolCandidate | undefined {
  const configured = configuredSymbol(instrumentId);
  return configured && configured.symbol === symbol ? configured : undefined;
}

/**
 * Twelve Data answers HTTP 200 with a status:"error" body for an unentitled
 * symbol, so entitlement has to be read from the message rather than the status
 * code.
 */
export function isEntitlementError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not entitled') ||
    lower.includes('not authorized') ||
    lower.includes('subscription') ||
    lower.includes('upgrade') ||
    lower.includes('invalid symbol') ||
    // The wording Twelve Data returns for a symbol this plan cannot read, e.g.
    // "symbol or figi parameter is missing or invalid".
    lower.includes('figi') ||
    lower.includes('missing or invalid') ||
    lower.includes('not found') ||
    lower.includes('no data') ||
    lower.includes('symbol is not available')
  );
}

/** Twelve Data's rate-limit / credit-exhaustion wording. */
export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('credits') ||
    lower.includes('api limit') ||
    lower.includes('quota')
  );
}
