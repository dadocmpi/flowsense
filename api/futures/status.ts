// ============================================
// GET /api/futures/status
// ============================================
// Tells the client whether a futures source is configured, so the UI can show
// "no data source configured" instead of an error, and so the data-source
// panel can name the vendor. Never returns the key itself.
//
// It costs NO vendor credits: it reads the symbol mapping (a configuration fact)
// and the in-memory credit meter, and makes no Twelve Data request. That is
// deliberate — a health check that spent a credit would be a hidden consumer.
//
// It reports the symbol each instrument is configured to read, the credit meter
// state, and whether the vendor WebSocket is enabled.

import {
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
import { configuredSymbol, INSTRUMENT_SYMBOLS } from '../_lib/symbols.js';
import { meterSnapshot } from '../_lib/creditMeter.js';
import { POLL_INTERVAL_MS } from '../../src/core/providers/polling.js';

export default function handler(_req: ApiRequest, res: ApiResponse): void {
  const vendor = resolveVendor();
  const hasKey = vendorApiKey() !== null;
  const meter = meterSnapshot();

  // What each instrument is configured to read. The symbol is a configuration
  // fact (the SYMBOL_* override when set, else the default in the config), so it
  // is always known — not "resolved once a request confirmed it".
  const instruments = INSTRUMENT_SYMBOLS.map(entry => {
    const configured = configuredSymbol(entry.instrumentId) ?? entry.symbol;
    const resolved = knownResolution(entry.instrumentId);
    return {
      instrumentId: entry.instrumentId,
      symbol: configured.symbol,
      kind: configured.kind,
      description: configured.description,
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

  sendJson(res, 200, {
    configured: Boolean(vendor) && hasKey,
    provider: vendor,
    roll: { method: rollMethod(), adjustment: rollAdjustment() },
    capabilities: { candles: true, ticks: false },
    // The vendor WebSocket carries price ticks only.
    websocket: websocketEnabled(),
    pollIntervalsMs: POLL_INTERVAL_MS,
    instruments,
    // The credit meter, so the client can show a rate-limit state before it even
    // attempts a candles request.
    credits: {
      limit: meter.limit,
      used: meter.used,
      remaining: meter.remaining,
      resetAt: meter.resetAt,
      exhausted: meter.exhausted,
      coldStart: meter.coldStart,
      reason: meter.reason,
    },
    note:
      vendor && hasKey
        ? `Configured: ${vendor}`
        : 'Set TWELVE_DATA_API_KEY to enable Gold, S&P 500, Dow Jones and Nasdaq.',
  });
}
