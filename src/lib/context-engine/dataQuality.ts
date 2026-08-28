// ============================================================================
// DATA QUALITY ENGINE
// ============================================================================
// Assesses availability and reliability of market data feeds.
// Critical missing data reduces contextual confidence.

import { DataQuality, DataQualityIssue, Severity } from './types';

export interface DataQualityInput {
  hasOrderBook: boolean;
  hasTape: boolean;
  hasVolume: boolean;
  hasStructure: boolean;
  hasZones: boolean;
  lastTickerUpdate: number;
  lastTapeUpdate: number;
  lastDepthUpdate: number;
  now: number;
  tapeTradeCount: number;
  orderBookLevels: number;
}

const STALE_THRESHOLDS = {
  ticker: 10_000,     // 10 seconds
  tape: 5_000,        // 5 seconds
  depth: 5_000,       // 5 seconds
};

/**
 * Compute data quality score and issues.
 */
export function assessDataQuality(input: DataQualityInput): DataQuality {
  const issues: DataQualityIssue[] = [];
  let score = 1.0;

  // Order book
  if (!input.hasOrderBook) {
    issues.push({ source: 'orderbook', severity: 'HIGH', message: 'Order book feed not connected' });
    score -= 0.25;
  } else if (input.orderBookLevels < 5) {
    issues.push({ source: 'orderbook', severity: 'MEDIUM', message: 'Order book depth is shallow' });
    score -= 0.1;
  } else if (input.now - input.lastDepthUpdate > STALE_THRESHOLDS.depth) {
    issues.push({ source: 'orderbook', severity: 'HIGH', message: 'Order book data is stale' });
    score -= 0.2;
  }

  // Tape
  if (!input.hasTape) {
    issues.push({ source: 'tape', severity: 'MEDIUM', message: 'Tape / trade feed not connected' });
    score -= 0.15;
  } else if (input.tapeTradeCount < 5) {
    issues.push({ source: 'tape', severity: 'LOW', message: 'Low trade activity in recent window' });
    score -= 0.05;
  } else if (input.now - input.lastTapeUpdate > STALE_THRESHOLDS.tape) {
    issues.push({ source: 'tape', severity: 'HIGH', message: 'Tape data is stale' });
    score -= 0.15;
  }

  // Volume
  if (!input.hasVolume) {
    issues.push({ source: 'volume', severity: 'MEDIUM', message: 'Volume data unavailable' });
    score -= 0.15;
  }

  // Structure
  if (!input.hasStructure) {
    issues.push({ source: 'structure', severity: 'HIGH', message: 'Insufficient price history for structure analysis' });
    score -= 0.2;
  }

  // Zones
  if (!input.hasZones) {
    issues.push({ source: 'zones', severity: 'HIGH', message: 'No institutional zones detected' });
    score -= 0.2;
  }

  // Ticker freshness
  if (input.now - input.lastTickerUpdate > STALE_THRESHOLDS.ticker) {
    issues.push({ source: 'ticker', severity: 'EXTREME', message: 'Price feed is stale - analysis should be paused' });
    score -= 0.3;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    score,
    issues,
    hasOrderBook: input.hasOrderBook,
    hasTape: input.hasTape,
    hasVolume: input.hasVolume,
    hasStructure: input.hasStructure,
    hasZones: input.hasZones,
    lastUpdate: input.now,
  };
}

/**
 * Format data quality for display.
 */
export function formatDataQuality(dq: DataQuality): string {
  const pct = Math.round(dq.score * 100);
  if (pct >= 90) return `${pct}% - EXCELLENT`;
  if (pct >= 70) return `${pct}% - GOOD`;
  if (pct >= 50) return `${pct}% - DEGRADED`;
  if (pct >= 30) return `${pct}% - LOW`;
  return `${pct}% - CRITICAL`;
}