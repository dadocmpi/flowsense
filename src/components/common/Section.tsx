// ============================================
// SECTION
// ============================================
// A thin wrapper over Panel for the secondary panels, kept so call sites read
// the same as before. Everything renders expanded on load — nothing here is
// collapsible.

import React from 'react';
import { Panel } from './Panel';

interface SectionProps {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Tighter interior padding, for a screen that must fit without scrolling. */
  dense?: boolean;
  /** Right-aligned header content. */
  actions?: React.ReactNode;
  className?: string;
  /** Let the body scroll instead of growing the panel. */
  scrollBody?: boolean;
}

export const Section: React.FC<SectionProps> = ({ title, subtitle, children, dense, actions, className, scrollBody }) => (
  <Panel title={title} subtitle={subtitle} dense={dense} actions={actions} className={className} scrollBody={scrollBody}>
    {children}
  </Panel>
);
