// ============================================
// PANEL — the one card shell
// ============================================
// Every card in the app is a Panel: hairline border, deep surface, a small
// uppercase header and a body. It is a flex column that fills its grid cell, so
// `align-items: stretch` on the parent makes two panels in a row end at the same
// pixel. The body scrolls internally when it has to, which is what keeps the
// bottom-row cards the same height no matter how many rows the table has.

import React from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps {
  title: string;
  /** A short caption beside the title, e.g. the timeframe or instrument. */
  subtitle?: React.ReactNode;
  /** Right-aligned header content, e.g. a pill or a small control. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Tighter padding, for a dense panel. */
  dense?: boolean;
  /** Let the body scroll instead of growing the panel. */
  scrollBody?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  actions,
  children,
  className,
  dense = false,
  scrollBody = false,
}) => {
  return (
    <section className={cn('panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl', className)}>
      <header
        className={cn(
          'flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline',
          dense ? 'px-4 py-2' : 'px-4 py-2.5'
        )}
      >
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-micro font-semibold uppercase tracking-[0.12em] text-ink-secondary">
            {title}
          </h2>
          {subtitle && <span className="truncate text-micro text-ink-muted">{subtitle}</span>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div
        className={cn(
          'min-h-0 flex-1',
          scrollBody && 'overflow-y-auto',
          dense ? 'p-3' : 'p-4'
        )}
      >
        {children}
      </div>
    </section>
  );
};
