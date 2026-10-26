// ============================================
// PROVIDER REGISTRY
// ============================================
// The single lookup the rest of the app uses. Futures is the only source, so
// nothing else imports the concrete provider.

import type { Instrument, ProviderId } from '../instruments';
import type { MarketDataProvider } from './types';
import { futuresProvider } from './futures';

const registry = new Map<ProviderId, MarketDataProvider>([[futuresProvider.id, futuresProvider]]);

/** The provider that should serve an instrument, if it is registered. */
export function providerForInstrument(instrument: Instrument): MarketDataProvider | undefined {
  return registry.get(instrument.providerId);
}
