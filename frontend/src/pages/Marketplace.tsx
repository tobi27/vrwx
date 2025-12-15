
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Offer, Service } from '../types';
import { Filter, Search, ShoppingCart, Loader2, Crosshair, Map as MapIcon, List, Zap, Radar, Globe, Database } from 'lucide-react';
import { useLanguage, translateServiceType } from '../lib/i18n';

const TacticalMap = () => (
  <div className="relative w-full h-full bg-[#050810] overflow-hidden rounded-r-xl border-l border-white/5">
     {/* Grid Overlay */}
     <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
     
     {/* Simulated Terrain/Dark Mode Map */}
     <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.2),transparent_70%)]"></div>

     {/* Active Units */}
     {[...Array(5)].map((_, i) => (
        <div key={i} className="absolute flex flex-col items-center gap-1" style={{ top: `${20 + Math.random() * 60}%`, left: `${20 + Math.random() * 60}%` }}>
           <div className="relative">
              <div className="w-3 h-3 bg-primary rounded-full shadow-[0_0_10px_#3b82f6]"></div>
              <div className="absolute inset-0 border border-primary rounded-full animate-ping opacity-75"></div>
           </div>
           <div className="text-[9px] font-mono text-primary/70 bg-black/50 px-1 rounded backdrop-blur">UNIT_{100+i}</div>
        </div>
     ))}

     {/* Scanning Radar Line */}
     <div className="absolute inset-0 border-t border-primary/20 animate-scanline pointer-events-none opacity-50"></div>
     
     {/* HUD Elements */}
     <div className="absolute top-4 left-4 flex gap-2">
        <div className="px-2 py-1 bg-black/60 border border-white/10 text-[10px] font-mono text-emerald-500">LIVE FEED</div>
        <div className="px-2 py-1 bg-black/60 border border-white/10 text-[10px] font-mono text-slate-400">SAT_LINK: CONNECTED</div>
     </div>
  </div>
);

export const Marketplace = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const { t, lang } = useLanguage();

  useEffect(() => {
    // Check connection source
    api.checkConnection().then(setIsLive);

    api.getServices().then(setServices);
    api.getOffers(activeTab === 'all' ? undefined : activeTab).then(setOffers);
  }, [activeTab]);

  const handleBuy = async (offerId: string) => {
    setBuying(offerId);
    try {
      await api.buyOffer(offerId);
    } catch (e) {
      // ignore
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] p-4 flex flex-col gap-4">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface/50 border border-white/10 p-4 rounded-xl backdrop-blur-sm gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full md:w-auto">
            <h1 className="text-xl font-bold font-mono text-white tracking-tight flex items-center gap-2">
               <Globe className="text-primary" size={20} /> {t.market.title}
            </h1>
            
            {/* Live Indicator */}
            <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border flex items-center gap-1.5 ${isLive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
               <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500'}`}></div>
               {isLive ? t.market.source_live : t.market.source_mock}
            </div>

            <div className="hidden md:block h-6 w-[1px] bg-white/10"></div>
            <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
               <button 
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 text-xs font-mono transition-all border whitespace-nowrap ${activeTab === 'all' ? 'bg-primary/20 border-primary text-primary' : 'border-transparent text-slate-400 hover:border-white/10'}`}
               >
                  {t.market.tab_all}
               </button>
               {services.map(s => (
                  <button 
                  key={s.id}
                  onClick={() => setActiveTab(s.id)}
                  className={`px-3 py-1 text-xs font-mono uppercase transition-all border whitespace-nowrap ${activeTab === s.id ? 'bg-primary/20 border-primary text-primary' : 'border-transparent text-slate-400 hover:border-white/10'}`}
                  >
                  {translateServiceType(s.name, lang)}
                  </button>
               ))}
            </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
           <div className="relative group w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={14} />
              <input 
                 type="text" 
                 placeholder={t.market.search_placeholder}
                 className="bg-black/40 border border-white/10 rounded-md pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-primary w-full md:w-64 font-mono transition-colors"
              />
           </div>
        </div>
      </div>

      {/* Main Terminal Area */}
      <div className="flex-grow flex border border-white/10 rounded-xl overflow-hidden bg-surface/30 backdrop-blur-md">
         
         {/* Order Book (Left) */}
         <div className="w-full lg:w-1/2 flex flex-col border-r border-white/10">
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-white/5">
               <span className="text-xs font-mono text-slate-400 flex items-center gap-2"><List size={14}/> {t.hero.stat_active}</span>
               <span className="text-[10px] font-mono text-primary animate-pulse">{offers.length} SIGNAL SOURCES</span>
            </div>
            
            <div className="flex-grow overflow-y-auto">
               <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#090e1a] z-10 shadow-lg shadow-black/20">
                     <tr className="text-[10px] font-mono text-slate-500 border-b border-white/5">
                        <th className="px-6 py-2">{t.market.col_id}</th>
                        <th className="px-6 py-2">{t.market.col_type}</th>
                        <th className="px-6 py-2">{t.market.col_loc}</th>
                        <th className="px-6 py-2 hidden sm:table-cell">{t.market.col_qual}</th>
                        <th className="px-6 py-2 text-right">{t.market.col_price}</th>
                        <th className="px-6 py-2"></th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                     {offers.length === 0 ? (
                        <tr>
                           <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-mono text-xs">
                              {isLive ? t.market.empty : t.market.init}
                           </td>
                        </tr>
                     ) : (
                        offers.map(offer => (
                           <tr key={offer.id} className="group hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 font-mono text-xs text-slate-400 group-hover:text-white">{offer.id}</td>
                              <td className="px-6 py-3 text-xs uppercase text-primary/80">{translateServiceType(offer.serviceType, lang)}</td>
                              <td className="px-6 py-3 text-xs text-white">
                                 <div className="flex items-center gap-2">
                                   <Crosshair size={10} className="text-slate-500" /> 
                                   <span className="truncate max-w-[100px]">{offer.location}</span>
                                 </div>
                              </td>
                              <td className="px-6 py-3 hidden sm:table-cell">
                                 <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{width: `${offer.qualityMin}%`}}></div>
                                 </div>
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-white text-sm font-bold">
                                 ${offer.price}
                              </td>
                              <td className="px-6 py-3 text-right">
                                 <button 
                                    onClick={() => handleBuy(offer.id)}
                                    disabled={buying === offer.id}
                                    className="px-3 py-1 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/30 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                                 >
                                    {buying === offer.id ? <Loader2 className="animate-spin h-3 w-3" /> : t.market.btn_exec}
                                 </button>
                              </td>
                           </tr>
                        ))
                     )}
                  </tbody>
               </table>
            </div>
         </div>

         {/* Map View (Right) - Remains hidden on mobile */}
         <div className="w-1/2 relative hidden lg:block">
            <TacticalMap />
         </div>

      </div>
    </div>
  );
};
