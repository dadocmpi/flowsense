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

/**
 * The display name for each asset, as the UI should show it.
 *
 * The card names the asset, not the ticker: "Nasdaq", not "NQ". A message about
 * a missing credential is only useful if it says which asset is affected.
 */
export const ASSET_DISPLAY_NAMES: Record<string, string> = {
  GC: 'Gold',
  ES: 'S&P 500',
  YM: 'Dow',
  NQ: 'Nasdaq',
};

/** The display name for an asset id, falling back to the id itself. */
export function assetDisplayName(instrumentId: string): string {
  const id = instrumentId.toUpperCase();
  return ASSET_DISPLAY_NAMES[id] ?? id;
}

/**
 * The environment variables each provider needs, by their canonical names.
 *
 * Names only — a value is never read out of this module for reporting, so a
 * message built from it can be shown to anyone.
 */
export const PROVIDER_ENV_VARS: Record<AssetProviderId, string[]> = {
  twelvedata: ['TWELVE_DATA_API_KEY'],
  alpaca: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
};

/** Whether a named credential variable carries a value right now. */
function envPresent(name: string): boolean {
  // TWELVE_DATA_API_KEY's historical alias is honoured, because it is a real
  // way a deployment supplies the same credential.
  if (name === 'TWELVE_DATA_API_KEY') {
    return (process.env.TWELVE_DATA_API_KEY ?? process.env.FUTURES_API_KEY ?? '').trim().length > 0;
  }
  return (process.env[name] ?? '').trim().length > 0;
}

export interface ProviderCredentials {
  /** True only when every required variable is present. */
  present: boolean;
  /** The variable names the provider needs, in order. */
  required: string[];
  /** The subset that is absent. Names only, never values. */
  missing: string[];
}

/** Which of a provider's credentials are present, by name only. */
export function providerCredentials(provider: AssetProviderId): ProviderCredentials {
  const required = PROVIDER_ENV_VARS[provider];
  const missing = required.filter(name => !envPresent(name));
  return { present: missing.length === 0, required, missing };
}

/**
 * What one asset needs in order to serve data: its provider, its symbol, and
 * exactly which credential variables are missing.
 *
 * This is THE answer the status route, /api/health and the client's "no data
 * source configured" card all read, so the three can never disagree about why an
 * asset has no source.
 */
export interface AssetRequirement {
  instrumentId: string;
  /** Display name, e.g. "Nasdaq". */
  name: string;
  provider: AssetProviderId;
  symbol: string;
  /** True when this asset's provider has every credential it needs. */
  credentialsPresent: boolean;
  /** Credential variable names this asset's provider needs. */
  requiredEnvVars: string[];
  /** The subset that is missing. Names only. */
  missingEnvVars: string[];
}

/** The requirement for one asset, or undefined for an unknown asset. */
export function assetRequirement(instrumentId: string): AssetRequirement | undefined {
  const id = instrumentId.toUpperCase();
  const config = assetProviderConfig(id);
  if (!config) return undefined;
  const credentials = providerCredentials(config.provider);
  return {
    instrumentId: id,
    name: assetDisplayName(id),
    provider: config.provider,
    symbol: config.symbol,
    credentialsPresent: credentials.present,
    requiredEnvVars: credentials.required,
    missingEnvVars: credentials.missing,
  };
}

/** The requirement for every configured asset, in display order. */
export function assetRequirements(): AssetRequirement[] {
  return CONFIGURED_ASSET_IDS.map(id => assetRequirement(id)!);
}
