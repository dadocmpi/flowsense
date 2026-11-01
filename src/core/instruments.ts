// ============================================
// INSTRUMENT CATALOG
// ============================================
// Gold, S&P 500, Dow and Nasdaq are the instruments this app ships, all served
// by the same provider.
//
// DEFAULTS THAT WORK ON THE TWELVE DATA FREE PLAN. The vendor's continuous
// futures symbols (GC1!, ES1!, YM1!, NQ1!) are not available on the free plan, so
// the shipped defaults are spot / ETF proxies instead:
//
//   Gold      XAU/USD   (spot gold)
//   S&P 500   SPY       (SPDR S&P 500 ETF)
//   Dow       DIA       (SPDR Dow Jones ETF)
//   Nasdaq    QQQ       (Invesco QQQ Trust, the Nasdaq-100 ETF)
//
// Each one is a proxy, not the futures contract, and the UI labels it as a proxy
// — never as the contract. There is exactly ONE symbol per asset and NO runtime
// probing: the symbol is a configuration fact (SYMBOL_GOLD / SYMBOL_SP500 /
// SYMBOL_DOW / SYMBOL_NASDAQ, read server-side in api/_lib/symbols.ts), so a
// deployment can pin a different one without the app ever spending a credit
// hunting for it.
//
// An instrument does NOT carry a data source of its own: it declares which
// provider *can* serve it (`providerId`). Whether that provider is actually
// configured is decided at runtime from the server's environment, so an
// instrument with no configured source renders an explicit
// "no data source configured" state instead of any number at all.

export type ProviderId = 'futures';

/**
 * What the app is ACTUALLY reading for an instrument, once the server has
 * resolved a symbol. The shipped symbols are spot or ETF proxies, so the UI must
 * say so rather than implying it is the futures contract.
 */
export interface ResolvedSource {
  /** The symbol the vendor was asked for, e.g. "XAU/USD" or "SPY". */
  symbol: string;
  /** The symbol the vendor echoed back, when it differs. */
  vendorSymbol?: string;
  kind: 'futures' | 'proxy';
  /** Plain-English label, e.g. "SPDR S&P 500 ETF". */
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
  /**
   * The default symbol this instrument reads. The server may override it from
   * the environment; the status route reports the symbol actually in use, and the
   * UI renders that rather than this default.
   */
  providerSymbol: string;
  /** Short label for the selector. */
  shortLabel: string;
}

/** Gold, S&P 500, Dow and Nasdaq — the instruments this app ships. */
export const MARKET_INSTRUMENTS: Instrument[] = [
  {
    id: 'GC',
    name: 'Gold',
    exchange: 'Spot',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'XAU/USD',
    shortLabel: 'Gold',
  },
  {
    id: 'ES',
    name: 'S&P 500',
    exchange: 'NYSE Arca',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'SPY',
    shortLabel: 'S&P 500',
  },
  {
    id: 'YM',
    name: 'Dow Jones',
    exchange: 'NYSE Arca',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'DIA',
    shortLabel: 'Dow',
  },
  {
    id: 'NQ',
    name: 'Nasdaq 100',
    exchange: 'NASDAQ',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'QQQ',
    shortLabel: 'Nasdaq',
  },
];

export const ALL_INSTRUMENTS: Instrument[] = [...MARKET_INSTRUMENTS];

export const DEFAULT_INSTRUMENT_ID = 'GC';

export function findInstrument(id: string): Instrument | undefined {
  return ALL_INSTRUMENTS.find(instrument => instrument.id === id);
}
