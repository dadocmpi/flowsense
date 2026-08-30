import { useState, useEffect, useRef } from 'react';
import { ManualDailyZone } from '../types/marketContext';

export const useZoneIntelligence = (selectedSymbol: string) => {
  const [zoneData, setZoneData] = useState({
    zone: null as ManualDailyZone | null,
    distanceToZone: 0,
    isInsideZone: false,
    isApproachingZone: false,
    timeInsideZone: 0,
    zoneTests: 0,
    rejectionAttempts: 0,
    lastEntryTime: null as number | null,
    lastExitTime: null as number | null,
    maxExcursionInside: 0,
    volumeInsideZone: 0,
    deltaInsideZone: 0,
  });

  const zoneRef = useRef<ManualDailyZone | null>(null);
  const insideZoneRef = useRef<boolean>(false);
  const entryTimeRef = useRef<number | null>(null);
  const exitTimeRef = useRef<number | null>(null);
  const zoneTestsRef = useRef<number>(0);
  const rejectionAttemptsRef = useRef<number>(0);
  const maxExcursionInsideRef = useRef<number>(0);
  const volumeInsideZoneRef = useRef<number>(0);
  const deltaInsideZoneRef = useRef<number>(0);
  const lastPriceRef = useRef<number>(0);

  // Load zone from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`tradingConfig_${selectedSymbol}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const zone: ManualDailyZone = {
          id: `manual-${new Date().toISOString().split('T')[0]}`,
          date: new Date().toISOString().split('T')[0],
          direction: parsed.direction === 'SELL' ? 'SELL' : 'BUY',
          zoneMin: parsed.minPrice || 0,
          zoneMax: parsed.maxPrice || 0,
          zoneName: `Daily Zone ${new Date().toISOString().split('T')[0]}`,
          stopLoss: parsed.stopLoss || 0,
          takeProfit: parsed.takeProfit || 0,
          startTime: parsed.startTime || '09:00',
          endTime: parsed.endTime || '17:00',
          notes: '',
          createdAt: Date.now(),
          ema200Aligned: false,
          ema200Conflict: false,
        };
        zoneRef.current = zone;
        setZoneData(prev => ({ ...prev, zone }));
      } catch (e) {
        console.error('Failed to load zone from localStorage:', e);
      }
    }
  }, [selectedSymbol]);

  // Update zone intelligence based on price
  useEffect(() => {
    // This effect will be triggered by price changes in the parent component
    // We'll rely on the parent to pass price updates, but for now we'll use a placeholder
    // In practice, this hook would receive price updates via a callback or subscription
    // For this implementation, we'll assume the price is available via a global state or context
    // Since we don't have that here, we'll return the initial state and update it when price changes
    // are propagated through a different mechanism (to be implemented in the parent)
  }, []); // We'll update this when we have price updates

  // For now, we'll return the initial state and note that price updates need to be handled
  // In a real implementation, we would subscribe to price updates from the data feed
  
  return zoneData;
};