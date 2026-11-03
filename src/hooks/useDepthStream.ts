// ============================================
// USE DEPTH STREAM — live order book
// ============================================
// Subscribes to the registered `DepthProvider` and reduces each snapshot to a
// book reading. With the shipped `none` adapter there is no provider, so
// `configured` is false, no subscription is opened and the panel shows "Sem
// feed de profundidade conectado" — never a fabricated book.

import { useEffect, useRef, useState } from 'react';
import { getDepthProvider, type DepthProvider, type DepthSnapshot, type DepthStatus } from '../core/providers/depth';
import { computeBookReading } from '../core/depthflow';
import { EMPTY_FLOW_READING, type FlowReading } from '../core/tickflow';

export interface UseDepthStreamResult {
  reading: FlowReading;
  status: DepthStatus;
  configured: boolean;
  providerLabel: string;
  hasData: boolean;
  lastSnapshotAt: number | null;
}

export function useDepthStream(symbol: string, provider: DepthProvider = getDepthProvider()): UseDepthStreamResult {
  const [reading, setReading] = useState<FlowReading>(EMPTY_FLOW_READING);
  const [status, setStatus] = useState<DepthStatus>('UNAVAILABLE');
  const [hasData, setHasData] = useState(false);
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null);

  const configured = provider.isConfigured();
  const latestRef = useRef<DepthSnapshot | null>(null);

  useEffect(() => {
    if (!configured || !symbol) {
      setStatus('UNAVAILABLE');
      return;
    }

    let active = true;
    setStatus('CONNECTING');

    const subscription = provider.subscribe(symbol, {
      onStatus: next => {
        if (active) setStatus(next);
      },
      onSnapshot: snapshot => {
        if (!active) return;
        latestRef.current = snapshot;
        const next = computeBookReading(snapshot);
        // A book that cannot support an honest read (one empty side) leaves the
        // last real reading in place rather than showing a made-up one.
        if (!next) return;
        setReading(next);
        setLastSnapshotAt(snapshot.timestamp);
        setHasData(true);
      },
    });

    return () => {
      active = false;
      subscription.close();
    };
  }, [provider, symbol, configured]);

  return {
    reading,
    status,
    configured,
    providerLabel: provider.label,
    hasData,
    lastSnapshotAt,
  };
}
