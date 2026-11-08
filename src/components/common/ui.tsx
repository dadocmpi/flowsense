// ============================================
// SHARED TERMINAL PRIMITIVES
// ============================================
// Small, dense building blocks used across panels: a badge, a key/value stat, a
// status dot and a segmented toggle. All hairline-bordered, 2px radius, no
// decoration.

import React from 'react';
import { cn } from '@/lib/utils';
import { PALETTE } from './palette';

export type Tone = 'neutral' | 'pos' | 'neg' | 'warn' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-line bg-base-2 text-ink-muted',
  pos: 'border-pos/40 bg-pos/10 text-pos',
  neg: 'border-neg/40 bg-neg/10 text-neg',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  accent: 'border-accent/40 bg-accent/10 text-accent',
};

/** A small uppercase state badge. */
export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; title?: string; className?: string }> = ({
  tone = 'neutral',
  children,
  title,
  className,
}) => (
  <span
    title={title}
    className={cn(
      'inline-flex items-center rounded-sm border px-1.5 py-[1px] font-mono text-micro font-medium uppercase tracking-[0.06em]',
      TONE_CLASS[tone],
      className
    )}
  >
    {children}
  </span>
);

/** A key/value readout: label above, tabular value below. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; color?: string; title?: string }> = ({
  label,
  value,
  color,
  title,
}) => (
  <div className="flex flex-col gap-0.5" title={title}>
    <span className="text-micro uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
    <span className="font-mono text-label font-medium tabular" style={color ? { color } : undefined}>
      {value}
    </span>
  </div>
);

const DOT_COLOR: Record<Tone, string> = {
  neutral: PALETTE.inkSubtle,
  pos: PALETTE.pos,
  neg: PALETTE.neg,
  warn: PALETTE.warn,
  accent: PALETTE.accent,
};

/** A small status dot. */
export const StatusDot: React.FC<{ tone: Tone }> = ({ tone }) => (
  <span
    aria-hidden
    className="inline-block h-[7px] w-[7px] rounded-full"
    style={{ background: DOT_COLOR[tone] }}
  />
);

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** A segmented control: two or three options, the active one filled. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex overflow-hidden rounded-sm border border-line', className)} role="group">
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => !option.disabled && onChange(option.value)}
            className={cn(
              'px-2.5 py-1 font-mono text-micro font-medium uppercase tracking-[0.06em] transition-colors',
              active ? 'bg-base-3 text-ink' : 'bg-base-1 text-ink-subtle hover:text-ink',
              option.disabled && 'cursor-not-allowed text-ink-subtle/40 hover:text-ink-subtle/40'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
