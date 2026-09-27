import React, { useState, useEffect } from 'react';
import { useCompassSignal } from '../hooks/useCompassSignal';
import { CompassDisplay } from '../components/compass/CompassDisplay';
import { MarketSummary } from '../components/compass/MarketSummary';
import { ReversalPanel } from '../components/compass/ReversalPanel';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { RealtimeOrderFlow } from '../components/trading/RealtimeOrderFlow';
import { CollapsibleSection } from '../components/common/CollapsibleSection';
import { DEFAULT_SYMBOL, SUPPORTED_ASSETS } from '../types/trading';
import { factorCategoryLabel, factorNameLabel, verdictLabel } from '../lib/labels';
import { cn } from '@/lib/utils';
import { RefreshCw, AlertTriangle } from 'lucide-react';

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
  const factors = compass.live?.factors || [];
  const direction = compass.official?.direction || compass.live?.rawDirection || 'NEUTRAL';

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
            <span className="text-sm font-black tracking-tight">FlowSense</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {SUPPORTED_ASSETS.map(asset => (
                <button
                  key={asset.symbol}
                  onClick={() => setSelectedAsset(asset.symbol)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-bold transition-all',
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

          <div className="flex items-center gap-4 text-xs">
            <span className="font-mono text-white/80">
              {compass.price > 0
                ? compass.price.toLocaleString(undefined, {
                    minimumFractionDigits: compass.precision,
                    maximumFractionDigits: compass.precision,
                  })
                : '--'}
            </span>
            <button
              onClick={compass.refresh}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 font-semibold transition-all hover:bg-white/[0.06]"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', compass.isLoading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {compass.error && (
        <div className="flex w-full items-center gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm sm:px-8">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="font-bold text-red-200">{ERROR_TITLES[compass.error.kind] || 'Error'}:</span>
          <span className="text-red-200/80">{compass.error.message}</span>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-8">
        {/* Hero: the compass signal */}
        <CompassDisplay
          direction={direction}
          score={compass.official?.score || compass.live?.rawScore || 50}
          confidence={compass.official?.confidence || 0}
          price={compass.price}
          precision={compass.precision}
          timestamp={compass.official?.timestamp || Date.now()}
          dataLabel={compass.dataLabel}
          secondsUntilNextUpdate={compass.secondsUntilNextUpdate}
          minutesSinceLastSignal={compass.minutesSinceLastSignal}
          reason={compass.official?.reason || ''}
          isStale={compass.official?.isStale || false}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ONE consolidated summary, with secondary metrics behind a toggle */}
          <div className="lg:col-span-7">
            <MarketSummary
              data={compass.marketData}
              dataQuality={compass.dataQuality}
              dataLabel={compass.dataLabel}
              marketState={compass.official?.marketRegime || compass.live?.marketRegime || 'UNKNOWN'}
              advancedExtras={
                <ReversalPanel
                  reversalSignal={compass.reversalSignal}
                  srLevels={compass.srLevels}
                  price={compass.price}
                  precision={compass.precision}
                />
              }
            />
          </div>

          {/* Market factors: a verdict and a strength bar per row */}
          <div className="lg:col-span-5">
            <section className="h-full rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-6">
              <h3 className="mb-4 text-sm font-bold text-white">Market factors</h3>

              {factors.length === 0 ? (
                <div className="py-8 text-center text-sm italic text-white/50">
                  {compass.isLoading ? 'Loading market data…' : 'No factors available — waiting for data'}
                </div>
              ) : (
                <div className="space-y-3">
                  {factors.map((factor, index) => {
                    const tone = verdictTone(factor.direction);
                    const strength = Math.max(0, Math.min(100, factor.weight));
                    return (
                      <div
                        key={`${factor.name}-${index}`}
                        className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {factorNameLabel(factor.name)}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-white/40">
                              {factorCategoryLabel(factor.category)}
                            </div>
                          </div>
                          <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold', tone.badge)}>
                            {verdictLabel(factor.direction)}
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${strength}%` }} />
                          </div>
                          <span className="w-8 text-right font-mono text-[10px] text-white/40">{strength}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Secondary detail — collapsed so it does not compete with the compass */}
        <CollapsibleSection title="Technical indicators" subtitle="Oscillators, moving averages, volume and volatility">
          <TechnicalDetailsTable
            oscillators={compass.marketData.oscillators}
            movingAverages={compass.marketData.movingAverages}
            volumeIndicators={compass.marketData.volumeIndicators}
            isLoading={compass.isLoading}
          />
        </CollapsibleSection>

        <CollapsibleSection
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
        </CollapsibleSection>

        <CollapsibleSection title="Signal history" subtitle={`${compass.history.length} published signals`}>
          {compass.history.length === 0 ? (
            <div className="py-8 text-center text-sm italic text-white/50">
              No signals yet — waiting for the first official minute boundary
            </div>
          ) : (
            <div className="space-y-2">
              {compass.history
                .slice(-10)
                .reverse()
                .map((entry, index) => (
                  <div
                    key={`${entry.minuteKey}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-sm"
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
                      <span className="font-mono text-xs text-white/40">{entry.minuteKey}</span>
                    </div>
                    <div className="flex items-center gap-4 font-mono text-xs text-white/50">
                      <span>Score {entry.score}</span>
                      <span>{entry.confidence}%</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Scope note — kept visible because it is a promise, not a detail */}
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">Crypto only, for now</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/70">
            <li>Only Binance USDT pairs are offered, because these are the instruments we can source honestly end to end</li>
            <li>Stocks, forex and indices are a later addition — they need a data source that also provides real order flow</li>
            <li>Cross-market feeds such as DXY, VIX and yields are not part of this scope</li>
          </ul>
          <p className="mt-3 text-xs text-white/50">
            {compass.assetName} ({selectedAsset}) · Data from Binance public REST and WebSocket feeds ·{' '}
            {compass.lastUpdated ? `Last update ${new Date(compass.lastUpdated).toLocaleTimeString()}` : 'Waiting for the first update'}
          </p>
        </section>
      </main>
    </div>
  );
};

export default Index;
