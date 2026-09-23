import { useState, useEffect, useRef } from 'react';
import { IndicatorSummary } from '../types/trading';

export type CompassVerdict =
  | 'STRONG_BUY'
  | 'BUY'
  | 'NEUTRAL'
  | 'SELL'
  | 'STRONG_SELL';

export interface CompassHysteresisState {
  displayedScore: number;
  displayedVerdict: CompassVerdict;
  rawScore: number;
  rawVerdict: CompassVerdict;
  confirmationCount: number;
  candidateVerdict: CompassVerdict | null;
  totalIndicators: number;
  agreementCount: number;
  cyclesSinceLastFlip: number;
}

export const useCompassHysteresis = (
  summary: IndicatorSummary,
  confirmationThreshold: number = 3
): CompassHysteresisState => {
  const [state, setState] = useState<CompassHysteresisState>({
    displayedScore: 50,
    displayedVerdict: 'NEUTRAL',
    rawScore: 50,
    rawVerdict: 'NEUTRAL',
    confirmationCount: 0,
    candidateVerdict: null,
    totalIndicators: 0,
    agreementCount: 0,
    cyclesSinceLastFlip: 0,
  });

  const lastVerdictRef = useRef<CompassVerdict>(state.displayedVerdict);
  const cyclesSinceLastFlipRef = useRef<number>(state.cyclesSinceLastFlip);
  const confirmationCountRef = useRef<number>(state.confirmationCount);
  const candidateVerdictRef = useRef<CompassVerdict | null>(
    state.candidateVerdict
  );

  const scoreToVerdict = (score: number): CompassVerdict => {
    if (score >= 75) return 'STRONG_BUY';
    if (score >= 55) return 'BUY';
    if (score <= 25) return 'STRONG_SELL';
    if (score <= 45) return 'SELL';
    return 'NEUTRAL';
  };

  const rawScore = Number.isFinite(summary.score) ? summary.score : 50;
  const rawVerdict = scoreToVerdict(rawScore);

  useEffect(() => {
    const totalIndicators = 4;
    let agreementCount = 0;

    if (summary.buyCount >= summary.sellCount) {
      agreementCount += 2;
    }

    if (summary.sellCount >= summary.buyCount) {
      agreementCount += 2;
    }

    agreementCount = Math.min(agreementCount, totalIndicators);

    setState((prev) => ({
      ...prev,
      rawScore,
      rawVerdict,
      totalIndicators,
      agreementCount,
    }));
  }, [summary, rawScore, rawVerdict]);

  useEffect(() => {
    if (rawVerdict !== lastVerdictRef.current) {
      if (candidateVerdictRef.current !== rawVerdict) {
        candidateVerdictRef.current = rawVerdict;
        confirmationCountRef.current = 1;
      } else {
        confirmationCountRef.current += 1;
      }
    } else {
      candidateVerdictRef.current = null;
      confirmationCountRef.current = 0;
    }

    const hasEnoughConfirmation =
      confirmationCountRef.current >= confirmationThreshold &&
      candidateVerdictRef.current !== null &&
      candidateVerdictRef.current !== lastVerdictRef.current;

    if (hasEnoughConfirmation) {
      const newVerdict = candidateVerdictRef.current;

      setState((prev) => ({
        ...prev,
        displayedScore: rawScore,
        displayedVerdict: newVerdict,
        confirmationCount: 0,
        candidateVerdict: null,
        cyclesSinceLastFlip: 0,
      }));

      lastVerdictRef.current = newVerdict;
      candidateVerdictRef.current = null;
      confirmationCountRef.current = 0;
      cyclesSinceLastFlipRef.current = 0;
    } else {
      if (candidateVerdictRef.current !== null) {
        cyclesSinceLastFlipRef.current += 1;
      }

      setState((prev) => ({
        ...prev,
        displayedScore: rawScore,
        confirmationCount: confirmationCountRef.current,
        candidateVerdict: candidateVerdictRef.current,
        cyclesSinceLastFlip: cyclesSinceLastFlipRef.current,
      }));
    }
  }, [rawScore, rawVerdict, confirmationThreshold]);

  useEffect(() => {
    lastVerdictRef.current = state.displayedVerdict;
  }, [state.displayedVerdict]);

  return state;
};