// ============================================================================
// ZONE CLUSTERING / CONFLUENCE ENGINE
// ============================================================================
// Groups nearby raw institutional zones into ConfluenceZones
// and ranks them by proximity + confluence count.

import { ConfluenceZone, InstitutionalZone, ZoneSource, ZoneStatus } from './types';

export interface ClusterConfig {
  /** Maximum distance (in price units) between zones to consider as overlapping. */
  proximityThreshold: number;
  /** Maximum number of active zones to keep in priority list. */
  maxActiveZones: number;
  /** Distance (in price units) below which a zone is considered "approaching". */
  approachingDistance: number;
}

export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  proximityThreshold: 3.0,    // tune per symbol volatility
  maxActiveZones: 8,
  approachingDistance: 5.0,
};

/**
 * Cluster raw zones into confluence zones based on price proximity.
 * Uses single-link clustering: if zone A is close to zone B, and zone B
 * is close to zone C, all three merge.
 */
export function clusterZones(
  rawZones: InstitutionalZone[],
  config: ClusterConfig = DEFAULT_CLUSTER_CONFIG
): ConfluenceZone[] {
  // Filter only active zones
  const active = rawZones.filter(z => z.status === 'ACTIVE');
  if (active.length === 0) return [];

  // Single-link clustering
  const clusters: InstitutionalZone[][] = [];
  const visited = new Set<string>();

  for (const zone of active) {
    if (visited.has(zone.id)) continue;
    const cluster: InstitutionalZone[] = [zone];
    visited.add(zone.id);

    // BFS to find all zones close to this one
    let added = true;
    while (added) {
      added = false;
      for (const candidate of active) {
        if (visited.has(candidate.id)) continue;
        // Check if candidate is close to any zone in current cluster
        const overlaps = cluster.some(c =>
          distanceBetweenZones(c, candidate) <= config.proximityThreshold
        );
        if (overlaps) {
          cluster.push(candidate);
          visited.add(candidate.id);
          added = true;
        }
      }
    }

    clusters.push(cluster);
  }

  // Convert clusters to ConfluenceZones
  return clusters.map(cluster => buildConfluenceZone(cluster));
}

/**
 * Distance between two zones (0 if they overlap).
 */
function distanceBetweenZones(a: InstitutionalZone, b: InstitutionalZone): number {
  // If they overlap, distance is 0
  if (a.high >= b.low && b.high >= a.low) return 0;
  // Otherwise, gap between closest edges
  if (a.high < b.low) return b.low - a.high;
  return a.low - b.high;
}

/**
 * Build a ConfluenceZone from a cluster of raw zones.
 */
function buildConfluenceZone(cluster: InstitutionalZone[]): ConfluenceZone {
  const high = Math.max(...cluster.map(z => z.high));
  const low = Math.min(...cluster.map(z => z.low));
  const mid = (high + low) / 2;
  const sources = Array.from(new Set(cluster.map(z => z.source))) as ZoneSource[];

  // Direction: vote by raw zones, break ties via strength
  const bullCount = cluster.filter(z => z.direction === 'BULLISH').length;
  const bearCount = cluster.filter(z => z.direction === 'BEARISH').length;
  const neutralCount = cluster.filter(z => z.direction === 'NEUTRAL').length;

  let direction: ConfluenceZone['direction'] = 'NEUTRAL';
  if (bullCount > bearCount && bullCount > neutralCount) direction = 'BULLISH';
  else if (bearCount > bullCount && bearCount > neutralCount) direction = 'BEARISH';

  // Total strength: average of cluster strengths, boosted by confluence count
  const avgStrength = cluster.reduce((s, z) => s + z.strength, 0) / cluster.length;
  const confluenceBoost = 1 + (sources.length - 1) * 0.15;
  const totalStrength = Math.min(1, avgStrength * confluenceBoost);

  const now = Date.now();
  const oldest = Math.min(...cluster.map(z => z.createdAt));
  const latest = Math.max(...cluster.map(z => z.createdAt));

  return {
    id: `confluence-${oldest}-${sources.join('-')}`,
    high,
    low,
    mid,
    direction,
    timeframe: cluster[0].timeframe,
    sources,
    rawZoneIds: cluster.map(z => z.id),
    confluenceCount: sources.length,
    totalStrength,
    status: 'ACTIVE',
    createdAt: oldest,
    updatedAt: now,
    lastTestedAt: latest,
    distanceToPrice: 0, // computed later
    proximityScore: 0,
    relevanceScore: 0,
  };
}

/**
 * Compute proximity and relevance scores for each confluence zone
 * relative to current price.
 */
export function rankConfluenceZones(
  zones: ConfluenceZone[],
  currentPrice: number,
  config: ClusterConfig = DEFAULT_CLUSTER_CONFIG
): ConfluenceZone[] {
  return zones
    .map(z => {
      // Distance: signed (positive = zone above price, negative = below)
      const signedDist = z.mid > currentPrice ? z.mid - currentPrice : -(currentPrice - z.mid);
      const absDist = Math.abs(signedDist);

      // Proximity score: 1.0 at price, 0.0 at far distances
      // Uses an exponential decay with a scale tied to the approaching distance
      const proximityScore = Math.exp(-absDist / (config.approachingDistance * 2));

      // Relevance = confluence * strength * proximity
      // Confluence weight increases with number of distinct sources
      const confluenceWeight = 1 + (z.confluenceCount - 1) * 0.2;
      const relevanceScore = z.totalStrength * proximityScore * confluenceWeight;

      return {
        ...z,
        distanceToPrice: signedDist,
        proximityScore,
        relevanceScore: Math.min(1, relevanceScore),
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, config.maxActiveZones);
}

/**
 * Determine if price is inside a confluence zone.
 */
export function isPriceInZone(zone: ConfluenceZone, price: number): boolean {
  return price >= zone.low && price <= zone.high;
}

/**
 * Determine if price is approaching a zone (within approaching distance
 * but not yet inside).
 */
export function isPriceApproaching(zone: ConfluenceZone, price: number, config: ClusterConfig = DEFAULT_CLUSTER_CONFIG): boolean {
  const dist = Math.abs(zone.mid - price);
  return dist <= config.approachingDistance && dist > (zone.high - zone.low) / 2;
}

/**
 * Check if a zone should be invalidated based on price action.
 * A bullish zone is invalidated if price closes significantly below it.
 * A bearish zone is invalidated if price closes significantly above it.
 */
export function shouldInvalidateZone(zone: ConfluenceZone, price: number, invalidationBuffer: number = 1.0): boolean {
  if (zone.direction === 'BULLISH' && price < zone.low - invalidationBuffer) return true;
  if (zone.direction === 'BEARISH' && price > zone.high + invalidationBuffer) return true;
  return false;
}

/**
 * Update zone statuses based on price action and time.
 * Returns the updated zones with status changes applied.
 */
export function updateZoneStatuses(
  zones: ConfluenceZone[],
  currentPrice: number,
  invalidationBuffer: number = 1.0
): ConfluenceZone[] {
  const now = Date.now();
  return zones.map(z => {
    let status: ZoneStatus = z.status;
    let invalidationPrice: number | undefined;

    if (shouldInvalidateZone(z, currentPrice, invalidationBuffer)) {
      status = 'INVALIDATED';
      invalidationPrice = currentPrice;
    } else if (isPriceInZone(z, currentPrice)) {
      status = z.testedCount > 0 ? 'PARTIALLY_FILLED' : 'TESTED';
    } else if (Math.abs(z.mid - currentPrice) < (z.high - z.low)) {
      status = 'TESTED';
    }

    return {
      ...z,
      status,
      lastTestedAt: status === 'TESTED' || status === 'PARTIALLY_FILLED' ? now : z.lastTestedAt,
      invalidationPrice,
      updatedAt: now,
    };
  });
}