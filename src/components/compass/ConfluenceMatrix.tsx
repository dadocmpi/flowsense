// ============================================
// CONFLUENCE MATRIX
// ============================================
// Every timeframe's reading at a glance, plus the weighted confluence bias.
//
// Each cell's colour, word and score all come from that timeframe's summary
// score, so a cell can never read differently from the card below it.

import React from 'react';
import type { MultiTimeframeReading } from '../../core/multiTimeframe';
import type { Timeframe } from '../../core/types';
import { labelShort, scoreColor } from './format';
import { cn } from '@/lib/utils';

interface ConfluenceMatrixProps {
  reading: MultiTimeframeReading;
  selected: Timeframe;
  onSelect: (timeframe: Timeframe) => void;
}

export const ConfluenceMatrix: React.FC<ConfluenceMatrixProps> = ({ reading, selected, onSelect }) => {
  const { confluence } = reading;
  const biasColor = scoreColor(confluence.bias);

  return (
    <div className="space-y-4">
      {/* Timeframe cells */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {reading.timeframes.map(frame => {
          const color = scoreColor(frame.summary.score);
          const isSelected = frame.timeframe === selected;

          return (
            <button
              key={frame.timeframe}
              type="button"
              onClick={() => onSelect(frame.timeframe)}
              aria-pressed={isSelected}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-all',
                isSelected
                  ? 'border-amber-400/60 bg-amber-400/[0.07]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
              )}
            >
              <span className="text-label font-bold text-white/70">{frame.timeframe}</span>
              {frame.available ? (
                <>
                  <span className="text-body font-bold" style={{ color }}>
                    {labelShort(frame.summary.label)}
                  </span>
                  <span className="font-mono text-micro" style={{ color }}>
                    {frame.summary.score > 0 ? '+' : ''}
                    {Math.round(frame.summary.score)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-body font-bold text-white/30">No data</span>
                  <span className="font-mono text-micro text-white/25">--</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Confluence summary */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-micro font-semibold uppercase tracking-wider text-white/40">Confluence</span>
            <span className="text-title font-bold" style={{ color: biasColor }}>
              {labelShort(confluence.label)}
            </span>
            <span className="font-mono text-body" style={{ color: biasColor }}>
              {confluence.bias > 0 ? '+' : ''}
              {Math.round(confluence.bias)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-label text-white/55">
            <span>
              {confluence.directional > 0 && confluence.direction
                ? `${confluence.agreeing} of ${confluence.directional} timeframes ${confluence.direction === 'BULLISH' ? 'bullish' : 'bearish'}`
                : 'No directional agreement'}
            </span>
            <span className="font-mono">{confluence.agreement}% agreement</span>
          </div>
        </div>

        {/* Weighted bias bar, centred at zero */}
        <div className="mt-3">
          <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
            <div
              className="absolute top-0 h-full transition-all duration-700"
              style={{
                backgroundColor: biasColor,
                width: `${Math.abs(confluence.bias) / 2}%`,
                left: confluence.bias >= 0 ? '50%' : `${50 - Math.abs(confluence.bias) / 2}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-micro text-white/35">
            <span>Strong sell</span>
            <span>Neutral</span>
            <span>Strong buy</span>
          </div>
        </div>
      </div>
    </div>
  );
};
