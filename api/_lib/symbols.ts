// ============================================
// TWELVE DATA SYMBOL MAPPING
// ============================================
// The ONE place that decides which upstream symbol each instrument requests.
//
// Twelve Data's entitlement depends on the plan, so nothing can be assumed: a
// symbol that works on one account answers "not entitled" on another. Rather
// than hard-code a guess, each instrument carries an ORDERED list of candidate
// symbols, and the server walks it until one returns real candles. The first
// candidate that works is remembered for the life of the serverless instance.
//
// Each candidate declares what it actually is, so the UI can label it honestly:
//
//   kind 'futures'  a real futures contract (continuous or dated)
//   kind 'proxy'    a spot / index / ETF stand-in for the futures contract
//
// A proxy is NEVER presented as the futures contract. If ES futures are not
// entitled and the app falls back to SPY, the UI says "SPY (proxy)".
//
// Nothing here is fabricated: a candidate list that all fail produces an honest
// "no symbol on this plan returned data" error, not a synthetic series.

export type SymbolKind = 'futures' | 'proxy';

export interface SymbolCandidate {
  /** The symbol string sent to Twelve Data. */
  symbol: string;
  kind: SymbolKind;
  /** Plain-English description shown next to the instrument name. */
  description: string;
  /**
   * True for the exchange-traded continuous contract the instrument is really
   * about (e.g. GC1!). Such a symbol is only worth trying on plans that include
   * futures data.
   */
  continuous?: boolean;
}

export interface InstrumentSymbols {
  instrumentId: string;
  /** Human-readable name, for logs and the discovery CLI. */
  name: string;
  candidates: SymbolCandidate[];
}

/**
 * Gold, S&P 500 and Dow Jones.
 *
 * Order matters. Futures first, because that is what the instrument IS; then the
 * most faithful proxy; then the broadest ETF as a last resort. Twelve Data's
 * index symbols (SPX, DJI) are quote-only on some plans and cannot serve
 * time_series, which is exactly why they are not the final fallback.
 */
export const INSTRUMENT_SYMBOLS: InstrumentSymbols[] = [
  {
    instrumentId: 'GC',
    name: 'Gold',
    candidates: [
      { symbol: 'GC1!', kind: 'futures', description: 'Gold futures (continuous)', continuous: true },
      { symbol: 'XAU/USD', kind: 'proxy', description: 'Gold spot' },
      { symbol: 'GLD', kind: 'proxy', description: 'SPDR Gold Shares ETF' },
    ],
  },
  {
    instrumentId: 'ES',
    name: 'S&P 500',
    candidates: [
      { symbol: 'ES1!', kind: 'futures', description: 'E-mini S&P 500 futures (continuous)', continuous: true },
      { symbol: 'SPX', kind: 'proxy', description: 'S&P 500 index' },
      { symbol: 'SPY', kind: 'proxy', description: 'SPDR S&P 500 ETF' },
    ],
  },
  {
    instrumentId: 'YM',
    name: 'Dow Jones',
    candidates: [
      { symbol: 'YM1!', kind: 'futures', description: 'E-mini Dow futures (continuous)', continuous: true },
      { symbol: 'DJI', kind: 'proxy', description: 'Dow Jones Industrial Average index' },
      { symbol: 'DIA', kind: 'proxy', description: 'SPDR Dow Jones ETF' },
    ],
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

export function candidatesFor(instrumentId: string): SymbolCandidate[] {
  return INSTRUMENT_SYMBOLS.find(entry => entry.instrumentId === instrumentId.toUpperCase())?.candidates ?? [];
}

export function findCandidate(instrumentId: string, symbol: string): SymbolCandidate | undefined {
  return candidatesFor(instrumentId).find(candidate => candidate.symbol === symbol);
}

/**
 * Twelve Data answers HTTP 200 with a status:"error" body for an unentitled
 * symbol, so entitlement has to be read from the message rather than the status
 * code. These are the phrasings that mean "try the next candidate".
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
