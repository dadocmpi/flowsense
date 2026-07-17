import React from 'react';
import { 
  Menu, 
  TrendingUp, 
  Compass, 
  Coins, 
  Layers, 
  Sliders, 
  Shield, 
  Settings 
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const icons = [
    { icon: Menu, active: false },
    { icon: TrendingUp, active: true },
    { icon: Compass, active: false },
    { icon: Coins, active: false },
    { icon: Layers, active: false },
    { icon: Sliders, active: false },
    { icon: Shield, active: false },
    { icon: Settings, active: false },
  ];

  return (
    <div className="w-16 h-full bg-[#08090c] border-r border-white/[0.03] flex flex-col items-center py-6 justify-between flex-shrink-0">
      <div className="flex flex-col items-center space-y-6 w-full">
        {icons.slice(0, 6).map((item, idx) => (
          <button 
            key={idx} 
            className={`p-2.5 rounded-lg transition-all ${
              item.active 
                ? 'bg-white/[0.06] text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' 
                : 'text-white/30 hover:text-white/60 hover:bg-white/[0.02]'
            }`}
          >
            <item.icon size={18} strokeWidth={1.5} />
          </button>
        ))}
      </div>
      
      <div className="flex flex-col items-center space-y-6 w-full">
        {icons.slice(6).map((item, idx) => (
          <button 
            key={idx} 
            className="p-2.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.02] transition-all"
          >
            <item.icon size={18} strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </div>
  );
};