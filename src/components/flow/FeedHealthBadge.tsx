// ============================================
// FEED HEALTH
// ============================================
// The venue feed's real condition: connected / reconnecting / down, with the
// latency and the age of the last message. It never dresses a stale feed as
// live, and it names the reason when the venue refuses the region.

import React from 'react';
import type { FeedHealth } from '../../core/orderflow/types';
import { Badge, type Tone } from '../common/ui';

const TONE: Record<FeedHealth['status'], Tone> = {
  LIVE: 'pos',
  CONNECTING: 'warn',
  RECONNECTING: 'warn',
  DOWN: 'neg',
  UNAVAILABLE: 'neg',
  DISABLED: 'neutral',
};

const WORD: Record<FeedHealth['status'], string> = {
  LIVE: 'Live',
  CONNECTING: 'Connecting',
  RECONNECTING: 'Reconnecting',
  DOWN: 'Down',
  UNAVAILABLE: 'Unavailable',
  DISABLED: 'Disabled',
};

/** The status badge alone, for a panel header. */
export const FeedHealthBadge: React.FC<{ health: FeedHealth }> = ({ health }) => (
  <Badge tone={TONE[health.status]} title={health.reason ?? undefined}>
    {WORD[health.status]}
  </Badge>
);

/**
 * The full readout: status, reason, latency and last-message age.
 */
export const FeedHealthDetail: React.FC<{ health: FeedHealth; now: number }> = ({ health, now }) => {
  const ageMs = health.lastMessageAt === null ? null : Math.max(0, now - health.lastMessageAt);
  const age = ageMs === null ? '--' : ageMs < 1000 ? `${ageMs}ms` : `${(ageMs / 1000).toFixed(1)}s`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-subtle">
      <span className="flex items-center gap-1.5">
        <span className="uppercase tracking-[0.06em]">Feed</span>
        <FeedHealthBadge health={health} />
      </span>
      <span>
        Latency <span className="font-mono tabular text-ink-muted">{health.latencyMs === null ? '--' : `${health.latencyMs}ms`}</span>
      </span>
      <span>
        Last msg <span className="font-mono tabular text-ink-muted">{age}</span>
      </span>
      <span>
        Msgs <span className="font-mono tabular text-ink-muted">{health.messageCount}</span>
      </span>
      {health.reason && <span className="text-warn">{health.reason}</span>}
    </div>
  );
};
