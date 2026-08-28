import { useState, useEffect, useRef, useCallback } from 'react';
import { IndicatorSummary } from '../types/trading';

export type CompassVerdict = 'STRONG_SELL' | 'SELL' | 'NEUTRAL' | 'BUY' | 'STRONG_BUY';

export interface CompassHysteresisState {
  // What the UI renders (only changes after persistence met)
  displayedVerdict: CompassVerdict;
  displayedScore: number;          // -100..+100 smoothed, what the needle uses
  
  // DEBUG VALUES — exposed for the debug label
  rawVerdict: CompassVerdict;       // The instantaneous candidate
  rawScore: number;                // -100..+100 raw
  
  // Internal counters
  confirmationCount: number;       // 0..5
  candidateVerdict: CompassVerdict | null;
  candidateScore: number;
  cyclesSinceLastFlip: number;
  totalSignals: number;
  
  // Layers of agreement (for the 9-of-12 STRONG rule)
  agreementCount: number;          // how many of 12 indicators agree
  totalIndicators: number;
}

const REQUIRED_CONFIRMATIONS = 5;       // #2: 5 consecutive cycles
const STRONG_AGREEMENT_MIN = 9;          // #3: 9 of 12 must agree
const STRONG_AGREEMENT_TOTAL = 12;       // #3: out of 12
const PLAIN_AGREEMENT_MIN = 5;           // 5 of 12 for plain BUY/SELL

const VERDICT_THRESHOLDS = {
  STRONG_SELL: -70,
  SELL: -25,
  NEUTRAL_LOW: -10,
  NEUTRAL_HIGH: 10,
  BUY: 25,
  STRONG_BUY: 70,
};

function classifyByScoreAndAgreement(
  score: number,
  agreementCount: number
): CompassVerdict {
  // #3: STRONG only if ≥9 of 12 agree
  if (score <= VERDICT_THRESHOLDS.STRONG_SELL && agreementCount >= STRONG_AGREEMENT_MIN) {
    return 'STRONG_SELL';
  }
  if (score >= VERDICT_THRESHOLDS.STRONG_BUY && agreementCount >= STRONG_AGREEMENT_MIN) {
    return 'STRONG_BUY';
  }
  if (score <= VERDICT_THRESHOLDS.SELL && agreementCount >= PLAIN_AGREEMENT_MIN) {
    return 'SELL';
  }
  if (score >= VERDICT_THRESHOLDS.BUY && agreementCount >= PLAIN_AGREEMENT_MIN) {
    return 'BUY';
  }
  return 'NEUTRAL';
}

/**
 * Converts an IndicatorSummary (0..100) into a -100..+100 score
 * AND counts how many of the 12+ underlying indicators actually agree
 * with the dominant direction.
 */
function summaryToScoreAndAgreement(
  summary: IndicatorSummary
): { score: number; agreementCount: number; totalIndicators: number } {
  // score 0..100 → -100..+100 (50 = neutral)
  const score = (summary.score - 50) * 2;
  
  // Count agreement — the total weight in the summary IS the total indicators
  const totalIndicators = summary.buyCount + summary.sellCount + summary.neutralCount;
  
  // Agreement = max(buy, sell) — i.e. how many indicators are on the dominant side
  const agreementCount = Math.max(summary.buyCount, summary.sellCount);
  
  return { score, agreementCount, totalIndicators };
}

export const useCompassHysteresis = (
  rawSummary: IndicatorSummary,
  smoothingFactor: number = 0.3
): CompassHysteresisState => {
  const [state, setState] = useState<CompassHysteresisState>({
    displayedVerdict: 'NEUTRAL',
    displayedScore: 0,
    rawVerdict: 'NEUTRAL',
    rawScore: 0,
    confirmationCount: 0,
    candidateVerdict: null,
    candidateScore: 0,
    cyclesSinceLastFlip: 0,
    totalSignals: 0,
    agreementCount: 0,
    totalIndicators: 0,
  });
  
  // Refs hold the live values between renders so the smoothing EMA
  // can keep running without depending on state.
  const smoothedScoreRef = useRef<number>(0);
  const candidateRef = useRef<CompassVerdict | null>(null);
  const candidateScoreRef = useRef<number>(0);
  const confirmationCountRef = useRef<number>(0);
  const lastFlipCycleRef = useRef<number>(0);
  const totalCyclesRef = useRef<number>(0);

  const recompute = useCallback(() => {
    const { score: rawScore, agreementCount, totalIndicators } = 
      summaryToScoreAndAgreement(rawSummary);
    
    totalCyclesRef.current += 1;
    
    // 1) Apply EMA smoothing to the SCORE so the needle moves gradually
    const k = smoothingFactor;
    smoothedScoreRef.current = rawScore * k + smoothedScoreRef.current * (1 - k);
    const smoothedScore = smoothedScoreRef.current;
    
    // 2) Classify using the SMOOTHED score + the 9-of-12 rule
    const candidateVerdict = classifyByScoreAndAgreement(smoothedScore, agreementCount);
    
    // 3) Hysteresis gate: only flip after N consecutive confirmations
    if (candidateVerdict === candidateRef.current) {
      // Same candidate — keep counting
      confirmationCountRef.current += 1;
    } else {
      // New candidate (or coming back to current) — reset counter
      candidateRef.current = candidateVerdict;
      candidateScoreRef.current = smoothedScore;
      confirmationCountRef.current = 1;
    }
    
    // The verdict the UI actually displays
    let displayedVerdict: CompassVerdict = state.displayedVerdict;
    let displayedScore: number = state.displayedScore;
    
    if (candidateVerdict === displayedVerdict) {
      // No change needed, but update the displayed score (smoothed)
      displayedScore = smoothedScore;
      // reset candidate since it matches displayed
      candidateRef.current = null;
      confirmationCountRef.current = 0;
    } else if (confirmationCountRef.current >= REQUIRED_CONFIRMATIONS) {
      // PERSISTENCE MET — flip!
      displayedVerdict = candidateVerdict;
      displayedScore = smoothedScore;
      lastFlipCycleRef.current = totalCyclesRef.current;
      candidateRef.current = null;
      confirmationCountRef.current = 0;
    }
    // else: keep displaying the old verdict (gated)
    
    setState({
      displayedVerdict,
      displayedScore,
      rawVerdict: candidateVerdict,
      rawScore,
      confirmationCount: confirmationCountRef.current,
      candidateVerdict: candidateRef.current,
      candidateScore: candidateScoreRef.current,
      cyclesSinceLastFlip: totalCyclesRef.current - lastFlipCycleRef.current,
      totalSignals: totalCyclesRef.current,
      agreementCount,
      totalIndicators,
    });
  }, [rawSummary, smoothingFactor, state.displayedVerdict, state.displayedScore]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  return state;
};