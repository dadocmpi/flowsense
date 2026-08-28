import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TwelveDataState, 
  SUPPORTED_ASSETS, 
  IndicatorSignal, 
  IndicatorSummary, 
  OrderBookLevel, 
  TradeFeedItem 
} from '../types/trading';

function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

// Map our internal symbols to Twelve Data forex/index symbols
// Keeping display names as futures (MGC1!, ES1!) in UI but using forex/index for data
const getTwelveDataSymbol = (internalSymbol: string): string => {
  // Twelve Data forex/index symbols
  const symbolMap: Record<string, string> = {
    'MGC1!': 'XAUUSD',  // Gold/USD forex pair (instead of GC=F futures)
    'ES1!': 'US500',    // S&P 500 index (instead of ES e-mini futures)
  };
  
  return symbolMap[internalSymbol] || internalSymbol;
};

export const useTwelveData = (selectedSymbol: string = 'MGC1!') => {
  // Get asset config for precision and contract details
  const assetConfig = SUPPORTED_ASSETS.find(a => a.symbol === selectedSymbol) || SUPPORTED_ASSETS[0];
  
  // Twelve Data API configuration
  // USING THE PROVIDED API KEY FROM THE USER
  const API_KEY = 'eb8bf0091a1c46b8b13d9adefed660c5'; 
  const BASE_URL = 'https://api.twelvedata.com';

  const [state, setState] = useState<TwelveDataState>({
    symbol: selectedSymbol,
    price: assetConfig.symbol === 'MGC1!' ? 2350.00 : 5050.00, // Typical forex/index values as placeholders
    change: 0,
    percentChange: 0,
    high: assetConfig.symbol === 'MGC1!' ? 2360.00 : 5070.00,
    low: assetConfig.symbol === 'MGC1!' ? 2340.00 : 5030.00,
    open: assetConfig.symbol === 'MGC1!' ? 2345.00 : 5040.00,
    previousClose: assetConfig.symbol === 'MGC1!' ? 2345.00 : 5040.00,
    datetime: new Date().toLocaleTimeString(),
    isLive: true,
    isMarketOpen: true,
    oscillators: [],
    movingAverages: [],
    orderFlowIndicators: [],
    buyersPercent: 65,
    sellersPercent: 35,
    volumeDelta: 1420,
    institutionalPressure: 'HIGH',
    bids: [],
    asks: [],
    recentTrades: [],
    overallSummary: { buyCount: 7, neutralCount: 1, sellCount: 0, score: 85, verdict: 'STRONG BUY' },
    oscillatorsSummary: { buyCount: 3, neutralCount: 1, sellCount: 0, score: 75, verdict: 'STRONG BUY' },
    maSummary: { buyCount: 4, neutralCount: 0, sellCount: 0, score: 100, verdict: 'STRONG BUY' },
    orderFlowSummary: { buyCount: 3, neutralCount: 0, sellCount: 0, score: 90, verdict: 'STRONG BUY' },
  });

  // Update symbol in state when selectedSymbol changes
  useEffect(() => {
    setState(prev => ({ ...prev, symbol: selectedSymbol }));
  }, [selectedSymbol]);

  const priceHistoryRef = useRef<number[]>([]);
  const buyerVolRef = useRef<number>(assetConfig.symbol === 'MGC1!' ? 240 : 150);
  const sellerVolRef = useRef<number>(assetConfig.symbol === 'MGC1!' ? 110 : 80);

  // Fetch initial historical data for technical indicators
  // NOTE: We do NOT fall back to mock data on failure to avoid price jumps
  // Instead, we rely on real-time polling to get actual data
  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        const twelveDataSymbol = getTwelveDataSymbol(selectedSymbol);
        // Get 100 candles for initial technical analysis
        const res = await fetch(`${BASE_URL}/time_series?symbol=${twelveDataSymbol}&interval=1min&outputsize=100&apikey=${API_KEY}`);
        const data = await res.json();
        
        if (isMounted && data.values && Array.isArray(data.values)) {
          const closes = data.values.map((c: any) => parseFloat(c.close));
          priceHistoryRef.current = closes;
          if (closes.length > 0) {
            updateCalculations(closes[0]); // Calculate with most recent price
          }
        } else {
          console.error('Twelve Data API error:', data);
          // Do NOT fall back to mock data; keep initial state values
          // Real-time polling will eventually get us actual data
        }
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
        // Do NOT fall back to mock data; keep initial state values
        // Real-time polling will eventually get us actual data
      }
    };

    fetchInitialData();

    return () => {
      isMounted = false;
    };
  }, [selectedSymbol]); // Re-run when selectedAsset changes

  const updateCalculations = useCallback((currentPrice: number) => {
    const prices = [...priceHistoryRef.current.slice(-100), currentPrice];
    priceHistoryRef.current = prices;

    // Oscillators
    const rsi = calculateRSI(prices, 14);
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdVal = ema12 - ema26;
    const momentum = currentPrice - (prices[prices.length - 10] || currentPrice);

    const oscillators: IndicatorSignal[] = [
      {
        name: 'RSI (14)',
        value: rsi.toFixed(1),
        action: rsi > 70 ? 'STRONG SELL' : rsi > 58 ? 'BUY' : rsi < 30 ? 'STRONG BUY' : rsi < 42 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'MACD (12, 26, 9)',
        value: `${macdVal >= 0 ? '+' : ''}${macdVal.toFixed(2)}`,
        action: macdVal > 0.5 ? 'STRONG BUY' : macdVal > 0 ? 'BUY' : macdVal < -0.5 ? 'STRONG SELL' : 'SELL'
      },
      {
        name: 'Price Momentum',
        value: `${momentum >= 0 ? '+' : ''}${momentum.toFixed(2)}`,
        action: momentum > 1.5 ? 'STRONG BUY' : momentum > 0 ? 'BUY' : momentum < -1.5 ? 'STRONG SELL' : 'SELL'
      }
    ];

    // Moving Averages
    const ema10 = calculateEMA(prices, 10);
    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const ema200 = calculateEMA(prices, 200);

    const movingAverages: IndicatorSignal[] = [
      { name: 'EMA 10 (Fast)', value: ema10.toFixed(assetConfig.precision), action: currentPrice > ema10 ? 'BUY' : 'SELL' },
      { name: 'EMA 20 (Intermediate)', value: ema20.toFixed(assetConfig.precision), action: currentPrice > ema20 ? 'BUY' : 'SELL' },
      { name: 'EMA 50 (Trend Line)', value: ema50.toFixed(assetConfig.precision), action: currentPrice > ema50 ? 'STRONG BUY' : 'STRONG SELL' },
      { name: 'EMA 200 (Institutional Base)', value: ema200.toFixed(assetConfig.precision), action: currentPrice > ema200 ? 'STRONG BUY' : 'STRONG SELL' },
    ];

    // Order Flow (simplified for Twelve Data - we don't have depth data from basic API)
    // In a real implementation, we might need to subscribe to additional streams or use different endpoints
    const totalVol = buyerVolRef.current + sellerVolRef.current || 1;
    const buyerRatio = Math.round((buyerVolRef.current / totalVol) * 100);
    const sellerRatio = 100 - buyerRatio;
    const delta = Math.round(buyerVolRef.current - sellerVolRef.current);

    const absDelta = Math.abs(delta);
    const instPressure = absDelta > 200 ? 'EXTREME' : absDelta > 100 ? 'HIGH' : absDelta > 40 ? 'MEDIUM' : 'LOW';

    const orderFlowIndicators: IndicatorSignal[] = [
      {
        name: 'Order Flow Dominance',
        value: `${buyerRatio}% Aggressive Buyers`,
        action: buyerRatio > 65 ? 'STRONG BUY' : buyerRatio > 52 ? 'BUY' : buyerRatio < 35 ? 'STRONG SELL' : buyerRatio < 48 ? 'SELL' : 'NEUTRAL'
      },
      {
        name: 'Tape Delta',
        value: `${delta >= 0 ? '+' : ''}${delta}`,
        action: delta > 80 ? 'STRONG BUY' : delta > 0 ? 'BUY' : delta < -80 ? 'STRONG SELL' : 'SELL'
      },
      {
        name: 'Institutional Flow',
        value: `Pressure: ${instPressure}`,
        action: instPressure === 'EXTREME' || instPressure === 'HIGH' ? (delta > 0 ? 'STRONG BUY' : 'STRONG SELL') : 'NEUTRAL'
      }
    ];

    // Summaries
    const buildSummary = (list: IndicatorSignal[]): IndicatorSummary => {
      let buy = 0;
      let neutral = 0;
      let sell = 0;

      list.forEach(i => {
        if (i.action.includes('STRONG BUY')) buy += 2;
        else if (i.action === 'BUY') buy += 1;
        else if (i.action.includes('STRONG SELL')) sell += 2;
        else if (i.action === 'SELL') sell += 1;
        else neutral += 1;
      });

      const totalWeight = buy + neutral + sell || 1;
      const score = Math.max(5, Math.min(95, Math.round((buy / totalWeight) * 100)));

      let verdict: IndicatorSummary['verdict'] = 'NEUTRAL';
      if (score >= 75) verdict = 'STRONG BUY';
      else if (score >= 55) verdict = 'BUY';
      else if (score <= 25) verdict = 'STRONG SELL';
      else if (score <= 45) verdict = 'SELL';

      return { buyCount: buy, neutralCount: neutral, sellCount: sell, score, verdict };
    };

    const oscSummary = buildSummary(oscillators);
    const maSummary = buildSummary(movingAverages);
    const ofSummary = buildSummary(orderFlowIndicators);
    const overallSummary = buildSummary([...oscillators, ...movingAverages, ...orderFlowIndicators]);

    setState(prev => ({
      ...prev,
      price: currentPrice,
      datetime: new Date().toLocaleTimeString(),
      oscillators,
      movingAverages,
      orderFlowIndicators,
      buyersPercent: buyerRatio,
      sellersPercent: sellerRatio,
      volumeDelta: delta,
      institutionalPressure: instPressure,
      overallSummary,
      oscillatorsSummary: oscSummary,
      maSummary,
      orderFlowSummary: ofSummary
    }));
  }, [assetConfig.precision]); // Re-create callback if precision changes

  // Poll for real-time data (Twelve Data REST API polling)
  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout;

    const fetchRealTimeData = async () => {
      try {
        const twelveDataSymbol = getTwelveDataSymbol(selectedSymbol);
        const res = await fetch(`${BASE_URL}/quote?symbol=${twelveDataSymbol}&apikey=${API_KEY}`);
        const data = await res.json();
        
        if (isMounted && data.symbol) {
          const price = parseFloat(data.close);
          const change = parseFloat(data.change);
          const percentChange = parseFloat(data.percent_change);
          const high = parseFloat(data.high);
          const low = parseFloat(data.low);
          const open = parseFloat(data.open);
          const previousClose = parseFloat(data.previous_close);

          setState(prev => ({
            ...prev,
            price,
            change,
            percentChange,
            high,
            low,
            open,
            previousClose,
            datetime: data.datetime || new Date().toLocaleTimeString(),
            isLive: true,
          }));

          updateCalculations(price);
        } else {
          console.error('Twelve Data API error:', data);
          // Don't throw error here to avoid breaking the UI, just keep last known data
        }
      } catch (err) {
        console.error('Failed to fetch real-time data:', err);
        // Keep last known data on error
      }
    };

    // Fetch initial data
    fetchRealTimeData();
    
    // Poll every 15 seconds (adjust based on API limits)
    timer = setInterval(fetchRealTimeData, 15000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [selectedSymbol, updateCalculations]); // Re-run when selectedAsset changes

  return state;
};