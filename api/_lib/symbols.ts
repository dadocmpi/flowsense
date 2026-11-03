// ============================================
// TWELVE DATA SYMBOL MAPPING
// ============================================
// The ONE place that decides which upstream symbol each instrument requests.
//
// There is exactly ONE configured symbol per asset. The app does NOT probe at
// runtime: probing cost a credit per candidate, so a plan that did not entitle
// the futures contract spent three credits per timeframe before it found a
// working proxy — a full page load could spend the whole minute on discovery
// alone. Instead the working symbol is a configuration fact (see
// `TWELVE_DATA_SYMBOL_<ID>` in the environment), and a symbol that fails returns
// an error for that asset rather than spending more credits on another attempt.
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
// `npm run check:symbols`; the answer is pinned here or in the environment.
// Nothing here is fabricated: an unconfigured or failing symbol produces an
// honest error, never a synthetic series.

import { ASSET_PROVIDER_DEFAULTS, assetProviderConfig } from './assets.js';

export type SymbolKind = 'futures' | 'proxy';

export interface SymbolCandidate {
  /** The symbol string sent to Twelve Data. */
  symbol: string;
  kind: SymbolKind;
  /** Plain-English description shown next to the instrument name. */
  description: string;
  /**
   * True for the exchange-traded continuous contract the instrument is really
   * about (e.g. GC1!). Such a symbol is only worth using on plans that include
   * futures data.
   */
  continuous?: boolean;
}

export interface InstrumentSymbols {
  instrumentId: string;
  /** Human-readable name, for logs and the discovery CLI. */
  name: string;
  /** The single symbol the app requests. No ordered fallback list. */
  symbol: SymbolCandidate;
}

/**
 * The Twelve Data symbol catalog.
 *
 * This is the subset of the per-asset mapping (api/_lib/assets.ts) whose
 * provider is Twelve Data. Gold defaults here to spot XAU/USD; an asset moved to
 * Alpaca simply does not appear, so this list always describes what Twelve Data
 * is really asked for. A deployment can still pin a symbol with
 * `TWELVE_DATA_SYMBOL_<ID>` (kept for backwards compatibility) or the newer
 * `ASSET_SYMBOL_<ID>`.
 *
 * Twelve Data's index symbols (SPX, DJI) are quote-only on some plans and cannot
 * serve time_series, so they are not offered as defaults.
 */
function buildInstrumentSymbols(): InstrumentSymbols[] {
  const entries: InstrumentSymbols[] = [];
  for (const [instrumentId, config] of Object.entries(ASSET_PROVIDER_DEFAULTS)) {
    if (config.provider !== 'twelvedata') continue;
    entries.push({
      instrumentId,
      name: NAME_BY_ID[instrumentId] ?? instrumentId,
      symbol: { symbol: config.symbol, kind: 'proxy', description: `${config.symbol} (configured)` },
    });
  }
  return entries;
}

const NAME_BY_ID: Record<string, string> = {
  GC: 'Gold',
  ES: 'S&P 500',
  YM: 'Dow Jones',
  NQ: 'Nasdaq',
};

export const INSTRUMENT_SYMBOLS: InstrumentSymbols[] = buildInstrumentSymbols();

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

export function instrumentSymbols(instrumentId: string): InstrumentSymbols | undefined {
  return INSTRUMENT_SYMBOLS.find(entry => entry.instrumentId === instrumentId.toUpperCase());
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
 * the futures-then-proxy options — but only an explicit diagnostic run ever
 * touches them. The app itself requests only `configuredSymbol`.
 */
export const DISCOVERY_CANDIDATES: DiscoveryCandidate[] = [
  { instrumentId: 'GC', name: 'Gold', symbol: 'GC1!', kind: 'futures', description: 'Gold futures (continuous)' },
  { instrumentId: 'GC', name: 'Gold', symbol: 'XAU/USD', kind: 'proxy', description: 'Gold spot' },
  { instrumentId: 'GC', name: 'Gold', symbol: 'GLD', kind: 'proxy', description: 'SPDR Gold Shares ETF' },
  { instrumentId: 'ES', name: 'S&P 500', symbol: 'ES1!', kind: 'futures', description: 'E-mini S&P 500 futures (continuous)' },
  { instrumentId: 'ES', name: 'S&P 500', symbol: 'SPY', kind: 'proxy', description: 'SPDR S&P 500 ETF' },
  { instrumentId: 'YM', name: 'Dow Jones', symbol: 'YM1!', kind: 'futures', description: 'E-mini Dow futures (continuous)' },
  { instrumentId: 'YM', name: 'Dow Jones', symbol: 'DIA', kind: 'proxy', description: 'SPDR Dow Jones ETF' },
  { instrumentId: 'NQ', name: 'Nasdaq', symbol: 'NQ1!', kind: 'futures', description: 'E-mini Nasdaq 100 futures (continuous)' },
  { instrumentId: 'NQ', name: 'Nasdaq', symbol: 'QQQ', kind: 'proxy', description: 'Invesco QQQ Trust ETF' },
];

/** The single symbol configured for an instrument, or undefined if unmapped. */
export function configuredSymbol(instrumentId: string): SymbolCandidate | undefined {
  const id = instrumentId.toUpperCase();
  // An asset whose configured provider is Alpaca has no Twelve Data symbol, even
  // if it appears in the default catalog. Reporting one would let a diagnostic
  // claim Twelve Data serves an asset it does not.
  if (assetProviderConfig(id)?.provider !== 'twelvedata') return undefined;
  const entry = instrumentSymbols(id);
  if (!entry) return undefined;

  // A per-instrument environment override pins the symbol in ONE place, so a
  // deployment whose plan does not carry the default contract never pays for a
  // runtime probe to discover that. The newer ASSET_SYMBOL_<ID> (read through the
  // per-asset config) is honoured first; TWELVE_DATA_SYMBOL_<ID> is the legacy
  // name and still works.
  const fromAssetConfig = (assetProviderConfig(id)?.symbol ?? '').trim();
  const legacyOverride = (process.env[`TWELVE_DATA_SYMBOL_${id}`] ?? '').trim();
  const override = legacyOverride.length > 0 ? legacyOverride : fromAssetConfig !== entry.symbol.symbol ? fromAssetConfig : '';
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
