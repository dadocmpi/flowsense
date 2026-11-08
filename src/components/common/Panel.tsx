// ============================================
// PANEL — the one panel chrome
// ============================================
// A quiet header bar (title left; source / timeframe / timestamp right) over a
// body. One hairline border, a 2px radius, three graphite surfaces. Every panel
// on the screen uses this so the chrome never drifts.

import React from 'react';
import { cn } from '@/lib/utils';

interface PanelProps {
  title: React.ReactNode;
  /** Right-aligned header content: source, timeframe, timestamp. */
  meta?: React.ReactNode;
  /** A badge rendered next to the title (state, source kind). */
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** A hairline separator under the header; on by default. */
  divided?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  meta,
  badge,
  children,
  className,
  bodyClassName,
  divided = true,
}) => (
  <section className={cn('flex flex-col rounded-sm border border-line bg-base-1', className)}>
    <header
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2',
        divided && 'border-b border-line'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {title}
        </h2>
        {badge}
      </div>
      {meta && <div className="flex shrink-0 items-center gap-2 text-micro text-ink-subtle">{meta}</div>}
    </header>
    <div className={cn('flex-1 p-3', bodyClassName)}>{children}</div>
  </section>
);
