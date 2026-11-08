// ============================================
// DEPTH FLOW TESTS
// ============================================
// BOOK FLOW must be a real book read or nothing. These tests pin the imbalance
// math and the honest null when the book cannot support a read.

import { describe, expect, it } from 'vitest';
import { computeBookReading } from '../depthflow';
import { noneDepthProvider, getDepthProvider, registerDepthProvider, resetDepthProvider } from '../providers/depth';
import type { DepthSnapshot } from '../providers/depth';

function snapshot(bids: [number, number][], asks: [number, number][]): DepthSnapshot {
  return {
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    timestamp: 1_700_000_000_000,
  };
}

describe('computeBookReading', () => {
  it('splits resting size into bid and ask percentages', () => {
    const reading = computeBookReading(snapshot([[100, 70]], [[100.1, 30]]));
    expect(reading).not.toBeNull();
    expect(reading!.buyVolume).toBe(70);
    expect(reading!.sellVolume).toBe(30);
    expect(reading!.buyersPct).toBeCloseTo(70);
    expect(reading!.volumeDelta).toBe(40);
    expect(reading!.basis).toBe('size');
  });

  it('returns null for an empty side rather than a fabricated book', () => {
    expect(computeBookReading(snapshot([], [[100, 30]]))).toBeNull();
    expect(computeBookReading(snapshot([[100, 30]], []))).toBeNull();
  });

  it('returns null for a crossed book', () => {
    expect(computeBookReading(snapshot([[101, 30]], [[100, 30]]))).toBeNull();
  });

  it('ignores levels outside the band around the mid', () => {
    // Mid is 100.05; a bid at 90 is far outside the 0.1% band and must not count.
    const reading = computeBookReading(
      snapshot(
        [
          [100, 50],
          [90, 10_000],
        ],
        [[100.1, 50]]
      )
    );
    expect(reading!.buyVolume).toBe(50);
    expect(reading!.buyersPct).toBeCloseTo(50);
  });

  it('drops levels with a non-positive price or size', () => {
    const reading = computeBookReading(
      snapshot(
        [
          [100, 50],
          [99.99, 0],
        ],
        [
          [100.1, 50],
          [100.2, -5],
        ]
      )
    );
    expect(reading!.totalVolume).toBe(100);
  });
});

describe('depth provider registry', () => {
  it('ships the none adapter by default', () => {
    resetDepthProvider();
    expect(getDepthProvider()).toBe(noneDepthProvider);
    expect(noneDepthProvider.isConfigured()).toBe(false);
  });

  it('lets a real provider be registered and reset', () => {
    const fake = {
      id: 'fake',
      label: 'Fake',
      isConfigured: () => true,
      subscribe: () => ({ close: () => {} }),
    };
    registerDepthProvider(fake);
    expect(getDepthProvider()).toBe(fake);
    resetDepthProvider();
    expect(getDepthProvider()).toBe(noneDepthProvider);
  });
});
