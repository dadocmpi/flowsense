// ============================================
// INSTRUMENT CATALOG
// ============================================
// The assets this app ships, each with the provider that serves it:
//
//   GC  Gold      -> Twelve Data  (XAU/USD spot)
//   ES  S&P 500   -> Alpaca       (SPY ETF proxy)
//   YM  Dow       -> Alpaca       (DIA ETF proxy)
//   NQ  Nasdaq    -> Alpaca       (QQQ ETF proxy)
//
// An instrument declares which provider *can* serve it (`providerId`). Whether
// that provider is actually configured is decided at runtime from the server's
// environment, so an instrument with no configured source renders an explicit
// "no data source configured" state instead of any number at all.
//
// Switching an asset to the other provider is a SERVER config change
// (api/_lib/assets.ts); this catalog mirrors the same defaults so the client can
// label provenance before the first response lands.

export type ProviderId = 'twelvedata' | 'alpaca';

/**
 * What the app is ACTUALLY reading for an instrument, once the server has
 * resolved a symbol. An index asset is read through an ETF proxy, so the app can
 * be reading a proxy rather than the index itself — and the UI must say so
 * rather than implying it is the index.
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
  /** The provider that served this reading, when known. */
  provider?: ProviderId;
  /** The market-data feed, e.g. "iex". Alpaca only. */
  feed?: string;
  /** True when the volume is a single exchange's, not consolidated. */
  partialVolume?: boolean;
}

/**
 * How the continuous contract is assembled for a futures instrument.
 *
 *  - `frontMonth`    follow the exchange's front month, switching on the roll
 *                    date. The price series has a jump at each roll.
 *  - `backAdjusted`  same front month, but historical prices are shifted so
 *                    the series is continuous. Percentage returns across the
 *                    roll are preserved; absolute levels before the roll are
 *                    shifted by the gap.
 *
 * Either way the provider is asked for the *continuous* symbol, not a specific
 * contract, and the roll is handled by the upstream data source. That is
 * deliberate: rolling correctly needs the exchange calendar and open interest,
 * which a chart client cannot reconstruct from candles alone.
 */
export interface ContractRoll {
  method: 'frontMonth' | 'backAdjusted';
  /** Adjustment applied across a roll when back-adjusting. */
  adjustment: 'none' | 'ratio' | 'difference';
}

export interface Instrument {
  /** Stable id used in URLs and display. */
  id: string;
  name: string;
  exchange: string;
  precision: number;
  quote: string;
  providerId: ProviderId;
  /** Which provider symbol to request. */
  providerSymbol: string;
  /** Continuous front-month symbol the futures provider should request. */
  continuousSymbol?: string;
  roll?: ContractRoll;
  /** Short label for the selector. */
  shortLabel: string;
  /** True when the provider reads an ETF proxy rather than the index itself. */
  proxy?: boolean;
  /** The market-data feed, e.g. "iex". Alpaca only. */
  feed?: string;
}

/** Gold, S&P 500, Dow and Nasdaq — the instruments this app ships. */
export const INSTRUMENTS: Instrument[] = [
  {
    id: 'GC',
    name: 'Gold',
    exchange: 'Twelve Data',
    precision: 2,
    quote: 'USD',
    providerId: 'twelvedata',
    providerSymbol: 'XAU/USD',
    shortLabel: 'Gold',
  },
  {
    id: 'ES',
    name: 'S&P 500',
    exchange: 'NYSE Arca',
    precision: 2,
    quote: 'USD',
    providerId: 'alpaca',
    providerSymbol: 'SPY',
    shortLabel: 'S&P 500',
    proxy: true,
    feed: 'iex',
  },
  {
    id: 'YM',
    name: 'Dow Jones',
    exchange: 'NYSE Arca',
    precision: 2,
    quote: 'USD',
    providerId: 'alpaca',
    providerSymbol: 'DIA',
    shortLabel: 'Dow',
    proxy: true,
    feed: 'iex',
  },
  {
    id: 'NQ',
    name: 'Nasdaq 100',
    exchange: 'NASDAQ',
    precision: 2,
    quote: 'USD',
    providerId: 'alpaca',
    providerSymbol: 'QQQ',
    shortLabel: 'Nasdaq',
    proxy: true,
    feed: 'iex',
  },
];

/** Kept as an alias so existing imports of FUTURES_INSTRUMENTS keep working. */
export const FUTURES_INSTRUMENTS: Instrument[] = INSTRUMENTS;

export const ALL_INSTRUMENTS: Instrument[] = [...INSTRUMENTS];

export const DEFAULT_INSTRUMENT_ID = 'GC';

export function findInstrument(id: string): Instrument | undefined {
  return ALL_INSTRUMENTS.find(instrument => instrument.id === id);
}
