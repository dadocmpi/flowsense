// ============================================
// GET /api/health
// ============================================
// A cheap liveness + configuration report. It costs NO vendor calls: it reads
// environment configuration and the in-memory rate meters, and never fetches
// from a vendor. That keeps a health check from being a hidden consumer.
//
// For each provider it reports:
//   configured     whether the credentials the provider needs are present
//   lastCallAt     epoch ms of the last outbound request, or null
//   callsThisMinute how many requests were made in the current wall-clock minute
//
// It also reports each asset's provider and symbol, so a deployment can confirm
// at a glance that Gold reads Twelve Data and the index assets read Alpaca.
// Keys are never included.

import {
  alpacaConfigured,
  alpacaKeyId,
  alpacaSecretKey,
  resolveVendor,
  sendJson,
  vendorApiKey,
  type ApiRequest,
  type ApiResponse,
} from './_lib/futuresShared.js';
import { meterSnapshot } from './_lib/creditMeter.js';
import { alpacaCallsThisMinute, alpacaLastCallAt, alpacaMeterSnapshot } from './_lib/alpacaMeter.js';
import {
  orderFlowConfigured,
  orderFlowConfiguredFor,
  orderFlowHasMarket,
  orderFlowLabelFor,
  orderFlowVenueFor,
  resolveOrderFlowVendor,
} from './_lib/orderflow.js';
import { assetProviderConfig, CONFIGURED_ASSET_IDS } from './_lib/assets.js';

const NAMES: Record<string, string> = { GC: 'Gold', ES: 'S&P 500', YM: 'Dow Jones', NQ: 'Nasdaq' };

export default function handler(_req: ApiRequest, res: ApiResponse): void {
  const twelveKey = vendorApiKey();
  const twelveConfigured = Boolean(resolveVendor()) && twelveKey !== null;
  const alpaca = alpacaConfigured();
  const meter = meterSnapshot();
  const alpacaMeter = alpacaMeterSnapshot();

  const assets = CONFIGURED_ASSET_IDS.map(instrumentId => {
    const config = assetProviderConfig(instrumentId)!;
    return {
      instrumentId,
      name: NAMES[instrumentId] ?? instrumentId,
      provider: config.provider,
      symbol: config.symbol,
      proxy: config.provider === 'alpaca',
      // The order-flow venue this asset reads, and whether it can answer. Every
      // shipped asset reads Alpaca (Gold through the GLD ETF proxy). A deployment
      // can confirm at a glance that every asset has a real flow source.
      orderFlow: {
        venue: orderFlowVenueFor(instrumentId),
        label: orderFlowLabelFor(instrumentId),
        configured: orderFlowConfiguredFor(instrumentId),
        hasMarket: orderFlowHasMarket(instrumentId),
      },
    };
  });

  sendJson(res, 200, {
    ok: true,
    providers: {
      twelvedata: {
        configured: twelveConfigured,
        // Never the key itself — only whether each half is present.
        hasKey: twelveKey !== null,
        creditsPerMinute: meter.limit,
        usedThisMinute: meter.used,
        remainingThisMinute: meter.remaining,
        exhausted: meter.exhausted,
        resetAt: meter.resetAt,
      },
      alpaca: {
        configured: alpaca,
        hasKeyId: alpacaKeyId() !== null,
        hasSecret: alpacaSecretKey() !== null,
        requestsPerMinute: alpacaMeter.limit,
        callsThisMinute: alpacaCallsThisMinute(),
        remainingThisMinute: alpacaMeter.remaining,
        exhausted: alpacaMeter.exhausted,
        resetAt: alpacaMeter.resetAt,
        /** Epoch ms of the last Alpaca request, or null if none yet. */
        lastCallAt: alpacaLastCallAt(),
      },
      // Order flow is read from Alpaca for every shipped asset, through the same
      // credentials as their candles, so the meter reported above is its budget.
      orderflow: {
        anyConfigured: orderFlowConfigured(),
        globalOverride: resolveOrderFlowVendor(),
        alpaca: {
          configured: orderFlowConfiguredFor('ES') && orderFlowVenueFor('ES') === 'alpaca',
          venue: orderFlowVenueFor('ES'),
          label: orderFlowLabelFor('ES'),
          hasMarketForIndex: orderFlowHasMarket('ES'),
          hasMarketForGold: orderFlowHasMarket('GC'),
          // Alpaca order flow shares the Alpaca request meter reported above.
          requestsPerMinute: alpacaMeter.limit,
          callsThisMinute: alpacaCallsThisMinute(),
        },
      },
    },
    assets,
    time: Date.now(),
  });
}
