import React, { useState, useEffect } from 'react';
import { useCompassSignal } from '../hooks/useCompassSignal';
import { CompassDisplay } from '../components/compass/CompassDisplay';
import { MarketSummary } from '../components/compass/MarketSummary';
import { ActionPlanningPanel } from '../components/compass/ActionPlanningPanel';
import { ReversalPanel } from '../components/compass/ReversalPanel';
import { AssetSummaryCard } from '../components/trading/AssetSummaryCard';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { SUPPORTED_ASSETS } from '../types/trading';
import { cn } from '@/lib/utils';
import { RefreshCw, AlertTriangle } from 'lucide-react';

const ERROR_TITLES: Record<string, string> = {
  MISSING_API_KEY: 'API key not configured',
  INVALID_API_KEY: 'API key rejected',
  PLAN_LIMIT: 'Symbol not included in your plan',
  RATE_LIMIT: 'Rate limit reached',
  SYMBOL_NOT_FOUND: 'Symbol unavailable',
  NETWORK: 'Network error',
  UPSTREAM: 'Data provider error',
  BUDGET_EXHAUSTED: 'Credit budget reached',
  UNKNOWN: 'Unexpected error',
};

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('EUR/USD');
  const [activeTab, setActiveTab] = useState<'factors' | 'technical' | 'context' | 'history'>('factors');

  const compass = useCompassSignal(selectedAsset);

  useEffect(() => {
    // Reset published signal history display when switching instruments.
    setActiveTab('factors');
  }, [selectedAsset]);

  const factors = compass.live?.factors || [];

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-amber-500/30">
      {/* Header */}
      <header className="w-full border-b border-white/[0.04] bg-[#07080a] px-8 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center flex-wrap gap-2">
          {SUPPORTED_ASSETS.map(asset => (
            <button
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset.symbol)}
              className={cn(
                'flex flex-col items-start px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all',
                selectedAsset === asset.symbol
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)]'
                  : 'bg-white/[0.02] text-white/60 hover:text-white border border-white/[0.04] hover:bg-white/[0.03]'
              )}
            >
              <span className="font-mono">{asset.symbol}</span>
              <span className={cn(
                'text-[8px] font-black uppercase tracking-[0.2em]',
                selectedAsset === asset.symbol ? 'text-black/60' : 'text-white/30'
              )}>
                {asset.category}
                {asset.requiresPaidPlan && ' · PAID PLAN'}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-white/50">DATA:</span>
            <span className={cn(
              'font-black',
              compass.dataLabel === 'LIVE' ? 'text-green-400' :
              compass.dataLabel === 'DELAYED' ? 'text-amber-400' :
              compass.dataLabel === 'UNAVAILABLE' ? 'text-red-500' : 'text-white/60'
            )}>
              {compass.dataLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-white/50">REFRESH IN:</span>
            <span className="text-white/90">{compass.nextRefreshIn}s</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-white/50">PRICE:</span>
            <span className="text-white/90">
              {compass.price > 0 ? compass.price.toLocaleString(undefined, {
                minimumFractionDigits: compass.precision,
                maximumFractionDigits: compass.precision,
              }) : '--'}
            </span>
          </div>
          <button
            onClick={compass.refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', compass.isLoading && 'animate-spin')} />
            REFRESH
          </button>
        </div>
      </header>

      {/* Error banner */}
      {compass.error && (
        <div className="w-full bg-red-500/10 border-b border-red-500/30 px-8 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-red-200 font-bold">{ERROR_TITLES[compass.error.kind] || 'Error'}:</span>
          <span className="text-red-200/80">{compass.error.message}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-grow p-8 max-w-[1920px] w-full mx-auto flex flex-col gap-8">
        {/* Compass Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 flex flex-col">
            <CompassDisplay
              direction={compass.official?.direction || compass.live?.rawDirection || 'NEUTRAL'}
              score={compass.official?.score || compass.live?.rawScore || 50}
              confidence={compass.official?.confidence || 0}
              timestamp={compass.official?.timestamp || Date.now()}
              dataLabel={compass.dataLabel}
              secondsUntilNextUpdate={compass.secondsUntilNextUpdate}
              minutesSinceLastSignal={compass.minutesSinceLastSignal}
              factorSummary={compass.official?.factorSummary || factors.map(f => `${f.name}: ${f.direction}`)}
              isStale={compass.official?.isStale || false}
              reason={compass.official?.reason || ''}
            />
          </div>

          <div className="lg:col-span-7 flex flex-col gap-8">
            <MarketSummary
              marketRegime={compass.official?.marketRegime || 'UNKNOWN'}
              dataQuality={compass.dataQuality.overall}
              dataLabel={compass.dataLabel}
              factorAgreement={compass.live?.factorAgreement || 0}
              price={compass.price}
              timestamp={compass.live?.timestamp || Date.now()}
            />
            <ActionPlanningPanel
              direction={compass.official?.direction || 'NEUTRAL'}
              price={compass.price}
              confidence={compass.official?.confidence || 0}
              marketRegime={compass.official?.marketRegime || 'UNKNOWN'}
              dataQuality={compass.dataQuality.overall}
            />
            <ReversalPanel
              reversalSignal={compass.reversalSignal}
              srLevels={compass.srLevels}
              price={compass.price}
            />
          </div>
        </div>

        {/* Asset Snapshot */}
        <AssetSummaryCard data={compass.marketData} dataQuality={compass.dataQuality} />

        {/* Expandable Details Sections */}
        <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] overflow-hidden">
          <div className="flex flex-wrap border-b border-white/[0.04]">
            {[
              { id: 'factors', label: 'MARKET FACTORS' },
              { id: 'technical', label: 'TECHNICAL DETAILS' },
              { id: 'context', label: 'DATA & CONTEXT' },
              { id: 'history', label: 'SIGNAL HISTORY' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={cn(
                  'flex-1 px-6 py-4 text-xs font-black tracking-wider transition-all border-b-2 min-w-[140px]',
                  activeTab === tab.id
                    ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                    : 'border-transparent text-white/40 hover:text-white/60'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'factors' && (
              <div className="space-y-4">
                <h3 className="text-white font-bold mb-4">Market Factors</h3>
                {factors.length === 0 && (
                  <div className="text-center text-white/50 italic py-8">
                    {compass.isLoading ? 'Loading market data…' : 'No factors available — waiting for data'}
                  </div>
                )}
                {factors.map((factor, index) => (
                  <div key={`${factor.name}-${index}`} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <div className="flex items-center gap-4">
                      <span className="text-white/50 text-xs font-black uppercase">{factor.category}</span>
                      <span className="text-white font-mono">{factor.name}</span>
                      <span className="text-white/40 text-xs font-mono hidden md:inline">{factor.value}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={cn(
                        'font-mono font-bold text-sm',
                        factor.direction === 'BULLISH' ? 'text-green-400' :
                        factor.direction === 'BEARISH' ? 'text-red-500' : 'text-amber-400'
                      )}>
                        {factor.direction}
                      </span>
                      <span className="text-white/50 font-mono text-sm">{factor.weight}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'technical' && (
              <TechnicalDetailsTable
                oscillators={compass.marketData.oscillators}
                movingAverages={compass.marketData.movingAverages}
                volumeIndicators={compass.marketData.volumeIndicators}
                isLoading={compass.isLoading}
              />
            )}

            {activeTab === 'context' && (
              <div className="space-y-4">
                <h3 className="text-white font-bold mb-4">Data & Context</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-bold uppercase">Data Source</span>
                    <div className="text-white font-mono mt-2">Twelve Data (REST polling)</div>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-bold uppercase">Data Quality</span>
                    <div className={cn(
                      'font-mono mt-2',
                      compass.dataQuality.overall >= 80 ? 'text-green-400' :
                      compass.dataQuality.overall >= 60 ? 'text-amber-400' : 'text-red-500'
                    )}>
                      {compass.dataQuality.overall}%
                    </div>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-bold uppercase">Available Factors</span>
                    <div className="text-white font-mono mt-2">
                      {compass.live?.availableFactors || 0} / {compass.live?.totalFactors || 0}
                    </div>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-bold uppercase">Last Update</span>
                    <div className="text-white font-mono mt-2">
                      {compass.lastUpdated ? new Date(compass.lastUpdated).toLocaleTimeString() : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                  <span className="text-white/50 text-xs font-bold uppercase">Instrument</span>
                  <div className="text-white font-mono mt-2">{compass.assetName} ({selectedAsset})</div>
                </div>

                <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
                  <span className="text-amber-400 text-xs font-bold uppercase">Not available on this data plan</span>
                  <ul className="text-white/70 text-sm mt-2 space-y-1 list-disc list-inside">
                    <li>Order book depth and buy/sell tape (Twelve Data does not expose these for stocks, forex or indices)</li>
                    <li>Real-time WebSocket streaming (REST polling only)</li>
                    <li>Cross-market feeds such as DXY, VIX and yields</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4">
                <h3 className="text-white font-bold mb-4">Signal History</h3>
                {compass.history.length === 0 ? (
                  <div className="text-center text-white/50 italic py-8">
                    No signals yet — waiting for first official minute boundary
                  </div>
                ) : (
                  <div className="space-y-2">
                    {compass.history.slice(-10).reverse().map((entry, index) => (
                      <div key={`${entry.minuteKey}-${index}`} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                        <div className="flex items-center gap-4">
                          <span className={cn(
                            'font-mono font-bold text-sm',
                            entry.direction === 'STRONG_BUY' || entry.direction === 'BUY' ? 'text-green-400' :
                            entry.direction === 'STRONG_SELL' || entry.direction === 'SELL' ? 'text-red-500' : 'text-amber-400'
                          )}>
                            {entry.direction.replace('_', ' ')}
                          </span>
                          <span className="text-white/50 font-mono text-sm">{entry.minuteKey}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white/50 font-mono text-sm">{entry.score}</span>
                          <span className="text-white/50 font-mono text-sm">{entry.confidence}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
