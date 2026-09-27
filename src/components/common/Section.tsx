import React from 'react';

interface SectionProps {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A secondary panel that is always fully visible.
 *
 * These panels used to be collapsible; everything now renders expanded on load
 * so no data is hidden behind a show/hide interaction.
 */
export const Section: React.FC<SectionProps> = ({ title, subtitle, children }) => {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0c10]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/[0.06] px-4 py-4 sm:px-6">
        <h2 className="text-title font-bold text-white">{title}</h2>
        {subtitle && <span className="text-label text-white/50">{subtitle}</span>}
      </div>
      <div className="p-panel sm:p-panel-lg">{children}</div>
    </section>
  );
};
