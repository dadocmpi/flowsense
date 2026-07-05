import React, { useState } from 'react';
import { Watchlist } from '../components/trading/Watchlist';
import { MainChart } from '../components/trading/MainChart';
import { DirectionalCompass } from '../components/trading/DirectionalCompass';
import { OrderFlowFeed } from '../components/trading/OrderFlowFeed';
import { useTradingData } from '../hooks/useTradingData';
import { Timeframe } from '../types/trading';
import { LayoutGrid, Activity, Shield, Zap, Settings, Bell } from 'lucide-react';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('EUR/USD');
  const [timeframe, setTimeframe] = useState<Timeframe>('M15');
  const { orderFlow } = useTradingData(selectedAsset);

  return (
    <div className="flex h-screen w-screen bg-[#0d0f14] text-white overflow-hidden font-sans selection:bg-white/20">
      {/* Sidebar Estreita (Navegação) */}
      <div className="w-12 flex flex-col items-center py-4 border-r border-white/5 space-y-6 bg-black/20">
        <div className="w-8 h-8 bg-white rounded flex items-center justify-center mb-4">
          <Zap size={18} className="text-black fill-black" />
        </div>
        <button className="p-2 text-white hover:bg-white/5 rounded transition-colors">
          <LayoutGrid size={20} />
        </button>
        <button className="p-2 text-white/40 hover:bg-white/5 rounded transition-colors">
          <Activity size={20} />
        </button>
        <button className="p-2 text-white/40 hover:bg-white/5 rounded transition-colors">
          <Shield size={20} />
        </button>
        <div className="flex-grow" />
        <button className="p-2 text-white/40 hover:bg-white/5 rounded transition-colors">
          <Bell size={20} />
        </button>
        <button className="p-2 text-white/40 hover:bg-white/5 rounded transition-colors">
          <Settings size={20} />
        </button>
      </div>

      {/* Coluna Esquerda: Watchlist */}
      <div className="w-72 flex-shrink-0">
        <Watchlist 
          selectedAsset={selectedAsset} 
          onSelect={setSelectedAsset} 
        />
      </div>

      {/* Coluna Central: Gráfico */}
      <div className="flex-grow flex flex-col min-w-0">
        <MainChart 
          asset={selectedAsset} 
          timeframe={timeframe} 
        />
      </div>

      {/* Coluna Direita: IA & Order Flow */}
      <div className="w-80 flex-shrink-0 border-l border-white/5 flex flex-col">
        <DirectionalCompass 
          score={78} 
          bias="Bullish" 
        />
        <OrderFlowFeed 
          data={orderFlow} 
        />
      </div>
    </div>
  );
};

export default Index;