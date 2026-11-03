// ============================================
// GET /api/futures/status
// ============================================
// Tells the client which providers are configured and which symbol each asset
// reads, so the UI can show "no data source configured" instead of an error, and
// so the data-source panel can name the vendor. Never returns a key.
//
// It costs NO vendor calls: it reads the per-asset mapping (a configuration
// fact) and the in-memory rate meters, and makes no request to either vendor.
// That is deliberate — a status check that spent a request would be a hidden
// consumer.
//
// It reports each provider's configuration and meter, and the symbol each asset
// is configured to read.

import {
  alpacaConfigured,
  resolveVendor,
  rollAdjustment,
  rollMethod,
  sendJson,
  vendorApiKey,
  websocketEnabled,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/futuresShared.js';
import { knownResolution } from '../_lib/candleCache.js';
import { knownAlpacaResolution } from '../_lib/alpacaCache.js';
import { INSTRUMENT_SYMBOLS } from '../_lib/symbols.js';
import { meterSnapshot } from '../_lib/creditMeter.js';
import { alpacaMeterSnapshot } from '../_lib/alpacaMeter.js';
import {
  assetProviderConfig,
  assetRequirement,
  assetRequirements,
  CONFIGURED_ASSET_IDS,
} from '../_lib/assets.js';
import { POLL_INTERVAL_MS } from '../../src/core/providers/polling.js';

export default function handler(_req: ApiRequest, res: ApiResponse): void {
  const twelveConfigured = Boolean(resolveVendor()) && vendorApiKey() !== null;
  const alpaca = alpacaConfigured();
  const meter = meterSnapshot();
  const alpacaMeter = alpacaMeterSnapshot();

  // What each asset is configured to read, which provider serves it, and exactly
  // which credential variables it still needs. The requirement is computed from
  // the per-asset mapping, so an asset can never be described with another
  // asset's provider or another provider's variables.
  const instruments = CONFIGURED_ASSET_IDS.map(instrumentId => {
    const config = assetProviderConfig(instrumentId)!;
    const requirement = assetRequirement(instrumentId)!;
    // Per-asset facts, so the client can explain THIS asset without guessing.
    const shared = {
      instrumentId,
      name: requirement.name,
      provider: config.provider,
      symbol: config.symbol,
      credentialsPresent: requirement.credentialsPresent,
      requiredEnvVars: requirement.requiredEnvVars,
      missingEnvVars: requirement.missingEnvVars,
    };

    if (config.provider === 'alpaca') {
      const resolved = knownAlpacaResolution(instrumentId);
      const description = `${config.symbol} — index proxy (IEX, partial market volume)`;
      return {
        ...shared,
        kind: 'proxy' as const,
        description,
        resolved: resolved ? { symbol: resolved.symbol, vendorSymbol: resolved.symbol, kind: 'proxy' as const, description } : null,
      };
    }
    const entry = INSTRUMENT_SYMBOLS.find(e => e.instrumentId === instrumentId);
    const resolved = knownResolution(instrumentId);
    return {
      ...shared,
      kind: entry?.symbol.kind ?? 'proxy',
      description: entry?.symbol.description ?? config.symbol,
      resolved: resolved
        ? {
            symbol: resolved.candidate.symbol,
            vendorSymbol: resolved.vendorSymbol,
            kind: resolved.candidate.kind,
            description: resolved.candidate.description,
            instrumentType: resolved.instrumentType,
            exchange: resolved.exchange,
          }
        : null,
    };
  });

  const anyConfigured = twelveConfigured || alpaca;

  // Which providers are configured, and which are not, from the per-asset
  // requirements. A provider is "configured" when its credentials are present;
  // this is the same answer every asset above is described with.
  const requirements = assetRequirements();
  const missingByProvider = {
    twelvedata: requirements.find(r => r.provider === 'twelvedata')?.missingEnvVars ?? [],
    alpaca: requirements.find(r => r.provider === 'alpaca')?.missingEnvVars ?? [],
  };

  sendJson(res, 200, {
    configured: anyConfigured,
    // The primary label; each asset carries its own provider in `instruments`.
    provider: twelveConfigured ? resolveVendor() : alpaca ? 'alpaca' : null,
    roll: { method: rollMethod(), adjustment: rollAdjustment() },
    capabilities: { candles: true, ticks: false },
    websocket: websocketEnabled(),
    pollIntervalsMs: POLL_INTERVAL_MS,
    instruments,
    // Per-provider configuration and meters, so the client can show a rate-limit
    // state before it even attempts a candles request.
    providers: {
      twelvedata: {
        configured: twelveConfigured,
        missingEnvVars: missingByProvider.twelvedata,
        credits: {
          limit: meter.limit,
          used: meter.used,
          remaining: meter.remaining,
          resetAt: meter.resetAt,
          exhausted: meter.exhausted,
          coldStart: meter.coldStart,
          reason: meter.reason,
        },
      },
      alpaca: {
        configured: alpaca,
        missingEnvVars: missingByProvider.alpaca,
        requests: {
          limit: alpacaMeter.limit,
          used: alpacaMeter.used,
          remaining: alpacaMeter.remaining,
          resetAt: alpacaMeter.resetAt,
          exhausted: alpacaMeter.exhausted,
          coldStart: alpacaMeter.coldStart,
          reason: alpacaMeter.reason,
        },
      },
    },
    // A summary sentence. The client no longer uses this as the per-asset
    // explanation — each asset carries its own provider and missing variables —
    // but it stays for a human reading the route directly.
    note: anyConfigured
      ? `Configured: ${[twelveConfigured ? 'twelvedata' : null, alpaca ? 'alpaca' : null].filter(Boolean).join(', ')}`
      : 'Set TWELVE_DATA_API_KEY and ALPACA_API_KEY/ALPACA_API_SECRET to enable the assets.',
  });
}
