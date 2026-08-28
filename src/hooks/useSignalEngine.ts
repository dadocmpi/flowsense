import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SmoothedSignal,
  DisplayVerdict,
  SignalEngineConfig,
  DEFAULT_SIGNAL_CONFIG,
  MacroContext,
  MultiTimeframeResult,
  SetupDetection,
  Timeframe,
} from '../types/signalEngine';
import { TwelveDataState } from '../types/trading';

// ============================================
// LAYER 4: SMOOTHING + HYSTERESIS + CONFIDENCE
// ============================================
//
// This is the ONLY layer the UI consumes directly.
// It takes pre-computed Layer 1/2/3 results and applies:
//   - EMA smoothing of the composite score
//   - Hysteresis gating (N consecutive readings OR N ms to flip verdict)
//   - Confidence from layer-agreement count
//   - Verdict classification with hard thresholds
//

interface LayerInputs {
  macro: MacroContext | null;
  mtf: MultiTimeframeResult | null;
  setup: SetupDetection | null;
  rawMarketData: TwelveDataState;
}

interface SmoothingInternal {
  smoothedScore: number;          // EMA of composite score
  smoothedScoreRaw: number;       // before EMA
  consecutiveReadings: number;    // for hysteresis
  sinceFirstFlipMs: number;       // time since first crossed into new verdict
  candidateVerdict: DisplayVerdict | null;
  currentVerdict: DisplayVerdict;
  prevVerdict: DisplayVerdict;
}

function classifyVerdict(score: number, cfg: SignalEngineConfig): DisplayVerdict {
  if (score <= cfg.strongSellThreshold) return 'STRONG_SELL';
  if (score <= cfg.sellThreshold) return 'SELL';
  if (score >= cfg.strongBuyThreshold) return 'STRONG_BUY';
  if (score >= cfg.buyThreshold) return 'BUY';
  return 'NEUTRAL';
}

function directionFromVerdict(v: DisplayVerdict): 'BUY' | 'SELL' | 'NEUTRAL' {
  if (v === 'STRONG_BUY' || v === 'BUY') return 'BUY';
  if (v === 'STRONG_SELL' || v === 'SELL') return 'SELL';
  return 'NEUTRAL';
}

export const useSignalEngine = (
  inputs: LayerInputs,
  config: SignalEngineConfig = DEFAULT_SIGNAL_CONFIG
) => {
  const [signal, setSignal] = useState<SmoothedSignal | null>(null);
  
  const internalRef = useRef<SmoothingInternal>({
    smoothedScore: 0,
    smoothedScoreRaw: 0,
    consecutiveReadings: 0,
    sinceFirstFlipMs: 0,
    candidateVerdict: null,
    currentVerdict: 'NEUTRAL',
    prevVerdict: 'NEUTRAL',
  });
  
  const lastUpdateRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);

  // ============================================
  // LAYER 4 CORE COMPUTATION
  // ============================================
  const compute = useCallback(() => {
    const now = Date.now();
    const { macro, mtf, setup, rawMarketData } = inputs;
    
    if (!macro || !mtf || !setup) {
      return; // Wait for all layers
    }
    
    // ---- Compute raw composite score ----
    // Weight: macro 30%, mtf 35%, setup 35%
    const macroComponent = macro.score * 0.30;
    const mtfComponent = mtf.weightedScore * 0.35;
    const setupComponent = (setup.triggered ? setup.absorptionScore * (setup.direction === 'BUY' ? 1 : setup.direction === 'SELL' ? -1 : 0) : 0) * 0.35;
    
    let rawComposite = macroComponent + mtfComponent + setupComponent;
    
    // ---- Dampen during quiet zone (high-impact events) ----
    if (macro.quietZoneActive) {
      rawComposite *= 0.4; // Heavy dampening
    }
    
    // ---- Conflict penalty ----
    if (setup.conflictDetected) {
      rawComposite *= 0.5;
    }
    
    // Clamp to -100..+100
    const rawScore = Math.max(-100, Math.min(100, rawComposite));
    
    // ---- EMA Smoothing ----
    const internal = internalRef.current;
    const k = 2 / (config.smoothingPeriod + 1);
    
    if (!initializedRef.current) {
      internal.smoothedScore = rawScore;
      initializedRef.current = true;
    } else {
      internal.smoothedScore = rawScore * k + internal.smoothedScore * (1 - k);
    }
    internal.smoothedScoreRaw = rawScore;
    
    // ---- Layer Alignment Count (for confidence) ----
    let layersAligned = 0;
    const macroAligned = 
      (rawScore > 0 && macro.score > 10) || 
      (rawScore < 0 && macro.score < -10) ||
      Math.abs(macro.score) < 10; // Neutral macro doesn't break alignment
    const mtfAligned = mtf.alignmentMet;
    const setupAligned = setup.triggered && setup.absorptionScore >= config.minAbsorptionScore;
    const regimeAligned = setup.regimeStrength > 15 && setup.volatilityAcceptable;
    
    if (macroAligned) layersAligned++;
    if (mtfAligned) layersAligned++;
    if (setupAligned) layersAligned++;
    if (regimeAligned) layersAligned++;
    
    // ---- Confidence: % of layers aligned + strength of agreement ----
    const baseConfidence = (layersAligned / 4) * 100;
    
    // Boost confidence when setup is triggered
    let confidence = baseConfidence;
    if (setup.triggered) {
      confidence = Math.min(100, confidence + 10);
    }
    
    // Reduce confidence on conflict
    if (setup.conflictDetected) {
      confidence = Math.max(0, confidence - 25);
    }
    
    // Reduce confidence in quiet zone
    if (macro.quietZoneActive) {
      confidence = Math.max(0, confidence - 30);
    }
    
    // ============================================
    // HYSTERESIS GATING
    // ============================================
    // A verdict may only change if:
    //   (a) the smoothed score has been in the new verdict's range for
    //       N consecutive readings, OR
    //   (b) it has stayed there for N milliseconds
    //
    
    const candidateVerdict = classifyVerdict(internal.smoothedScore, config);
    
    if (candidateVerdict !== internal.currentVerdict) {
      // Potential flip — start tracking
      if (internal.candidateVerdict !== candidateVerdict) {
        // New candidate (first time entering this verdict's range)
        internal.candidateVerdict = candidateVerdict;
        internal.consecutiveReadings = 1;
        internal.sinceFirstFlipMs = now;
      } else {
        // Same candidate — accumulate
        internal.consecutiveReadings++;
      }
      
      // Check if persistence met
      const countMet = internal.consecutiveReadings >= config.hysteresisPersistenceCount;
      const timeMet = (now - internal.sinceFirstFlipMs) >= config.hysteresisPersistenceMs;
      
      if (countMet || timeMet) {
        // Flip!
        internal.prevVerdict = internal.currentVerdict;
        internal.currentVerdict = candidateVerdict;
        internal.candidateVerdict = null;
        internal.consecutiveReadings = 0;
        internal.sinceFirstFlipMs = 0;
      }
    } else {
      // Confirmed in current verdict — reset candidate
      internal.candidateVerdict = null;
      internal.consecutiveReadings = 0;
      internal.sinceFirstFlipMs = 0;
    }
    
    // ============================================
    // STRONG-VERDICT GATING
    // STRONG_BUY/SELL only if confidence is high enough
    // ============================================
    let displayVerdict = internal.currentVerdict;
    
    if (displayVerdict === 'STRONG_BUY' || displayVerdict === 'STRONG_SELL') {
      if (confidence < config.minConfidenceForStrong) {
        // Demote to plain BUY/SELL
        displayVerdict = displayVerdict === 'STRONG_BUY' ? 'BUY' : 'SELL';
      }
    }
    
    // ---- Build final output ----
    const smoothed: SmoothedSignal = {
      direction: directionFromVerdict(displayVerdict),
      displayVerdict,
      confidence: Math.round(confidence),
      compositeScore: Math.round(internal.smoothedScore),
      rawScore: Math.round(rawScore),
      macroScore: Math.round(macro.score),
      mtfScore: Math.round(mtf.weightedScore),
      setupScore: setup.triggered ? Math.round(setup.absorptionScore) : 0,
      layersAligned,
      setupTriggered: setup.triggered,
      quietZoneActive: macro.quietZoneActive,
      conflictDetected: setup.conflictDetected,
      confidenceBreakdown: {
        macro: macroAligned ? 100 : 0,
        mtf: mtfAligned ? 100 : 0,
        setup: setupAligned ? 100 : 0,
        regime: regimeAligned ? 100 : 0,
      },
      lastUpdated: now,
      ageMs: now - lastUpdateRef.current,
    };
    
    lastUpdateRef.current = now;
    setSignal(smoothed);
  }, [inputs, config]);

  // Recompute on input changes
  useEffect(() => {
    compute();
  }, [
    inputs.macro?.lastUpdated,
    inputs.mtf?.lastUpdated,
    inputs.setup?.lastUpdated,
    inputs.rawMarketData.price,
    compute,
  ]);

  return signal;
};