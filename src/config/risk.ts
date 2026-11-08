// ============================================
// RISK PANEL DEFAULTS
// ============================================
// Editable starting values for the Risk panel. NOTHING here is a trading firm's
// rule: these are convenience defaults for the inputs, and every one is
// user-editable in the panel.

export interface RiskConfig {
  /** Units per 1.00 lot. XAUUSD (gold) is 100 troy oz per standard lot. */
  contractMultiplier: number;
  /** Instrument tick size, for the stop-distance step. */
  tickSize: number;
  /** Suggested risk per trade, as a percentage. Editable, not a rule. */
  defaultRiskPercent: number;
  /** Suggested daily loss limit, as a percentage. Editable, not a rule. */
  defaultDailyLossLimitPercent: number;
  /** Suggested max drawdown, as a percentage. Editable, not a rule. */
  defaultMaxDrawdownPercent: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  // Confirm/edit this per instrument. 100 oz per 1.00 lot for XAUUSD.
  contractMultiplier: 100,
  tickSize: 0.01,
  defaultRiskPercent: 1,
  defaultDailyLossLimitPercent: 3,
  defaultMaxDrawdownPercent: 6,
};
