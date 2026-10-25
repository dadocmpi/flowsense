// ============================================
// GET /api/futures/status
// ============================================
// Tells the client whether a futures source is configured, so the UI can show
// "no data source configured" instead of an error, and so the data-source
// panel can name the vendor. Never returns the key itself.
//
// It also reports whether the vendor WebSocket is enabled and which symbol is
// currently resolved for each instrument, so the UI can label a proxy honestly
// before the first candle request lands.

import {
  resolveVendor,
  rollAdjustment,
  rollMethod,
  sendJson,
  vendorApiKey,
  websocketEnabled,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/futuresShared';
import { knownResolution } from '../_lib/candleCache';
import { INSTRUMENT_SYMBOLS } from '../_lib/symbols';
import { POLL_INTERVAL_MS } from '../../src/core/providers/polling';

export default function handler(_req: ApiRequest, res: ApiResponse): void {
  const vendor = resolveVendor();
  const hasKey = vendorApiKey() !== null;

  // What each instrument will ask for, in priority order. `resolved` is filled
  // in once a request has actually confirmed a symbol works.
  const instruments = INSTRUMENT_SYMBOLS.map(entry => {
    const resolved = knownResolution(entry.instrumentId);
    return {
      instrumentId: entry.instrumentId,
      candidates: entry.candidates.map(candidate => ({
        symbol: candidate.symbol,
        kind: candidate.kind,
        description: candidate.description,
      })),
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
    // Real order flow is a separate capability. This source provides candles
    // only, so the client must not offer an order-flow panel for futures.
    capabilities: { candles: true, ticks: false, orderFlow: false },
    // The vendor WebSocket carries price ticks only; it is not order flow.
    websocket: websocketEnabled(),
    pollIntervalsMs: POLL_INTERVAL_MS,
    instruments,
    note:
      vendor && hasKey
        ? `Configured: ${vendor}`
        : 'Set TWELVE_DATA_API_KEY to enable Gold, S&P 500 and Dow.',
  });
}
