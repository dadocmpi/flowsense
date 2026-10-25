// ============================================
// GET /api/futures/status
// ============================================
// Tells the client whether a futures source is configured, so the UI can show
// "no data source configured" instead of an error, and so the data-source
// panel can name the vendor. Never returns the key itself.

import {
  resolveVendor,
  rollAdjustment,
  rollMethod,
  sendJson,
  vendorApiKey,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/futuresShared';

export default function handler(_req: ApiRequest, res: ApiResponse): void {
  const vendor = resolveVendor();
  const hasKey = vendorApiKey() !== null;

  sendJson(res, 200, {
    configured: Boolean(vendor) && hasKey,
    provider: vendor,
    roll: { method: rollMethod(), adjustment: rollAdjustment() },
    // Real order flow is a separate capability. This source provides candles
    // only, so the client must not offer an order-flow panel for futures.
    capabilities: { candles: true, ticks: false, orderFlow: false },
    note:
      vendor && hasKey
        ? `Configured: ${vendor}`
        : 'Set FUTURES_PROVIDER and FUTURES_API_KEY to enable Gold, S&P 500 and Dow futures.',
  });
}
