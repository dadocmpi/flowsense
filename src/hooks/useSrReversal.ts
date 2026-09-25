import { useState, useEffect, useMemo } from 'react';
import { useRefinedTradingData } from './useRefinedTradingData';
import { useMultiTimeframe } from './useMultiTimeframe';
import { useMarketContextEngine } from './useMarketContextEngine';
import { 
  SRLevel, 
  ReversalState, 
  ReversalSignal, 
  SRReversalFactors,
  SRDirection,
  SRType
} from '../types/srReversal';
import { FactorContribution } from '../types/compassEngine';

export const useSrReversal = (): SRReversalFactors => {
  const tradingData = useRefinedTradingData();
  const mtfResult = useMultiTimeframe('PAXGUSDT', tradingData.price); // symbol might need to be dynamic
  const marketContext = useMarketContextEngine(tradingData);

  const [srLevels, setSrLevels] = useState<SRLevel[]>([]);
  const [reversalSignal, setReversalSignal] = useState<ReversalSignal | null>(null);

  // Memoized computation of SR levels and reversal signal
  const srReversalData = useMemo(() => {
    if (!tradingData.price || tradingData.price <= 0) {
      return {
        factors: [],
        reversalSignal: null,
        srLevels: []
      };
    }

    // 1. Identify support/resistance levels
    const levels: SRLevel[] = [];

    // We'll add levels based on available data from tradingData and marketContext
    // Since we don't have historical candle data, we'll use what we can

    // Example: Previous session high and low
    if (tradingData.session) {
      const sessionHigh = tradingData.session.high;
      const sessionLow = tradingData.session.low;

      // Session high as resistance
      levels.push({
        id: `session_high_${Date.now()}`,
        type: 'PREV_SESSION_HIGH',
        direction: 'RESISTANCE',
        priceLow: sessionHigh,
        priceHigh: sessionHigh,
        strength: 80,
        timeframe: '1d',
        testCount: 0, // we don't have history to count tests
        freshness: 100, // assuming it's fresh
        distanceFromPrice: Math.abs(tradingData.price - sessionHigh),
        pricePosition: tradingData.price > sessionHigh ? 'ABOVE' : tradingData.price < sessionHigh ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING', // we'll compute this below
        invalidationLevel: sessionHigh * 1.005, // example: 0.5% above for invalidation
        confidence: 70,
        dataQuality: tradingData.dataQuality.overall
      });

      // Session low as support
      levels.push({
        id: `session_low_${Date.now()}`,
        type: 'PREV_SESSION_LOW',
        direction: 'SUPPORT',
        priceLow: sessionLow,
        priceHigh: sessionLow,
        strength: 80,
        timeframe: '1d',
        testCount: 0,
        freshness: 100,
        distanceFromPrice: Math.abs(tradingData.price - sessionLow),
        pricePosition: tradingData.price > sessionLow ? 'ABOVE' : tradingData.price < sessionLow ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING',
        invalidationLevel: sessionLow * 0.995, // example: 0.5% below for invalidation
        confidence: 70,
        dataQuality: tradingData.dataQuality.overall
      });
    }

    // Example: Previous day high and low
    if (tradingData.previousDay) {
      const prevDayHigh = tradingData.previousDay.high;
      const prevDayLow = tradingData.previousDay.low;

      levels.push({
        id: `prev_day_high_${Date.now()}`,
        type: 'PREV_DAY_HIGH',
        direction: 'RESISTANCE',
        priceLow: prevDayHigh,
        priceHigh: prevDayHigh,
        strength: 70,
        timeframe: '1d',
        testCount: 0,
        freshness: 80, // less fresh than session
        distanceFromPrice: Math.abs(tradingData.price - prevDayHigh),
        pricePosition: tradingData.price > prevDayHigh ? 'ABOVE' : tradingData.price < prevDayHigh ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING',
        invalidationLevel: prevDayHigh * 1.003,
        confidence: 60,
        dataQuality: tradingData.dataQuality.overall
      });

      levels.push({
        id: `prev_day_low_${Date.now()}`,
        type: 'PREV_DAY_LOW',
        direction: 'SUPPORT',
        priceLow: prevDayLow,
        priceHigh: prevDayLow,
        strength: 70,
        timeframe: '1d',
        testCount: 0,
        freshness: 80,
        distanceFromPrice: Math.abs(tradingData.price - prevDayLow),
        pricePosition: tradingData.price > prevDayLow ? 'ABOVE' : tradingData.price < prevDayLow ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING',
        invalidationLevel: prevDayLow * 0.997,
        confidence: 60,
        dataQuality: tradingData.dataQuality.overall
      });
    }

    // Example: Weekly high and low
    if (tradingData.weekly) {
      const weeklyHigh = tradingData.weekly.high;
      const weeklyLow = tradingData.weekly.low;

      levels.push({
        id: `weekly_high_${Date.now()}`,
        type: 'WEEKLY_HIGH',
        direction: 'RESISTANCE',
        priceLow: weeklyHigh,
        priceHigh: weeklyHigh,
        strength: 90,
        timeframe: '1w',
        testCount: 0,
        freshness: 60,
        distanceFromPrice: Math.abs(tradingData.price - weeklyHigh),
        pricePosition: tradingData.price > weeklyHigh ? 'ABOVE' : tradingData.price < weeklyHigh ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING',
        invalidationLevel: weeklyHigh * 1.002,
        confidence: 80,
        dataQuality: tradingData.dataQuality.overall
      });

      levels.push({
        id: `weekly_low_${Date.now()}`,
        type: 'WEEKLY_LOW',
        direction: 'SUPPORT',
        priceLow: weeklyLow,
        priceHigh: weeklyLow,
        strength: 90,
        timeframe: '1w',
        testCount: 0,
        freshness: 60,
        distanceFromPrice: Math.abs(tradingData.price - weeklyLow),
        pricePosition: tradingData.price > weeklyLow ? 'ABOVE' : tradingData.price < weeklyLow ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING',
        invalidationLevel: weeklyLow * 0.998,
        confidence: 80,
        dataQuality: tradingData.dataQuality.overall
      });
    }

    // Example: Opening range
    if (tradingData.openingRange) {
      const { high: openHigh, low: openLow } = tradingData.openingRange;

      levels.push({
        id: `opening_range_high_${Date.now()}`,
        type: 'OPENING_RANGE_HIGH',
        direction: 'RESISTANCE',
        priceLow: openHigh,
        priceHigh: openHigh,
        strength: 60,
        timeframe: '1d',
        testCount: 0,
        freshness: 90, // very fresh for intraday
        distanceFromPrice: Math.abs(tradingData.price - openHigh),
        pricePosition: tradingData.price > openHigh ? 'ABOVE' : tradingData.price < openHigh ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING',
        invalidationLevel: openHigh * 1.001,
        confidence: 50,
        dataQuality: tradingData.dataQuality.overall
      });

      levels.push({
        id: `opening_range_low_${Date.now()}`,
        type: 'OPENING_RANGE_LOW',
        direction: 'SUPPORT',
        priceLow: openLow,
        priceHigh: openLow,
        strength: 60,
        timeframe: '1d',
        testCount: 0,
        freshness: 90,
        distanceFromPrice: Math.abs(tradingData.price - openLow),
        pricePosition: tradingData.price > openLow ? 'ABOVE' : tradingData.price < openLow ? 'BELOW' : 'INSIDE',
        zoneState: 'APPROACHING',
        invalidationLevel: openLow * 0.999,
        confidence: 50,
        dataQuality: tradingData.dataQuality.overall
      });
    }

    // 2. Update zoneState for each level based on price position and movement
    // We don't have price history to determine if price is approaching, touching, etc.
    // We'll use a simple threshold for now
    const updateZoneState = (level: SRLevel): SRLevel => {
      const { price, priceLow, priceHigh } = tradingData;
      const threshold = 0.001 * price; // 0.1% of price as threshold for touching

      let zoneState = level.zoneState; // keep existing if we can't determine

      if (price >= priceLow - threshold && price <= priceHigh + threshold) {
        // Price is near the zone
        if (price >= priceLow && price <= priceHigh) {
          zoneState = 'INSIDE';
        } else if (price < priceLow) {
          zoneState = 'APPROACHING';
        } else if (price > priceHigh) {
          zoneState = 'APPROACHING';
        }
        // We don't have direction of price movement to determine if touching from above/below
        // So we'll just set to TOUCHING if within threshold
        zoneState = 'TOUCHING';
      } else {
        // Price is not near the zone
        if (price < priceLow) {
          zoneState = 'APPROACHING';
        } else if (price > priceHigh) {
          zoneState = 'APPROACHING';
        } else {
          zoneState = 'APPROACHING'; // default
        }
      }

      // We don't have data to determine REJECTING, BREAKING, RETESTING, INVALIDATED
      // We'll leave those for when we have more data

      return { ...level, zoneState };
    };

    const updatedLevels = levels.map(updateZoneState);

    // 3. Compute factors for the compass engine from SR levels
    const srFactors: FactorContribution[] = [];

    // We'll create a factor for overall SR bias
    let srBuyWeight = 0;
    let srSellWeight = 0;

    updatedLevels.forEach(level => {
      // If price is near a support level, it's bullish; near resistance, bearish
      if (level.direction === 'SUPPORT' && 
          (level.zoneState === 'TOUCHING' || level.zoneState === 'RETESTING' || level.zoneState === 'APPROACHING')) {
        srBuyWeight += level.strength * (level.confidence / 100);
      }
      if (level.direction === 'RESISTANCE' && 
          (level.zoneState === 'TOUCHING' || level.zoneState === 'RETESTING' || level.zoneState === 'APPROACHING')) {
        srSellWeight += level.strength * (level.confidence / 100);
      }
    });

    const totalSrWeight = srBuyWeight + srSellWeight;
    if (totalSrWeight > 0) {
      const srDirection = srBuyWeight > srSellWeight ? 'BULLISH' : srSellWeight > srBuyWeight ? 'BEARISH' : 'NEUTRAL';
      srFactors.push({
        category: 'SUPPORT_RESISTANCE',
        name: 'SR_ZONE_BIAS',
        direction: srDirection,
        weight: Math.min(100, Math.round(totalSrWeight / 2)), // scale down to not dominate
        value: `BUY: ${Math.round(srBuyWeight)} / SELL: ${Math.round(srSellWeight)}`,
        confidence: Math.round((srBuyWeight + srSellWeight) / 2),
      });
    }

    // 4. Compute reversal signal (simplified)
    let reversal: ReversalSignal | null = null;

    // We'll create a very basic reversal signal based on SR factors and price action
    // This is a placeholder and should be enhanced with real data

    // Determine if we are near a support or resistance level
    const nearSupport = updatedLevels.some(l => 
      l.direction === 'SUPPORT' && 
      (l.zoneState === 'TOUCHING' || l.zoneState === 'RETESTING') && 
      l.confidence > 60
    );

    const nearResistance = updatedLevels.some(l => 
      l.direction === 'RESISTANCE' && 
      (l.zoneState === 'TOUCHING' || l.zoneState === 'RETESTING') && 
      l.confidence > 60
    );

    // We don't have data for rejection, absorption, etc. so we'll set to null for now
    if (nearSupport || nearResistance) {
      // We have a potential reversal watch
      const state = nearSupport ? 'BULLISH_REVERSAL_WATCH' : 'BEARISH_REVERSAL_WATCH';
      const reason = nearSupport 
        ? 'Price near support level' 
        : 'Price near resistance level';

      reversal = {
        state,
        reason,
        confidence: 50,
        dataQuality: tradingData.dataQuality.overall,
        timestamp: Date.now(),
        price: tradingData.price,
        previousDirection: 'NEUTRAL', // we don't have previous direction from compass
        currentDirection: nearSupport ? 'BULLISH' : 'BEARISH',
        directionChangeReason: reason,
        orderFlowConfirmation: {
          available: false,
          bullishPressure: 0,
          bearishPressure: 0,
          delta: 0,
          absorption: false,
          exhaustion: false
        },
        timeframeAgreement: {
          aligned: [],
          conflicting: [],
          unavailable: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
        invalidation: {
          level: nearSupport ? 
            updatedLevels.find(l => l.direction === 'SUPPORT' && l.zoneState === 'TOUCHING')?.invalidationLevel || 0 :
            updatedLevels.find(l => l.direction === 'RESISTANCE' && l.zoneState === 'TOUCHING')?.invalidationLevel || 0,
          distance: 0
        },
        riskReward: {
          target: 0,
          stop: 0,
          ratio: 0
        }
      };
    }

    // 5. Create factors from reversal signal (if any)
    if (reversal) {
      const reversalFactor: FactorContribution = {
        category: 'REVERSAL',
        name: 'REVERSAL_SIGNAL',
        direction: reversal.currentDirection === 'BULLISH' ? 'BULLISH' : 'BEARISH',
        weight: Math.round(reversal.confidence / 2), // scale down
        value: `${reversal.state} (${reversal.confidence}%)`,
        confidence: reversal.confidence
      };
      srFactors.push(reversalFactor);
    }

    return {
      factors: srFactors,
      reversalSignal: reversal,
      srLevels: updatedLevels
    };
  }, [tradingData.price, tradingData.dataQuality, tradingData.session, tradingData.previousDay, tradingData.weekly, tradingData.openingRange, mtfResult, marketContext]);

  return srReversalData;
};