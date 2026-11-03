// ============================================
// PER-ASSET "WHY IS THERE NO SOURCE" MESSAGE
// ============================================
// One pure function that explains, for ONE asset, why it has no data source.
//
// The reason this exists: the status route reports a GLOBAL note that lists
// whichever providers are configured for the deployment ("Configured:
// twelvedata"). Using that as the per-asset explanation is wrong — it names
// another provider, not the one this asset resolved to. An Alpaca asset with
// Alpaca unconfigured would read "Configured: twelvedata", which looks like the
// asset resolves to Twelve Data. It does not; the message did.
//
// So the message is built from the asset's OWN requirement: the provider it
// resolved to, the symbol that provider is asked for, and exactly which
// credential variable names are missing — names only, never values.

import type { Instrument } from './instruments';
import type { AssetRequirementState } from './providers/futures';

/** The provider's display name, as a person reads it. */
export const PROVIDER_DISPLAY_NAME: Record<string, string> = {
  twelvedata: 'Twelve Data',
  alpaca: 'Alpaca',
};

/** "A", "A and B", "A, B and C". */
export function listAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Why this asset has no data source, in the asset's own terms.
 *
 * `requirement` is the server's per-asset answer. When it is undefined the
 * status route has not answered yet, so the message falls back to the
 * instrument's own declared provider rather than naming a provider we have not
 * been told about.
 */
export function missingSourceMessage(
  instrument: Instrument,
  requirement: AssetRequirementState | undefined,
  reachable: boolean
): string {
  const providerId = requirement?.provider ?? instrument.providerId;
  const providerLabel = PROVIDER_DISPLAY_NAME[providerId] ?? providerId;

  if (!reachable) {
    return `The server route that holds the ${providerLabel} credentials did not answer.`;
  }

  const symbol = requirement?.symbol || instrument.providerSymbol;
  const missing = requirement?.missingEnvVars ?? [];
  if (missing.length > 0) {
    return `${instrument.name} is served by ${providerLabel} (${symbol}), but ${listAnd(missing)} ${
      missing.length > 1 ? 'are' : 'is'
    } not set in the deployment environment.`;
  }
  return `${instrument.name} is served by ${providerLabel} (${symbol}), whose credentials are not configured in the deployment environment.`;
}
