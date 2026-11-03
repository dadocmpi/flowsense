// ============================================
// PER-ASSET PROVIDER CONFIGURATION (server-side)
// ============================================
// THE one place that decides, for each asset, WHICH provider serves it and WHICH
// symbol that provider is asked for. Switching an asset to the other provider is
// a config change here (or an environment override) and nothing else: the routes
// read this mapping, so no route or client file hard-codes a provider per asset.
//
//   GC  Gold      -> Twelve Data  XAU/USD
//   ES  S&P 500   -> Alpaca       SPY
//   YM  Dow       -> Alpaca       DIA
//   NQ  Nasdaq    -> Alpaca       QQQ
//
// The defaults can be overridden per asset WITHOUT a deploy:
//
//   ASSET_PROVIDER_<ID>=twelvedata|alpaca
//   ASSET_SYMBOL_<ID>=<symbol>
//
// A symbol that does not work returns an error for that asset; there is no
// runtime candidate walk, so a failing symbol can never spend extra credits
// hunting for a working one.

export type AssetProviderId = 'twelvedata' | 'alpaca';

export interface AssetProviderConfig {
  /** Which provider serves the asset. */
  provider: AssetProviderId;
  /** The ONE symbol the provider is asked for. */
  symbol: string;
}

/**
 * The shipped mapping. Gold stays on Twelve Data (spot XAU/USD); the index
 * assets move to Alpaca, which is asked for the liquid ETF proxies.
 */
export const ASSET_PROVIDER_DEFAULTS: Record<string, AssetProviderConfig> = {
  GC: { provider: 'twelvedata', symbol: 'XAU/USD' },
  ES: { provider: 'alpaca', symbol: 'SPY' },
  YM: { provider: 'alpaca', symbol: 'DIA' },
  NQ: { provider: 'alpaca', symbol: 'QQQ' },
};

function isProviderId(value: string): value is AssetProviderId {
  return value === 'twelvedata' || value === 'alpaca';
}

/**
 * The provider configuration for an asset, defaults merged with the environment.
 *
 * An unknown asset returns undefined so the route can answer UNSUPPORTED_INSTRUMENT
 * rather than guessing a source.
 */
export function assetProviderConfig(instrumentId: string): AssetProviderConfig | undefined {
  const id = instrumentId.toUpperCase();
  const base = ASSET_PROVIDER_DEFAULTS[id];
  if (!base) return undefined;

  const providerRaw = (process.env[`ASSET_PROVIDER_${id}`] ?? '').trim().toLowerCase();
  const symbolRaw = (process.env[`ASSET_SYMBOL_${id}`] ?? '').trim();

  return {
    provider: isProviderId(providerRaw) ? providerRaw : base.provider,
    symbol: symbolRaw.length > 0 ? symbolRaw : base.symbol,
  };
}

/** The configured provider for an asset, or undefined for an unknown asset. */
export function assetProvider(instrumentId: string): AssetProviderId | undefined {
  return assetProviderConfig(instrumentId)?.provider;
}

/** The configured symbol for an asset, or undefined for an unknown asset. */
export function assetSymbol(instrumentId: string): string | undefined {
  return assetProviderConfig(instrumentId)?.symbol;
}

/** Every configured asset id, in display order. */
export const CONFIGURED_ASSET_IDS = Object.keys(ASSET_PROVIDER_DEFAULTS);
