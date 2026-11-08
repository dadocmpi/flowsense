// ============================================
// STATUS PILL
// ============================================
// One pill shape for every short status word: a market state, a feed state, a
// signal tier. The tone picks a desaturated semantic colour; the optional glyph
// carries the same meaning as the colour, so the state survives a colour-blind
// viewer. No glow, no neon.

import React from 'react';
import { cn } from '@/lib/utils';

export type PillTone = 'neutral' | 'buy' | 'sell' | 'warn' | 'accent' | 'muted';

const TONE_CLASS: Record<PillTone, string> = {
  neutral: 'border-hairline bg-flat-soft text-ink-secondary',
  muted: 'border-hairline bg-inset text-ink-muted',
  buy: 'border-buy-border bg-buy-soft text-buy',
  sell: 'border-sell-border bg-sell-soft text-sell',
  warn: 'border-warn-border bg-warn-soft text-warn',
  accent: 'border-accent-border bg-accent-soft text-accent',
};

export interface PillProps {
  tone?: PillTone;
  /** A glyph that carries the meaning without colour, e.g. ▲ ▼ ●. */
  glyph?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const Pill: React.FC<PillProps> = ({ tone = 'neutral', glyph, children, className, title }) => (
  <span
    title={title}
    className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-micro font-medium uppercase tracking-[0.08em]',
      TONE_CLASS[tone],
      className
    )}
  >
    {glyph && (
      <span aria-hidden className="text-[0.7em] leading-none">
        {glyph}
      </span>
    )}
    {children}
  </span>
);
