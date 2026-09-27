import React, { useState, useEffect } from 'react';
import { useCompassSignal } from '../hooks/useCompassSignal';
import { CompassDisplay } from '../components/compass/CompassDisplay';
import { MarketSummary } from '../components/compass/MarketSummary';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { RealtimeOrderFlow } from '../components/trading/RealtimeOrderFlow';
import { Section } from '../components/common/Section';
import { DEFAULT_SYMBOL, SUPPORTED_ASSETS } from '../types/trading';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

const ERROR_TITLES: Record<string, string> = {
  GEO_BLOCKED: 'Binance unavailable in this region',
  RATE_LIMIT: 'Binance rate limit reached',
  SYMBOL_NOT_FOUND: 'Symbol unavailable',
  NETWORK: 'Network error',
  UPSTREAM: 'Exchange error',
  UNKNOWN: 'Unexpected error',
};

const DIRECTION_WORDS: Record<string, string> = {
  STRONG_BUY: 'Strong buy',
  BUY: 'Buy',
  NEUTRAL: 'Neutral',
  SELL: 'Sell',
  STRONG_SELL: 'Strong sell',
};

function verdictTone(direction: string): { text: string; bar: string; badge: string } {
  switch (direction) {
    case 'BULLISH':
      return { text: 'text-green-400', bar: 'bg-green-500', badge: 'bg-green-500/10 border-green-500/30 text-green-400' };
    case 'BEARISH':
      return { text: 'text-red-400', bar: 'bg-red-500', badge: 'bg-red-500/10 border-red-500/30 text-red-400' };
    default:
      return { text: 'text-amber-400', bar: 'bg-amber-400', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400' };
  }
}

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState(DEFAULT_SYMBOL);

  const compass = useCompassSignal(selectedAsset);

  useEffect(() => {
    // Nothing to reset now that the secondary panels keep their own state,
    // but the scroll position should not carry over between instruments.
    window.scrollTo({ top: 0 });
  }, [selectedAsset]);

  return (
    <div className="min-h-screen w-full bg-[#050608] font-sans text-white selection:bg-amber-500/30">
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.04] bg-[#07080a]/95 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-title font-black tracking-tight">FlowSense</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {SUPPORTED_ASSETS.map(asset => (
                <button
                  key={asset.symbol}
                  onClick={() => setSelectedAsset(asset.symbol)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-label font-bold transition-all',
                    selectedAsset === asset.symbol
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)]'
                      : 'border border-white/[0.04] bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white'
                  )}
                >
                  <span className="font-mono">{asset.symbol.replace('/USDT', '')}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-label">
            <span className="font-mono text-data font-bold text-white/90">
              {compass.price > 0
                ? compass.price.toLocaleString(undefined, {
                    minimumFractionDigits: compass.precision,
                    maximumFractionDigits: compass.precision,
                  })
                : '--'}
            </span>
          </div>
        </div>
      </header>

      {compass.error && (
        <div className="flex w-full items-center gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-body sm:px-8">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="font-bold text-red-200">{ERROR_TITLES[compass.error.kind] || 'Error'}:</span>
          <span className="text-red-200/80">{compass.error.message}</span>
        </div>
      )}

      {/* A dropped feed must never read as a quiet market. */}
      {compass.streamStatus !== 'LIVE' && !compass.error && (
        <div className="flex w-full items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-label sm:px-8">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
          <span className="font-semibold text-amber-200">
            {compass.streamStatus === 'OFFLINE' ? 'Market feed offline' : 'Reconnecting to the market feed'} — showing the last data received
          </span>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-panel p-panel sm:gap-block sm:p-panel-lg">
        {/* Hero: the compass signal. It is the single source of truth — every
            element is derived from the live aggregated score, which now moves
            with every trade rather than once a minute. */}
        <CompassDisplay
          score={compass.live?.rawScore ?? compass.official?.score ?? 50}
          dataQuality={compass.dataQuality.overall}
          timestamp={compass.official?.timestamp || Date.now()}
          streamStatus={compass.streamStatus}
          isStale={compass.official?.isStale || false}
        />

        {/* Market summary — every metric renders expanded; the reversal logic
            still feeds the compass internally. */}
        <MarketSummary
          data={compass.marketData}
          marketState={compass.official?.marketRegime || compass.live?.marketRegime || 'UNKNOWN'}
          advancedExtras={
            <p className="text-body text-white/60">
              {compass.dataQuality.metrics.source === 'BINANCE'
                ? 'Binance public WebSocket stream'
                : 'Unavailable — no feed'}
            </p>
          }
        />

        {/* Secondary detail — always expanded so no data is hidden */}
        <Section title="Technical indicators" subtitle="Oscillators, moving averages, volume and volatility">
          <TechnicalDetailsTable
            oscillators={compass.marketData.oscillators}
            movingAverages={compass.marketData.movingAverages}
            volumeIndicators={compass.marketData.volumeIndicators}
            isLoading={compass.isLoading}
          />
        </Section>

        <Section
          title="Real-time order flow"
          subtitle={
            compass.orderFlow.isLive
              ? 'Live from Binance'
              : `Binance stream: ${compass.orderFlow.streamStatus.toLowerCase()}`
          }
        >
          <RealtimeOrderFlow
            orderFlow={compass.orderFlow}
            precision={compass.precision}
            quote={compass.marketData.currency}
          />
        </Section>

        <Section title="Signal history" subtitle="Recent published compass signals">
          {compass.history.length === 0 ? (
            <div className="py-8 text-center text-body italic text-white/50">
              No signals yet — the compass publishes an official read at each minute boundary
            </div>
          ) : (
            <div className="space-y-2">
              {compass.history
                .slice(-10)
                .reverse()
                .map((entry, index) => (
                  <div
                    key={`${entry.minuteKey}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-body"
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn('font-semibold', verdictTone(
                        entry.direction === 'STRONG_BUY' || entry.direction === 'BUY'
                          ? 'BULLISH'
                          : entry.direction === 'STRONG_SELL' || entry.direction === 'SELL'
                          ? 'BEARISH'
                          : 'NEUTRAL'
                      ).text)}>
                        {DIRECTION_WORDS[entry.direction] ?? entry.direction}
                      </span>
                      <span className="font-mono text-label text-white/40">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-mono text-label text-white/50">
                      <span>Score {entry.score}</span>
                      <span>{entry.confidence}%</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Section>
      </main>
    </div>
  );
};

export default Index;
