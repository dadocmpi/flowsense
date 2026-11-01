// ============================================
// TWELVE DATA SYMBOL MAPPING
// ============================================
// The ONE place that decides which upstream symbol each asset requests.
//
// DEFAULTS THAT WORK ON THE FREE PLAN. Twelve Data's continuous futures symbols
// (GC1!, ES1!, YM1!, NQ1!) are not available on the free plan, so the shipped
// defaults are spot / ETF proxies:
//
//   Gold      XAU/USD   (spot gold)
//   S&P 500   SPY       (SPDR S&P 500 ETF)
//   Dow       DIA       (SPDR Dow Jones ETF)
//   Nasdaq    QQQ       (Invesco QQQ Trust, Nasdaq-100 ETF)
//
// Each is a proxy, never the futures contract, and `kind: 'proxy'` is what makes
// the UI label it as one. `kind: 'futures'` is reserved for a real contract, so a
// deployment that pins GC1! via the environment gets the futures label.
//
// There is exactly ONE configured symbol per asset. The app does NOT probe at
// runtime: probing cost a credit per candidate, so a plan that did not entitle a
// symbol spent three credits per timeframe before it found a working proxy. The
// symbol is a configuration fact (see the `SYMBOL_*` environment variables), and
// a symbol that fails returns an error for that asset rather than spending more
// credits on another attempt.
//
// Which symbol a given plan entitles is discovered ONCE, out of band, with
// `npm run check:symbols`. Nothing here is fabricated: an unconfigured or failing
// symbol produces an honest error, never a synthetic series.

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
  /**
   * The environment variable that overrides this asset's symbol. One variable per
   * asset, so a deployment whose plan differs changes it in ONE place.
   */
  envVar: string;
}

/**
 * Gold, S&P 500, Dow and Nasdaq.
 *
 * One symbol each, defaulting to a spot / ETF proxy that the free plan serves.
 * A deployment with futures entitlement pins the continuous contract through the
 * `SYMBOL_*` environment variable rather than paying for a runtime walk.
 *
 * Twelve Data's index symbols (SPX, DJI, NDX) are quote-only on some plans and
 * cannot serve time_series, so they are not offered as defaults.
 */
export const INSTRUMENT_SYMBOLS: InstrumentSymbols[] = [
  {
    instrumentId: 'GC',
    name: 'Gold',
    envVar: 'SYMBOL_GOLD',
    symbol: { symbol: 'XAU/USD', kind: 'proxy', description: 'Gold spot (proxy)' },
  },
  {
    instrumentId: 'ES',
    name: 'S&P 500',
    envVar: 'SYMBOL_SP500',
    symbol: { symbol: 'SPY', kind: 'proxy', description: 'SPDR S&P 500 ETF (proxy)' },
  },
  {
    instrumentId: 'YM',
    name: 'Dow Jones',
    envVar: 'SYMBOL_DOW',
    symbol: { symbol: 'DIA', kind: 'proxy', description: 'SPDR Dow Jones ETF (proxy)' },
  },
  {
    instrumentId: 'NQ',
    name: 'Nasdaq 100',
    envVar: 'SYMBOL_NASDAQ',
    symbol: { symbol: 'QQQ', kind: 'proxy', description: 'Invesco QQQ Trust, Nasdaq-100 ETF (proxy)' },
  },
];

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
  { instrumentId: 'GC', name: 'Gold', symbol: 'XAU/USD', kind: 'proxy', description: 'Gold spot' },
  { instrumentId: 'GC', name: 'Gold', symbol: 'GC1!', kind: 'futures', description: 'Gold futures (continuous)' },
  { instrumentId: 'GC', name: 'Gold', symbol: 'GLD', kind: 'proxy', description: 'SPDR Gold Shares ETF' },
  { instrumentId: 'ES', name: 'S&P 500', symbol: 'SPY', kind: 'proxy', description: 'SPDR S&P 500 ETF' },
  { instrumentId: 'ES', name: 'S&P 500', symbol: 'ES1!', kind: 'futures', description: 'E-mini S&P 500 futures (continuous)' },
  { instrumentId: 'YM', name: 'Dow Jones', symbol: 'DIA', kind: 'proxy', description: 'SPDR Dow Jones ETF' },
  { instrumentId: 'YM', name: 'Dow Jones', symbol: 'YM1!', kind: 'futures', description: 'E-mini Dow futures (continuous)' },
  { instrumentId: 'NQ', name: 'Nasdaq 100', symbol: 'QQQ', kind: 'proxy', description: 'Invesco QQQ Trust, Nasdaq-100 ETF' },
  { instrumentId: 'NQ', name: 'Nasdaq 100', symbol: 'NQ1!', kind: 'futures', description: 'E-mini Nasdaq-100 futures (continuous)' },
];

/**
 * The single symbol configured for an instrument, or undefined if unmapped.
 *
 * An environment override pins the symbol in ONE place, so a deployment whose
 * plan differs never pays for a runtime probe to discover that. The asset's own
 * `SYMBOL_*` variable wins; the older `TWELVE_DATA_SYMBOL_<ID>` name is still
 * honoured so an existing deployment keeps working.
 */
export function configuredSymbol(instrumentId: string): SymbolCandidate | undefined {
  const entry = instrumentSymbols(instrumentId);
  if (!entry) return undefined;

  const override = (
    process.env[entry.envVar] ??
    process.env[`TWELVE_DATA_SYMBOL_${entry.instrumentId}`] ??
    ''
  ).trim();
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
 * Twelve Data answers HTTP 200 with a status:"error" body for an unentitled or
 * unknown symbol, so "this symbol is not available on your plan" has to be read
 * from the message rather than the status code. This is deliberately NOT the same
 * as a rate limit: a symbol/plan error must never trigger a retry loop.
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
    lower.includes('symbol is not available') ||
    lower.includes('not available')
  );
}

/**
 * Twelve Data's rate-limit / credit-exhaustion wording.
 *
 * A real rate limit is the ONLY thing that earns our "retrying in Xs" state and
 * an automatic retry after the minute resets.
 */
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
