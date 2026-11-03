// ============================================
// GET /api/health
// ============================================
// A cheap liveness + configuration report. It costs NO vendor calls: it reads
// environment configuration and the in-memory rate meters, and never fetches
// from a vendor. That keeps a health check from being a hidden consumer.
//
// Per asset it reports the provider it RESOLVED to, the symbol that provider is
// asked for, whether the credentials that provider needs are present (a boolean,
// never a value), and the time of the last successful call. The same facts the
// UI shows in its "no data source configured" card, so the two cannot disagree.
//
// Per provider it reports configured, which credential variables are missing (by
// name), lastCallAt, lastSuccessAt and callsThisMinute. Keys are never included.

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
import {
  creditCallsThisMinute,
  creditLastCallAt,
  lastCreditSuccessAt,
  meterSnapshot,
} from './_lib/creditMeter.js';
import {
  alpacaCallsThisMinute,
  alpacaLastCallAt,
  alpacaLastSuccessAt,
  alpacaMeterSnapshot,
} from './_lib/alpacaMeter.js';
import { assetRequirements, providerCredentials, type AssetProviderId } from './_lib/assets.js';

export default function handler(_req: ApiRequest, res: ApiResponse): void {
  const twelveKey = vendorApiKey();
  const twelveConfigured = Boolean(resolveVendor()) && twelveKey !== null;
  const alpaca = alpacaConfigured();
  const meter = meterSnapshot();
  const alpacaMeter = alpacaMeterSnapshot();

  const twelveCreds = providerCredentials('twelvedata');
  const alpacaCreds = providerCredentials('alpaca');

  const lastSuccessByProvider: Record<AssetProviderId, number | null> = {
    twelvedata: lastCreditSuccessAt(),
    alpaca: alpacaLastSuccessAt(),
  };

  // One entry per asset: its resolved provider, symbol, whether the credentials
  // that provider needs are present, and the last successful call time.
  const assets = assetRequirements().map(requirement => ({
    instrumentId: requirement.instrumentId,
    name: requirement.name,
    provider: requirement.provider,
    symbol: requirement.symbol,
    proxy: requirement.provider === 'alpaca',
    credentialsPresent: requirement.credentialsPresent,
    requiredEnvVars: requirement.requiredEnvVars,
    missingEnvVars: requirement.missingEnvVars,
    lastSuccessfulCallAt: lastSuccessByProvider[requirement.provider],
  }));

  sendJson(res, 200, {
    ok: true,
    providers: {
      twelvedata: {
        configured: twelveConfigured,
        // Never the key itself — only whether each half is present.
        hasKey: twelveKey !== null,
        credentialsPresent: twelveCreds.present,
        missingEnvVars: twelveCreds.missing,
        creditsPerMinute: meter.limit,
        usedThisMinute: meter.used,
        remainingThisMinute: meter.remaining,
        exhausted: meter.exhausted,
        resetAt: meter.resetAt,
        callsThisMinute: creditCallsThisMinute(),
        lastCallAt: creditLastCallAt(),
        lastSuccessfulCallAt: lastCreditSuccessAt(),
      },
      alpaca: {
        configured: alpaca,
        hasKeyId: alpacaKeyId() !== null,
        hasSecret: alpacaSecretKey() !== null,
        credentialsPresent: alpacaCreds.present,
        missingEnvVars: alpacaCreds.missing,
        requestsPerMinute: alpacaMeter.limit,
        callsThisMinute: alpacaCallsThisMinute(),
        remainingThisMinute: alpacaMeter.remaining,
        exhausted: alpacaMeter.exhausted,
        resetAt: alpacaMeter.resetAt,
        /** Epoch ms of the last Alpaca request, or null if none yet. */
        lastCallAt: alpacaLastCallAt(),
        /** Epoch ms of the last Alpaca call that returned real bars, or null. */
        lastSuccessfulCallAt: alpacaLastSuccessAt(),
      },
    },
    assets,
    time: Date.now(),
  });
}
