// ============================================
// INSTRUMENT SYMBOL CONFIGURATION
// ============================================
// The ONE file that decides which upstream symbol each instrument requests, and
// the ONE file that names the environment variable which overrides it.
//
// Twelve Data does not entitle the continuous-futures symbols (GC1!, ES1!, YM1!,
// NQ1!) on every plan — it answers "symbol or figi parameter is missing or
// invalid" — so the shipped defaults are spot / ETF proxies that the free tier
// does carry:
//
//   GC  Gold      XAU/USD  gold spot
//   ES  S&P 500   SPY      SPDR S&P 500 ETF
//   YM  Dow       DIA      SPDR Dow Jones ETF
//   NQ  Nasdaq    QQQ      Invesco QQQ Trust (Nasdaq-100)
//
// A proxy is NEVER presented as the futures contract. `kind` tells the UI how to
// label what it is reading honestly: 'proxy' draws the "Proxy" badge, 'futures'
// means a real contract (continuous or dated).
//
// There is exactly ONE symbol per instrument and no runtime candidate walk: a
// symbol that fails returns an error for that asset rather than spending another
// credit hunting for a working one. Change the default here, or set the
// instrument's environment variable (SYMBOL_GOLD, SYMBOL_SP500, SYMBOL_DOW,
// SYMBOL_NASDAQ) — both are read through this one file.
//
// This module is pure data: no I/O, no clock, no environment access. The server
// reads the override in api/_lib/symbols.ts, which sources this catalog.

export type SymbolKind = 'futures' | 'proxy';

export interface SymbolCandidate {
  /** The symbol string sent to Twelve Data. */
  symbol: string;
  kind: SymbolKind;
  /** Plain-English description shown next to the instrument name. */
  description: string;
  /**
   * True for the exchange-traded continuous contract the instrument is really
   * about (e.g. GC1!). Only worth using on plans that include futures data.
   */
  continuous?: boolean;
}

export interface InstrumentSymbolConfig {
  instrumentId: string;
  /** Human-readable name, for logs and the discovery CLI. */
  name: string;
  /** The environment variable that overrides `symbol`, e.g. SYMBOL_GOLD. */
  envVar: string;
  /** The single symbol the app requests. No ordered fallback list. */
  symbol: SymbolCandidate;
}

export const INSTRUMENT_SYMBOLS: InstrumentSymbolConfig[] = [
  {
    instrumentId: 'GC',
    name: 'Gold',
    envVar: 'SYMBOL_GOLD',
    symbol: { symbol: 'XAU/USD', kind: 'proxy', description: 'Gold spot' },
  },
  {
    instrumentId: 'ES',
    name: 'S&P 500',
    envVar: 'SYMBOL_SP500',
    symbol: { symbol: 'SPY', kind: 'proxy', description: 'SPDR S&P 500 ETF' },
  },
  {
    instrumentId: 'YM',
    name: 'Dow Jones',
    envVar: 'SYMBOL_DOW',
    symbol: { symbol: 'DIA', kind: 'proxy', description: 'SPDR Dow Jones ETF' },
  },
  {
    instrumentId: 'NQ',
    name: 'Nasdaq',
    envVar: 'SYMBOL_NASDAQ',
    symbol: { symbol: 'QQQ', kind: 'proxy', description: 'Invesco QQQ Trust (Nasdaq-100)' },
  },
];

/** The configured entry for an instrument id, case-insensitively. */
export function instrumentSymbolConfig(instrumentId: string): InstrumentSymbolConfig | undefined {
  return INSTRUMENT_SYMBOLS.find(entry => entry.instrumentId === instrumentId.toUpperCase());
}

/** The environment variable names, so no caller has to spell one out. */
export const SYMBOL_ENV_VARS: string[] = INSTRUMENT_SYMBOLS.map(entry => entry.envVar);
