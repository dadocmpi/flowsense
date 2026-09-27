import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

/**
 * A secondary panel that stays collapsed until the reader asks for it.
 *
 * The vendored shadcn Collapsible pulls in `@radix-ui/react-collapsible`,
 * which is not installed here, so this keeps the toggle self-contained.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  subtitle,
  children,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0c10]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] sm:px-6"
      >
        <span>
          <span className="text-title font-bold text-white">{title}</span>
          {subtitle && <span className="ml-3 text-label text-white/50">{subtitle}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-label font-semibold text-white/50">
          <span>{open ? 'Hide' : 'Show'}</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && <div className="border-t border-white/[0.06] p-panel sm:p-panel-lg">{children}</div>}
    </section>
  );
};
