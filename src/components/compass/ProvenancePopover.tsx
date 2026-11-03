// ============================================
// PROVENANCE POPOVER
// ============================================
// The honest label for what an asset is really reading: which provider, which
// symbol, which feed, and whether it is a proxy. An index asset read through an
// ETF is called a proxy, and an IEX feed's volume is called partial market
// volume — never consolidated volume.
//
// Self-contained (a button plus a positioned panel) so it needs no popover
// dependency, and always visible on demand rather than hidden behind a hover.

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ProvenanceDetails {
  /** The asset's display name, e.g. "S&P 500". */
  asset: string;
  /** The provider that serves it, e.g. "Alpaca". */
  provider: string;
  /** The provider's symbol, e.g. "SPY". */
  symbol: string;
  /** The market-data feed, e.g. "IEX". */
  feed?: string;
  /** True when the volume is a single exchange's, not consolidated. */
  partialVolume?: boolean;
  /** True when the symbol is a proxy for the underlying. */
  isProxy?: boolean;
  /** Plain-English description, e.g. "SPY — index proxy". */
  description?: string;
}

interface ProvenancePopoverProps {
  details: ProvenanceDetails;
}

export const ProvenancePopover: React.FC<ProvenancePopoverProps> = ({ details }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className={cn(
          'rounded border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider transition-colors',
          open
            ? 'border-white/25 bg-white/[0.06] text-white/80'
            : 'border-white/[0.1] bg-white/[0.02] text-white/50 hover:text-white/80'
        )}
      >
        Provenance
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-white/[0.1] bg-[#0b0d10] p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-label font-bold text-white">{details.asset}</span>
            {details.isProxy && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wider text-amber-400">
                Proxy
              </span>
            )}
          </div>

          <dl className="space-y-1 text-label">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-white/40">Provider</dt>
              <dd className="font-mono text-white/80">{details.provider}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-white/40">Symbol</dt>
              <dd className="font-mono text-white/80">{details.symbol}</dd>
            </div>
            {details.feed && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-white/40">Feed</dt>
                <dd className="font-mono text-white/80">{details.feed.toUpperCase()}</dd>
              </div>
            )}
            {details.partialVolume && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-white/40">Volume</dt>
                <dd className="text-white/80">Partial market volume</dd>
              </div>
            )}
          </dl>

          <p className="mt-2 text-micro leading-relaxed text-white/45">
            {details.isProxy
              ? 'Read through an ETF proxy, not the index itself.'
              : 'Read directly from the configured source.'}
            {details.partialVolume && ' IEX volume is one exchange’s volume, not consolidated market volume.'}
          </p>
        </div>
      )}
    </div>
  );
};
