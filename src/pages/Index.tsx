import React, { useState } from 'react';
import { useRealTradingData } from '../hooks/useRealTradingData';
import { TickerTape } from '../components/trading/TickerTape';
import { TradingViewGauge } from '../components/trading/TradingViewGauge';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { RealOrderBook } from '../components/trading/RealOrderBook';
import { LiveTradeFeed } from '../components/trading/LiveTradeFeed';
import { SUPPORTED_SYMBOLS } from '../types/trading';
import { TrendingUp, Activity, ShieldCheck } from 'lucide-react';

const Index = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  const tradingData = useRealTradingData(selectedSymbol);

  const activeSymbolInfo = SUPPORTED_SYMBOLS.find(s => s.symbol === selectedSymbol) || SUPPORTED_SYMBOLS[0];

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-amber-500/30">
      
      {/* Top Navbar */}
      <header className="w-full border-b border-white/[0.04] bg-[#08090c] px-6 py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <TrendingUp size={18} className="text-amber-500" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest text-white">QUANTUM ANALYTICS PRO</h1>
            <p className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Análise Técnica Institucional em Tempo Real</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 bg-white/[0.02] border border-white/[0.04] px-3.5 py-1.5 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-[#26a69a] animate-pulse" />
          <span className="text-[10px] font-mono text-white/70 uppercase tracking-wider">Feed Binance Ativo (Zero Latência)</span>
        </div>
      </header>

      {/* Fita de Cotações Superiores */}
      <TickerTape
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
        currentPrice={tradingData.price}
        priceChange24h={tradingData.priceChange24h}
        high24h={tradingData.high24h}
        low24h={tradingData.low24h}
        volume24h={tradingData.volume24h}
      />

      {/* Dashboard Principal (Workstation em Tela Cheia) */}
      <main className="flex-grow p-6 max-w-[1700px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Coluna 1: Bússola Velocímetro TradingView (4/12 cols) */}
        <div className="lg:col-span-4 flex flex-col">
          <TradingViewGauge
            overallSummary={tradingData.overallSummary}
            oscillatorsSummary={tradingData.oscillatorsSummary}
            maSummary={tradingData.maSummary}
            orderFlowSummary={tradingData.orderFlowSummary}
            selectedAsset={selectedSymbol}
          />
        </div>

        {/* Coluna 2: Tabelas Detalhadas de Indicadores e Médias (5/12 cols) */}
        <div className="lg:col-span-5 flex flex-col">
          <TechnicalDetailsTable
            oscillators={tradingData.oscillators}
            movingAverages={tradingData.movingAverages}
            orderFlowIndicators={tradingData.orderFlowIndicators}
          />
        </div>

        {/* Coluna 3: Livro de Ofertas e Negócios ao Vivo (3/12 cols) */}
        <div className="lg:col-span-3 flex flex-col space-y-4">
          <div className="flex-grow">
            <RealOrderBook
              bids={tradingData.bids}
              asks={tradingData.asks}
              currentPrice={tradingData.price}
              precision={activeSymbolInfo.precision}
            />
          </div>
          <div className="h-64">
            <LiveTradeFeed
              trades={tradingData.recentTrades}
              precision={activeSymbolInfo.precision}
            />
          </div>
        </div>

      </main>
    </div>
  );
};

export default Index;