// ============================================
// SKELETON
// ============================================
// Loading states are skeletons, not spinners: the panel keeps its shape while
// data arrives, so the layout does not jump when it lands. The shimmer is
// disabled automatically under prefers-reduced-motion (see globals.css).

import React from 'react';
import { cn } from '@/lib/utils';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div aria-hidden className={cn('skeleton rounded', className)} />
);

/** A short stack of skeleton lines, for a paragraph-shaped placeholder. */
export const SkeletonLines: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
  <div className={cn('space-y-2', className)}>
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
);
