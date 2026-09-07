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
  const candidateVerdictRef = useRef<CompassVerdict | null>(state.candidateVerdict);

  // Convert summary to score and verdict
  const scoreToVerdict = (score: number): CompassVerdict => {
    if (score >= 75) return 'STRONG_BUY';
    if (score >= 55) return 'BUY';
    if (score <= 25) return 'STRONG_SELL';
    if (score <= 45) return 'SELL';
    return 'NEUTRAL';
  };

  const rawScore = summary.score;
  const rawVerdict = scoreToVerdict(rawScore);

  useEffect(() => {
    // Calculate agreement count (how many indicators agree with the raw verdict)
    // This is a simplified version - in reality, we'd need the individual indicator scores
    const totalIndicators = 4; // oscillators, ma, orderFlow, mtf
    let agreementCount = 0;
    
    // Simplified agreement calculation
    if (summary.buyCount >= summary.sellCount) agreementCount += 2;
    if (summary.sellCount >= summary.buyCount) agreementCount += 2;
    agreementCount = Math.min(agreementCount, totalIndicators);
    
    // Update state with raw values
    setState(prev => ({
      ...prev,
      rawScore,
      rawVerdict,
      totalIndicators,
      agreementCount,
    }));
  }, [summary]);

  useEffect(() => {
    // Hysteresis logic: require confirmation before changing displayed verdict
    if (rawVerdict !== lastVerdictRef.current) {
      // New raw verdict detected
      candidateVerdictRef.current = rawVerdict;
      confirmationCountRef.current = 1;
    } else if (rawVerdict === lastVerdictRef.current && candidateVerdictRef.current !== null) {
      // Same as last verdict, increment confirmation if we had a candidate
      if (candidateVerdictRef.current === rawVerdict) {
        confirmationCountRef.current += 1;
      }
    }

    // Check if we have enough confirmation to flip
    if (confirmationCountRef.current >= confirmationThreshold && 
        candidateVerdictRef.current !== null && 
        candidateVerdictRef.current !== lastVerdictRef.current) {
      
      // Flip the displayed verdict
      const newVerdict = candidateVerdictRef.current;
      setState(prev => ({
        ...prev,
        displayedScore: rawScore,
        displayedVerdict: newVerdict,
        confirmationCount: 0,
        candidateVerdict: null,
      }));
      
      lastVerdictRef.current = newVerdict;
      cyclesSinceLastFlipRef.current = 0;
    } else {
      // Update displayed score but keep verdict if not confirmed
      setState(prev => ({
        ...prev,
        displayedScore: rawScore,
        confirmationCount: confirmationCountRef.current,
        candidateVertict: candidateVerdictRef.current,
      }));
      
      // Increment cycles since last flip
      if (candidateVerdictRef.current !== lastVerdictRef.current) {
        cyclesSinceLastFlipRef.current += 1;
        setState(prev => ({
          ...prev,
          cyclesSinceLastFlip: cyclesSinceLastFlipRef.current,
        }));
      }
    }
  }, [rawScore, rawVerdict, confirmationThreshold]);

  // Update lastVerdictRef when displayed verdict actually changes
  useEffect(() => {
    lastVerdictRef.current = state.displayedVerdict;
  }, [state.displayedVerdict]);

  return state;
};