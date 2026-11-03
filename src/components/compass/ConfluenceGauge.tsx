// ============================================
// CONFLUENCE GAUGE
// ============================================
// A semicircular gauge with radial tick marks in a red→gold→green gradient, a
// yellow needle, and a dark central hub with a gold ring.
//
// The needle angle comes from the same -100..+100 score the label does, so the
// needle and the label can never disagree. The needle moves through a CSS
// transition (~600ms) so a new reading glides into place instead of snapping.

import React, { useId } from 'react';
import type { ScoreLabel } from '../../core/types';

interface ConfluenceGaugeProps {
  /** -100 (strong sell) .. +100 (strong buy). */
  score: number;
  /** Rendered under the hub, e.g. "SELL". */
  labelText: string;
  label: ScoreLabel;
  /** Dim the whole gauge when there is no live reading. */
  muted?: boolean;
}

const WIDTH = 260;
const CX = WIDTH / 2;
const CY = 128;
const R = 104;
const TICK_COUNT = 45;

/** Red -> gold -> green, the app's sell/neutral/buy palette. */
function tickColor(t: number): string {
  const stops = [
    { at: 0, rgb: [239, 83, 80] }, // #ef5350
    { at: 0.5, rgb: [245, 158, 11] }, // #f59e0b
    { at: 1, rgb: [38, 166, 154] }, // #26a69a
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].at && t <= stops[i + 1].at) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const local = (t - lo.at) / span;
  const channel = (i: number) => Math.round(lo.rgb[i] + (hi.rgb[i] - lo.rgb[i]) * local);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export const ConfluenceGauge: React.FC<ConfluenceGaugeProps> = ({ score, labelText, label, muted = false }) => {
  const gradientId = `confHub-${useId().replace(/:/g, '')}`;
  const clamped = Math.max(-100, Math.min(100, Number.isFinite(score) ? score : 0));
  const rotation = (clamped / 100) * 90; // -90..+90 degrees

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const t = i / (TICK_COUNT - 1);
    const angle = Math.PI * (1 - t); // pi (left) .. 0 (right)
    const isMajor = i % 5 === 0;
    const outer = R;
    const inner = R - (isMajor ? 16 : 9);
    const x1 = CX + outer * Math.cos(angle);
    const y1 = CY - outer * Math.sin(angle);
    const x2 = CX + inner * Math.cos(angle);
    const y2 = CY - inner * Math.sin(angle);
    return { x1, y1, x2, y2, color: tickColor(t), isMajor };
  });

  const labelColor =
    label === 'STRONG_BUY'
      ? '#26a69a'
      : label === 'BUY'
        ? '#4db6ac'
        : label === 'SELL'
          ? '#e57373'
          : label === 'STRONG_SELL'
            ? '#ef5350'
            : '#f59e0b';

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${WIDTH} 152`}
        className={muted ? 'w-full max-w-[280px] opacity-40' : 'w-full max-w-[280px]'}
        role="img"
        aria-label={`Confluence gauge: ${labelText} (score ${Math.round(clamped)})`}
      >
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor="#12141a" />
            <stop offset="100%" stopColor="#05060a" />
          </radialGradient>
        </defs>

        {/* Radial tick marks, coloured across the sell->buy spectrum. */}
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.color}
            strokeWidth={tick.isMajor ? 3 : 1.5}
            strokeLinecap="round"
            opacity={tick.isMajor ? 0.95 : 0.7}
          />
        ))}

        {/* Needle: yellow, animated by a 600ms transition. */}
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transformBox: 'view-box',
            transition: 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <polygon
            points={`${CX},${CY - R + 14} ${CX + 4},${CY} ${CX - 4},${CY}`}
            fill="#facc15"
          />
        </g>

        {/* Hub: dark centre with a gold ring. */}
        <circle cx={CX} cy={CY} r="11" fill={`url(#${gradientId})`} stroke="#d4af37" strokeWidth="2.5" />
        <circle cx={CX} cy={CY} r="3" fill="#d4af37" />
      </svg>

      <span className="mt-1 font-mono text-title font-black tracking-wide" style={{ color: labelColor }}>
        {labelText}
      </span>
    </div>
  );
};
