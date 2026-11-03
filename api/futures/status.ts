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
import { assetProviderConfig, CONFIGURED_ASSET_IDS } from '../_lib/assets.js';
import { POLL_INTERVAL_MS } from '../../src/core/providers/polling.js';

const NAMES: Record<string, string> = { GC: 'Gold', ES: 'S&P 500', YM: 'Dow Jones', NQ: 'Nasdaq' };

export default function handler(_req: ApiRequest, res: ApiResponse): void {
  const twelveConfigured = Boolean(resolveVendor()) && vendorApiKey() !== null;
  const alpaca = alpacaConfigured();
  const meter = meterSnapshot();
  const alpacaMeter = alpacaMeterSnapshot();

  // What each asset is configured to read, and which provider serves it.
  const instruments = CONFIGURED_ASSET_IDS.map(instrumentId => {
    const config = assetProviderConfig(instrumentId)!;
    const name = NAMES[instrumentId] ?? instrumentId;
    if (config.provider === 'alpaca') {
      const resolved = knownAlpacaResolution(instrumentId);
      const description = `${config.symbol} — index proxy (IEX, partial market volume)`;
      return {
        instrumentId,
        name,
        provider: 'alpaca',
        symbol: config.symbol,
        kind: 'proxy' as const,
        description,
        resolved: resolved ? { symbol: resolved.symbol, vendorSymbol: resolved.symbol, kind: 'proxy' as const, description } : null,
      };
    }
    const entry = INSTRUMENT_SYMBOLS.find(e => e.instrumentId === instrumentId);
    const resolved = knownResolution(instrumentId);
    return {
      instrumentId,
      name,
      provider: 'twelvedata',
      symbol: entry?.symbol.symbol ?? config.symbol,
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
    note: anyConfigured
      ? `Configured: ${[twelveConfigured ? 'twelvedata' : null, alpaca ? 'alpaca' : null].filter(Boolean).join(', ')}`
      : 'Set TWELVE_DATA_API_KEY and ALPACA_API_KEY/ALPACA_API_SECRET to enable the assets.',
  });
}
