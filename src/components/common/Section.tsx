import React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Tighter interior padding, for a screen that must fit without scrolling. */
  dense?: boolean;
}

/**
 * A secondary panel that is always fully visible.
 *
 * These panels used to be collapsible; everything now renders expanded on load
 * so no data is hidden behind a show/hide interaction.
 */
export const Section: React.FC<SectionProps> = ({ title, subtitle, children, dense = false }) => {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0c10]">
      <div
        className={cn(
          'flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/[0.06]',
          dense ? 'px-4 py-2' : 'px-4 py-4 sm:px-6'
        )}
      >
        <h2 className="text-title font-bold text-white">{title}</h2>
        {subtitle && <span className="text-label text-white/50">{subtitle}</span>}
      </div>
      <div className={dense ? 'p-3 sm:p-4' : 'p-panel sm:p-panel-lg'}>{children}</div>
    </section>
  );
};
