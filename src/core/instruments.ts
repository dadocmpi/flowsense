// ============================================
// INSTRUMENT CATALOG
// ============================================
// Gold, S&P 500 and Dow futures are the instruments this app ships, all served
// by the same provider.
//
// An instrument does NOT carry a data source of its own: it declares which
// provider *can* serve it (`providerId`). Whether that provider is actually
// configured is decided at runtime from the server's environment, so an
// instrument with no configured source renders an explicit
// "no data source configured" state instead of any number at all.

export type ProviderId = 'futures';

/**
 * What the app is ACTUALLY reading for an instrument, once the server has
 * resolved a symbol. A futures plan may not entitle the contract itself, so the
 * app can be reading a spot or ETF proxy — and the UI must say so rather than
 * implying it is the futures contract.
 */
export interface ResolvedSource {
  /** The symbol the vendor was asked for, e.g. "ES1!" or "SPY". */
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
}

/** Gold, S&P 500 and Dow Jones futures — the instruments this app ships. */
export const FUTURES_INSTRUMENTS: Instrument[] = [
  {
    id: 'GC',
    name: 'Gold Futures',
    exchange: 'COMEX',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'GC',
    continuousSymbol: 'GC1!',
    roll: { method: 'frontMonth', adjustment: 'none' },
    shortLabel: 'Gold',
  },
  {
    id: 'ES',
    name: 'S&P 500 Futures',
    exchange: 'CME',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'ES',
    continuousSymbol: 'ES1!',
    roll: { method: 'frontMonth', adjustment: 'none' },
    shortLabel: 'S&P 500',
  },
  {
    id: 'YM',
    name: 'Dow Jones Futures',
    exchange: 'CBOT',
    precision: 0,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'YM',
    continuousSymbol: 'YM1!',
    roll: { method: 'frontMonth', adjustment: 'none' },
    shortLabel: 'Dow Jones',
  },
];

export const ALL_INSTRUMENTS: Instrument[] = [...FUTURES_INSTRUMENTS];

export const DEFAULT_INSTRUMENT_ID = 'GC';

export function findInstrument(id: string): Instrument | undefined {
  return ALL_INSTRUMENTS.find(instrument => instrument.id === id);
}
