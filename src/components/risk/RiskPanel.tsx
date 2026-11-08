// ============================================
// RISK PANEL (client-side, manual inputs)
// ============================================
// A compact, fully client-side risk toolkit: a position-size calculator, a daily
// loss / max-drawdown buffer tracker, and a session clock. Every figure comes
// from numbers the user types — no market data, no vendor, no firm's rules.
//
// It is deliberately separate from the signal logic: nothing here is read by the
// Compass, the Summary or the Entry check, and it can never influence them.

import React, { useEffect, useMemo, useState } from 'react';
import { lossTracker, positionSize, sessionStates } from '../../core/risk';
import { DEFAULT_RISK_CONFIG } from '../../config/risk';
import { Panel } from '../common/Panel';
import { PALETTE } from '../common/palette';
import { formatNumber } from '../compass/format';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
  min?: number;
}

const NumberField: React.FC<NumberFieldProps> = ({ label, value, onChange, step = 1, suffix, min = 0 }) => (
  <label className="flex flex-col gap-0.5">
    <span className="text-micro uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
    <span className="flex items-center rounded-sm border border-line bg-base-2 focus-within:border-accent/60">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={event => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
        className="w-full bg-transparent px-2 py-1 font-mono text-label tabular text-ink outline-none"
      />
      {suffix && <span className="pr-2 text-micro text-ink-subtle">{suffix}</span>}
    </span>
  </label>
);

export const RiskPanel: React.FC = () => {
  const [balance, setBalance] = useState(10_000);
  const [riskPercent, setRiskPercent] = useState(DEFAULT_RISK_CONFIG.defaultRiskPercent);
  const [stopDistance, setStopDistance] = useState(5);
  const [contractMultiplier, setContractMultiplier] = useState(DEFAULT_RISK_CONFIG.contractMultiplier);

  const [dailyLossLimitPercent, setDailyLossLimitPercent] = useState(DEFAULT_RISK_CONFIG.defaultDailyLossLimitPercent);
  const [dailyLossTaken, setDailyLossTaken] = useState(0);
  const [maxDrawdownPercent, setMaxDrawdownPercent] = useState(DEFAULT_RISK_CONFIG.defaultMaxDrawdownPercent);
  const [peakEquity, setPeakEquity] = useState(10_000);
  const [currentEquity, setCurrentEquity] = useState(10_000);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const sizing = useMemo(
    () => positionSize({ balance, riskPercent, stopDistance, contractMultiplier }),
    [balance, riskPercent, stopDistance, contractMultiplier]
  );

  const tracker = useMemo(
    () =>
      lossTracker({
        balance,
        dailyLossLimitPercent,
        dailyLossTaken,
        maxDrawdownPercent,
        peakEquity,
        currentEquity,
      }),
    [balance, dailyLossLimitPercent, dailyLossTaken, maxDrawdownPercent, peakEquity, currentEquity]
  );

  const sessions = useMemo(() => sessionStates(now), [now]);

  return (
    <Panel
      title="Risk"
      badge={<span className="rounded-sm border border-line bg-base-2 px-1.5 py-[1px] text-micro uppercase tracking-[0.06em] text-ink-subtle">Client-side</span>}
      meta={<span>Manual inputs · not advice</span>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Position size */}
        <div className="flex flex-col gap-2">
          <h4 className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Position size</h4>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Balance" value={balance} onChange={setBalance} step={100} suffix="USD" />
            <NumberField label="Risk" value={riskPercent} onChange={setRiskPercent} step={0.1} suffix="%" />
            <NumberField label="Stop" value={stopDistance} onChange={setStopDistance} step={0.01} suffix="pts" />
            <NumberField
              label="Contract ×"
              value={contractMultiplier}
              onChange={setContractMultiplier}
              step={1}
              suffix="oz/lot"
            />
          </div>
          <div className="rounded-sm border border-line bg-base-2 px-2 py-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-micro uppercase tracking-[0.06em] text-ink-subtle">Lot size</span>
              <span className="font-mono text-data font-semibold tabular text-accent">
                {sizing.valid ? formatNumber(sizing.lots, 2) : '--'}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-micro text-ink-subtle">
              <span>Risk amount</span>
              <span className="font-mono tabular text-ink-muted">
                {sizing.valid ? formatNumber(sizing.riskAmount, 2) : '--'}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-micro text-ink-subtle">
              <span>Units</span>
              <span className="font-mono tabular text-ink-muted">
                {sizing.valid ? formatNumber(sizing.units, 3) : '--'}
              </span>
            </div>
            {!sizing.valid && <div className="mt-1 text-micro text-warn">{sizing.reason}</div>}
          </div>
        </div>

        {/* Loss / drawdown buffers */}
        <div className="flex flex-col gap-2">
          <h4 className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Loss &amp; drawdown buffer</h4>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Daily limit" value={dailyLossLimitPercent} onChange={setDailyLossLimitPercent} step={0.5} suffix="%" />
            <NumberField label="Loss taken" value={dailyLossTaken} onChange={setDailyLossTaken} step={10} suffix="USD" />
            <NumberField label="Max drawdown" value={maxDrawdownPercent} onChange={setMaxDrawdownPercent} step={0.5} suffix="%" />
            <NumberField label="Peak equity" value={peakEquity} onChange={setPeakEquity} step={100} suffix="USD" />
            <NumberField label="Current equity" value={currentEquity} onChange={setCurrentEquity} step={100} suffix="USD" />
          </div>
          <Buffer
            label="Daily buffer"
            value={tracker.dailyBuffer}
            share={tracker.dailyUsedShare}
            breached={tracker.dailyBreached}
          />
          <Buffer
            label="Drawdown buffer"
            value={tracker.drawdownBuffer}
            share={tracker.drawdownUsedShare}
            breached={tracker.drawdownBreached}
          />
        </div>

        {/* Session clock */}
        <div className="flex flex-col gap-2">
          <h4 className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Session clock (UTC)</h4>
          <div className="flex flex-col gap-1.5">
            {sessions.map(session => (
              <div key={session.name} className="flex items-center gap-2">
                <span className="w-[68px] text-micro uppercase tracking-[0.06em] text-ink-subtle">{session.name}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-sm border border-line bg-base-2">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${session.progress * 100}%`,
                      background: session.open ? PALETTE.accent : 'transparent',
                      opacity: 0.8,
                    }}
                  />
                </div>
                <span
                  className="w-[46px] text-right font-mono text-micro uppercase"
                  style={{ color: session.open ? PALETTE.accent : PALETTE.inkSubtle }}
                >
                  {session.open ? 'Open' : 'Closed'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-line pt-2 text-micro text-ink-subtle">
            <span>UTC now</span>
            <span className="font-mono tabular text-ink-muted">
              {new Date(now).toISOString().slice(11, 16)}
            </span>
          </div>
          <p className="text-micro text-ink-subtle/80">
            Session windows are the conventional cash hours expressed in UTC. Limits above are yours to set; no firm's
            rules are assumed.
          </p>
        </div>
      </div>
    </Panel>
  );
};

function Buffer({
  label,
  value,
  share,
  breached,
}: {
  label: string;
  value: number;
  share: number;
  breached: boolean;
}) {
  const pct = Math.max(0, Math.min(1, share));
  const color = breached ? PALETTE.neg : pct > 0.75 ? PALETTE.warn : PALETTE.pos;
  return (
    <div>
      <div className="flex items-baseline justify-between text-micro">
        <span className="uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
        <span className="font-mono tabular" style={{ color }}>
          {formatNumber(value, 2)} USD
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-sm border border-line bg-base-2">
        <div className="h-full" style={{ width: `${pct * 100}%`, background: color, opacity: 0.85 }} />
      </div>
    </div>
  );
}
