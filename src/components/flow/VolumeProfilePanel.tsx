// ============================================
// VOLUME PROFILE PANEL (real, from the tape)
// ============================================
// Volume-at-price for the current UTC session (and the previous one), built from
// the venue's real aggressive prints. Shows the point of control, the 70% value
// area (VAH/VAL), and the session high/low from the candle series.
//
// It replaces the old candle-only "estimated zones". Every bar is real traded
// volume at a real price, labelled with its venue.

import React from 'react';
import type { VolumeProfile } from '../../core/volumeProfile';
import type { FeedHealth } from '../../core/orderflow/types';
import { Panel } from '../common/Panel';
import { PALETTE } from '../common/palette';
import { formatNumber, formatAge } from '../compass/format';
import { FeedHealthBadge } from './FeedHealthBadge';

interface VolumeProfilePanelProps {
  profile: VolumeProfile;
  previousProfile: VolumeProfile;
  precision: number;
  venue: string;
  health: FeedHealth;
  now: number;
}

/** Horizontal volume-at-price histogram, POC and value area marked. */
const ProfileChart: React.FC<{ profile: VolumeProfile; precision: number; rows?: number }> = ({
  profile,
  precision,
  rows = 34,
}) => {
  if (!profile.available || profile.bins.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-micro text-ink-subtle">
        No session volume yet.
      </div>
    );
  }

  // Thin the bins to a readable row count, merging from the high price down.
  const bins = profile.bins;
  const step = Math.max(1, Math.ceil(bins.length / rows));
  const grouped: { low: number; high: number; total: number; buy: number; inValueArea: boolean }[] = [];
  for (let i = bins.length - 1; i >= 0; i -= step) {
    const slice = bins.slice(Math.max(0, i - step + 1), i + 1);
    grouped.push({
      low: slice[0].low,
      high: slice[slice.length - 1].high,
      total: slice.reduce((s, b) => s + b.total, 0),
      buy: slice.reduce((s, b) => s + b.buy, 0),
      inValueArea: slice.some(b => b.inValueArea),
    });
  }
  const maxTotal = Math.max(1, ...grouped.map(g => g.total));

  return (
    <div className="flex flex-col gap-[1px]">
      {grouped.map((row, i) => {
        const width = (row.total / maxTotal) * 100;
        const buyShare = row.total > 0 ? row.buy / row.total : 0.5;
        const isPoc = profile.poc !== null && profile.poc >= row.low && profile.poc < row.high;
        return (
          <div key={i} className="group flex items-center gap-2">
            <span className="w-[68px] shrink-0 text-right font-mono text-micro tabular text-ink-subtle">
              {formatNumber((row.low + row.high) / 2, precision)}
            </span>
            <div className="relative h-[9px] flex-1 bg-base-2">
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${width}%`, background: row.inValueArea ? PALETTE.accent : PALETTE.inkSubtle, opacity: row.inValueArea ? 0.75 : 0.35 }}
              />
              {/* The buy share of this band, as a thin marker. */}
              <div
                className="absolute inset-y-0 w-px"
                style={{ left: `${width * buyShare}%`, background: PALETTE.pos, opacity: 0.9 }}
                aria-hidden
              />
              {isPoc && (
                <span className="absolute -top-[1px] right-0 font-mono text-micro font-semibold" style={{ color: PALETTE.warn }}>
                  POC
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const VolumeProfilePanel: React.FC<VolumeProfilePanelProps> = ({
  profile,
  previousProfile,
  precision,
  venue,
  health,
  now,
}) => {
  const available = profile.available;
  const prevAvailable = previousProfile.available;

  return (
    <Panel
      title="Volume profile"
      badge={<FeedHealthBadge health={health} />}
      meta={
        <>
          <span className="uppercase tracking-[0.06em]">{venue}</span>
          <span>· session UTC</span>
          <span>· updated {formatAge(health.lastMessageAt, now)}</span>
        </>
      }
    >
      {!available ? (
        <div className="flex h-[180px] flex-col items-center justify-center gap-1 text-center">
          <span className="text-label text-ink-muted">No profile yet</span>
          <span className="text-micro text-ink-subtle">
            {health.status === 'LIVE'
              ? 'Collecting real prints for this UTC session.'
              : health.reason ?? 'The venue stream is not connected.'}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <ProfileChart profile={profile} precision={precision} />

          <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2">
            <Value label="POC" value={profile.poc} precision={precision} color={PALETTE.warn} />
            <Value label="VAH (70%)" value={profile.vah} precision={precision} color={PALETTE.neg} />
            <Value label="VAL (70%)" value={profile.val} precision={precision} color={PALETTE.pos} />
            <Value label="Session high" value={profile.sessionHigh} precision={precision} color={PALETTE.neg} />
            <Value label="Session low" value={profile.sessionLow} precision={precision} color={PALETTE.pos} />
            <Value label="Bin size" value={profile.binSize} precision={precision} />
            <Value
              label="Session volume"
              value={profile.totalVolume}
              precision={0}
            />
            {prevAvailable && <Value label="Prev POC" value={previousProfile.poc} precision={precision} muted />}
            {prevAvailable && <Value label="Prev VAH" value={previousProfile.vah} precision={precision} muted />}
            {prevAvailable && <Value label="Prev VAL" value={previousProfile.val} precision={precision} muted />}
          </dl>
        </div>
      )}
    </Panel>
  );
};

function Value({
  label,
  value,
  precision,
  color,
  muted,
}: {
  label: string;
  value: number | null;
  precision: number;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/60 pb-0.5">
      <dt className="text-micro uppercase tracking-[0.06em] text-ink-subtle">{label}</dt>
      <dd
        className="font-mono text-label tabular"
        style={{ color: muted ? PALETTE.inkSubtle : color }}
      >
        {value === null ? '--' : formatNumber(value, precision)}
      </dd>
    </div>
  );
}
