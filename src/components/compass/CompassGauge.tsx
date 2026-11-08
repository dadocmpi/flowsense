// ============================================
// COMPASS GAUGE (flat, restrained)
// ============================================
// A thin half-arc on the signed -100..+100 scale with a numeric readout. No
// needle flourish, no glow: a hairline track, a single directional marker, and
// the score in mono. The label always comes from the same score, so they cannot
// disagree.

import React from 'react';
import type { GaugeReading } from '../../core/types';
import { labelShort, labelColor } from './format';
import { scoreColor, PALETTE } from '../common/palette';

interface CompassGaugeProps {
  gauge: GaugeReading;
  /** Show the Buy / Neutral / Sell vote counts under the gauge. */
  showTally?: boolean;
  /** Compact mode for the tighter cards. */
  compact?: boolean;
}

const W = 168;
const H = 96;
const CX = W / 2;
const CY = 84;
const R = 66;

/** Point on the arc for a score in -100..+100 (left .. right). */
function arcPoint(score: number, radius: number): { x: number; y: number } {
  const angle = Math.PI * (1 - (Math.max(-100, Math.min(100, score)) + 100) / 200);
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}

function arcPath(radius: number, from: number, to: number): string {
  const a = arcPoint(from, radius);
  const b = arcPoint(to, radius);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export const CompassGauge: React.FC<CompassGaugeProps> = ({ gauge, showTally = true, compact = false }) => {
  const score = Math.max(-100, Math.min(100, gauge.score));
  const marker = arcPoint(score, R);
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={compact ? 'w-[132px]' : 'w-[168px]'}
        role="img"
        aria-label={`Compass: ${labelShort(gauge.label)} (score ${Math.round(score)})`}
      >
        {/* Track, then the coloured arc up to the score. */}
        <path d={arcPath(R, -100, 100)} fill="none" stroke={PALETTE.line} strokeWidth="6" strokeLinecap="butt" />
        <path d={arcPath(R, -100, score)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="butt" />
        {/* Scale ticks at -100, 0, +100. */}
        {[-100, 0, 100].map(t => {
          const p = arcPoint(t, R - 8);
          return <circle key={t} cx={p.x} cy={p.y} r="1.4" fill={PALETTE.inkSubtle} />;
        })}
        {/* The score marker. */}
        <circle cx={marker.x} cy={marker.y} r="3.4" fill={color} />
        <circle cx={marker.x} cy={marker.y} r="1.2" fill={PALETTE.base1} />
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          className="font-mono"
          fontSize="22"
          fontWeight="600"
          fill={color}
        >
          {score >= 0 ? '+' : ''}
          {Math.round(score)}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9.5" letterSpacing="0.08em" fill={PALETTE.inkSubtle}>
          {labelShort(gauge.label).toUpperCase()}
        </text>
      </svg>

      {showTally && (
        <div className="mt-0.5 flex items-center gap-2 font-mono text-micro">
          <span style={{ color: PALETTE.pos }}>B {gauge.tally.buy}</span>
          <span className="text-ink-subtle">·</span>
          <span className="text-ink-muted">N {gauge.tally.neutral}</span>
          <span className="text-ink-subtle">·</span>
          <span style={{ color: PALETTE.neg }}>S {gauge.tally.sell}</span>
        </div>
      )}
    </div>
  );
};
