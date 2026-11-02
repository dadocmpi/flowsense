// ============================================
// INSTRUMENT CATALOG
// ============================================
// Gold, S&P 500, Dow Jones and Nasdaq are the instruments this app ships, all
// served by the same provider.
//
// An instrument does NOT carry a data source of its own: it declares which
// provider *can* serve it (`providerId`). Whether that provider is actually
// configured is decided at runtime from the server's environment, so an
// instrument with no configured source renders an explicit
// "no data source configured" state instead of any number at all.
//
// The instrument does NOT carry the upstream symbol either. That is a single
// configuration fact in src/config/symbols.ts (overridable per instrument by the
// SYMBOL_* environment variables), read only by the server; the client learns
// what was requested from the candles/status response. Keeping the symbol out of
// this file is what guarantees there is exactly ONE place it can be built from.

export type ProviderId = 'futures';

/**
 * What the app is ACTUALLY reading for an instrument, once the server has
 * resolved a symbol. A Twelve Data plan may not entitle the futures contract, so
 * the app can be reading a spot or ETF proxy — and the UI must say so rather than
 * implying it is the futures contract.
 */
export interface ResolvedSource {
  /** The symbol the vendor was asked for, e.g. "XAU/USD" or "SPY". */
  symbol: string;
  /** The symbol the vendor echoed back, when it differs. */
  vendorSymbol?: string;
  kind: 'futures' | 'proxy';
  /** Plain-English label, e.g. "S&P 500 index (proxy)". */
  description: string;
  /** Vendor-reported instrument classification, when present. */
  instrumentType?: string;
  exchange?: string;
}

export interface Instrument {
  /** Stable id used in URLs and display. */
  id: string;
  name: string;
  exchange: string;
  precision: number;
  quote: string;
  providerId: ProviderId;
  /** Short label for the selector. */
  shortLabel: string;
}

/** Gold, S&P 500, Dow Jones and Nasdaq — the instruments this app ships. */
export const INSTRUMENTS: Instrument[] = [
  {
    id: 'GC',
    name: 'Gold',
    exchange: 'OTC',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    shortLabel: 'Gold',
  },
  {
    id: 'ES',
    name: 'S&P 500',
    exchange: 'NYSEARCA',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    shortLabel: 'S&P 500',
  },
  {
    id: 'YM',
    name: 'Dow Jones',
    exchange: 'NYSEARCA',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    shortLabel: 'Dow',
  },
  {
    id: 'NQ',
    name: 'Nasdaq',
    exchange: 'NASDAQ',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    shortLabel: 'Nasdaq',
  },
];

export const ALL_INSTRUMENTS: Instrument[] = [...INSTRUMENTS];

export const DEFAULT_INSTRUMENT_ID = 'GC';

export function findInstrument(id: string): Instrument | undefined {
  return ALL_INSTRUMENTS.find(instrument => instrument.id === id);
}
