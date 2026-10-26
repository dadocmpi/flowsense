// ============================================
// TECHNICAL METRICS PANEL
// ============================================
// ATR, session VWAP, session high/low and the volume point of control for the
// selected instrument, measured over the current session.
//
// The session boundary is shown explicitly, because a VWAP whose reset time is
// invisible is a number the reader cannot trust.

import React from 'react';
import type { TechnicalMetrics } from '../../core/types';
import type { SessionConfig } from '../../config/compass';
import { formatNumber } from './format';

interface TechnicalMetricsPanelProps {
  metrics: TechnicalMetrics;
  precision: number;
  quote: string;
  session: SessionConfig;
  /** Timeframe the metrics were measured on. */
  timeframe: string;
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-2.5 last:border-0">
      <span className="text-body text-white/50">
        {label}
        {hint && <span className="ml-2 text-micro text-white/30">{hint}</span>}
      </span>
      <span className="font-mono text-body text-white/90">{value}</span>
    </div>
  );
}

const MODE_TEXT: Record<SessionConfig['mode'], string> = {
  RTH: 'regular trading hours',
  FULL: 'full session',
};

export const TechnicalMetricsPanel: React.FC<TechnicalMetricsPanelProps> = ({
  metrics,
  precision,
  quote,
  session,
  timeframe,
}) => {
  const sessionStart = metrics.sessionStart
    ? new Date(metrics.sessionStart).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div>
      <p className="mb-3 text-label text-white/45">
        Measured on {timeframe} candles over the current {MODE_TEXT[session.mode]}
        {sessionStart ? ` (opened ${sessionStart}, ${session.timezone})` : ''}. VWAP and the point of control reset at
        that boundary.
      </p>

      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <div>
          <Row
            label={`ATR (14)`}
            value={metrics.atr !== null ? `${formatNumber(metrics.atr, precision)} ${quote}` : 'Unavailable'}
            hint="rolling"
          />
          <Row
            label="Session VWAP"
            value={metrics.vwap !== null ? formatNumber(metrics.vwap, precision) : 'Unavailable'}
          />
          <Row
            label="Volume point of control"
            value={metrics.pointOfControl !== null ? formatNumber(metrics.pointOfControl, precision) : 'Unavailable'}
          />
        </div>
        <div>
          <Row
            label="Session high"
            value={metrics.sessionHigh !== null ? formatNumber(metrics.sessionHigh, precision) : 'Unavailable'}
          />
          <Row
            label="Session low"
            value={metrics.sessionLow !== null ? formatNumber(metrics.sessionLow, precision) : 'Unavailable'}
          />
          <Row
            label="Candles in session"
            value={metrics.sessionCandles > 0 ? String(metrics.sessionCandles) : 'Unavailable'}
          />
        </div>
      </div>
    </div>
  );
};
