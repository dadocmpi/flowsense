// ============================================
// INSTRUMENT CATALOG
// ============================================
// Gold, S&P 500 and Dow futures are the default instruments. Binance USDT
// pairs remain available as a secondary group.
//
// An instrument does NOT carry a data source of its own: it declares which
// provider *can* serve it (`providerId`). Whether that provider is actually
// configured is decided at runtime from the server's environment, so an
// instrument with no configured source renders an explicit
// "no data source configured" state instead of any number at all.

export type InstrumentGroup = 'FUTURES' | 'CRYPTO';

export type ProviderId = 'binance' | 'futures';

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
  /** Stable id used in history keys and URLs. */
  id: string;
  name: string;
  group: InstrumentGroup;
  exchange: string;
  precision: number;
  quote: string;
  providerId: ProviderId;
  /** Which provider symbol to request, e.g. the Binance spot symbol. */
  providerSymbol: string;
  /**
   * Continuous front-month symbol the futures provider should request, when
   * this instrument is a future. Left undefined for crypto.
   */
  continuousSymbol?: string;
  roll?: ContractRoll;
  /** Short label for the selector. */
  shortLabel: string;
  /**
   * Session the instrument trades in. Futures have a real session open, so
   * VWAP and the point of control reset there. A 24/7 market such as crypto
   * has no session boundary: its metrics are measured over the whole fetched
   * window instead of being reset at an open it does not have.
   */
  sessionMode: 'SESSION' | 'CONTINUOUS';
}

/** Gold, S&P 500 and Dow Jones futures — the default instruments. */
export const FUTURES_INSTRUMENTS: Instrument[] = [
  {
    id: 'GC',
    name: 'Gold Futures',
    group: 'FUTURES',
    exchange: 'COMEX',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'GC',
    continuousSymbol: 'GC1!',
    roll: { method: 'frontMonth', adjustment: 'none' },
    shortLabel: 'Gold',
    sessionMode: 'SESSION',
  },
  {
    id: 'ES',
    name: 'S&P 500 Futures',
    group: 'FUTURES',
    exchange: 'CME',
    precision: 2,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'ES',
    continuousSymbol: 'ES1!',
    roll: { method: 'frontMonth', adjustment: 'none' },
    shortLabel: 'S&P 500',
    sessionMode: 'SESSION',
  },
  {
    id: 'YM',
    name: 'Dow Jones Futures',
    group: 'FUTURES',
    exchange: 'CBOT',
    precision: 0,
    quote: 'USD',
    providerId: 'futures',
    providerSymbol: 'YM',
    continuousSymbol: 'YM1!',
    roll: { method: 'frontMonth', adjustment: 'none' },
    shortLabel: 'Dow',
    sessionMode: 'SESSION',
  },
];

function crypto(id: string, name: string, binanceSymbol: string, precision: number): Instrument {
  return {
    id,
    name,
    group: 'CRYPTO',
    exchange: 'BINANCE',
    precision,
    quote: 'USDT',
    providerId: 'binance',
    providerSymbol: binanceSymbol,
    shortLabel: id,
    sessionMode: 'CONTINUOUS',
  };
}

export const CRYPTO_INSTRUMENTS: Instrument[] = [
  crypto('BTC', 'Bitcoin / TetherUS', 'BTCUSDT', 2),
  crypto('ETH', 'Ethereum / TetherUS', 'ETHUSDT', 2),
  crypto('SOL', 'Solana / TetherUS', 'SOLUSDT', 2),
  crypto('BNB', 'BNB / TetherUS', 'BNBUSDT', 2),
  crypto('XRP', 'XRP / TetherUS', 'XRPUSDT', 4),
  crypto('DOGE', 'Dogecoin / TetherUS', 'DOGEUSDT', 5),
  crypto('ADA', 'Cardano / TetherUS', 'ADAUSDT', 4),
  crypto('AVAX', 'Avalanche / TetherUS', 'AVAXUSDT', 2),
  crypto('LINK', 'Chainlink / TetherUS', 'LINKUSDT', 2),
  crypto('LTC', 'Litecoin / TetherUS', 'LTCUSDT', 2),
];

export const ALL_INSTRUMENTS: Instrument[] = [...FUTURES_INSTRUMENTS, ...CRYPTO_INSTRUMENTS];

/** Futures first: they are the default group. */
export const DEFAULT_INSTRUMENT_ID = 'GC';

export function findInstrument(id: string): Instrument | undefined {
  return ALL_INSTRUMENTS.find(instrument => instrument.id === id);
}

export function instrumentsByGroup(group: InstrumentGroup): Instrument[] {
  return ALL_INSTRUMENTS.filter(instrument => instrument.group === group);
}
