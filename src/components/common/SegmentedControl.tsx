// ============================================
// SEGMENTED CONTROL
// ============================================
// The asset and timeframe selectors are segmented controls: a hairline track
// with one filled segment for the current choice. Selection is a subtle fill
// plus the accent border, never a loud highlight, and the control is a single
// tab stop with arrow-key navigation, so a keyboard user can move between
// segments without tabbing through each one.

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional secondary line, e.g. a full asset name under a ticker. */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible group label. */
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
  /** Render as a block that fills its container. */
  block?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className,
  block = false,
}: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter(option => !option.disabled);
    const index = enabled.findIndex(option => option.value === value);
    if (index === -1) return;

    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;

    event.preventDefault();
    onChange(enabled[next].value);
    // Move focus to the newly selected segment so the arrow key feels native.
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-inset p-0.5',
        block && 'flex w-full',
        className
      )}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            disabled={option.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex-1 whitespace-nowrap rounded-md font-medium transition-colors duration-150',
              size === 'sm' ? 'px-2.5 py-1 text-micro' : 'px-3 py-1.5 text-label',
              option.disabled
                ? 'cursor-not-allowed text-ink-faint'
                : selected
                  ? 'bg-accent-soft text-ink ring-1 ring-inset ring-accent-border'
                  : 'text-ink-muted hover:bg-elevated hover:text-ink-secondary'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
