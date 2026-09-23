import { useState, useEffect, useRef } from 'react';
import { Timeframe } from '../types/trading';

export interface TimeframeData {
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: number; // 0-100
  confidence: number; // 0-100
}

export interface MultiTimeframeResult {
  timeframes: TimeframeData[];
  weightedScore: number; // -100 to 100
  consensus: 'BUY' | 'SELL' | 'NEUTRAL';
}

export const useMultiTimeframe = (symbol: string, currentPrice: number) => {
  const [result, setResult] = useState<MultiTimeframeResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const timeframesRef = useRef<Timeframe[]>(['1m', '5m', '15m', '1h', '4h', '1d']);
  
  useEffect(() => {
    if (!currentPrice || currentPrice <= 0) {
      setIsLoading(false);
      return;
    }
    
    const calculateMultiTimeframe = () => {
      try {
        // In a real implementation, this would fetch data for each timeframe
        // For now, we'll simulate based on current price and some randomness
        const timeframesData: TimeframeData[] = timeframesRef.current.map(tf => {
          // Simulate different timeframe behaviors
          // Shorter timeframes more volatile, longer more stable
          const volatilityFactor = {
            '1m': 0.9,
            '5m': 0.7,
            '15m': 0.5,
            '1h': 0.3,
            '4h': 0.2,
            '1d': 0.1
          }[tf] || 0.5;
          
          // Generate a signal based on price position and some noise
          const noise = (Math.random() - 0.5) * volatilityFactor * 20;
          const baseSignal = 50 + noise; // 0-100 scale
          
          let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
          let strength = Math.abs(baseSignal - 50) * 2; // 0-100
          let confidence = 70 + Math.random() * 30; // 70-100
          
          if (baseSignal > 55) {
            direction = 'BUY';
          } else if (baseSignal < 45) {
            direction = 'SELL';
          }
          
          // Adjust for timeframe reliability
          if (tf === '1m' || tf === '5m') {
            confidence *= 0.8; // Lower confidence for very short term
          } else if (tf === '4h' || tf === '1d') {
            confidence *= 1.1; // Higher confidence for longer term
            confidence = Math.min(100, confidence);
          }
          
          return {
            timeframe: tf,
            direction,
            strength: Math.round(strength),
            confidence: Math.round(confidence)
          };
        });
        
        // Calculate weighted score (-100 to 100)
        // Weight longer timeframes more heavily
        const weights: Record<Timeframe, number> = {
          '1m': 0.05,
          '5m': 0.10,
          '15m': 0.15,
          '1h': 0.20,
          '4h': 0.25,
          '1d': 0.25
        };
        
        let weightedSum = 0;
        let totalWeight = 0;
        
        timeframesData.forEach(tfData => {
          const weight = weights[tfData.timeframe] || 0;
          let tfScore = 0;
          
          if (tfData.direction === 'BUY') {
            tfScore = tfData.strength;
          } else if (tfData.direction === 'SELL') {
            tfScore = -tfData.strength;
          }
          
          weightedSum += tfScore * weight;
          totalWeight += weight;
        });
        
        const weightedScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
        
        // Determine consensus
        let consensus: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
        if (weightedScore >= 20) {
          consensus = 'BUY';
        } else if (weightedScore <= -20) {
          consensus = 'SELL';
        }
        
        setResult({
          timeframes: timeframesData,
          weightedScore,
          consensus
        });
      } catch (error) {
        console.error('Error calculating multi-timeframe data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    calculateMultiTimeframe();
    
    // Update every 30 seconds
    const interval = setInterval(calculateMultiTimeframe, 30000);
    
    return () => clearInterval(interval);
  }, [symbol, currentPrice]);
  
  return result;
};