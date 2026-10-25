// ============================================
// PROVIDER REGISTRY
// ============================================
// The single lookup the rest of the app uses. Providers register here; nothing
// else imports a concrete provider.

import type { Instrument, ProviderId } from '../instruments';
import type { MarketDataProvider, ProviderStatus } from './types';
import { binanceProvider } from './binance';
import { futuresProvider } from './futures';

const registry = new Map<ProviderId, MarketDataProvider>();

export function registerProvider(provider: MarketDataProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: ProviderId): MarketDataProvider | undefined {
  return registry.get(id);
}

/** The provider that should serve an instrument, if it is registered. */
export function providerForInstrument(instrument: Instrument): MarketDataProvider | undefined {
  return registry.get(instrument.providerId);
}

export function listProviders(): MarketDataProvider[] {
  return [...registry.values()];
}

export function describeProviders(): ProviderStatus[] {
  return listProviders().map(provider => ({
    id: provider.id,
    label: provider.label,
    configured: provider.isConfigured(),
    capabilities: provider.capabilities,
  }));
}

registerProvider(binanceProvider);
registerProvider(futuresProvider);
