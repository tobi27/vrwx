
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Service } from '../types';
import { Calculator, MapPin, Clock, ShieldCheck, ArrowRight, Check, Loader2, DollarSign, Terminal, Settings } from 'lucide-react';
import { useLanguage, translateServiceType } from '../lib/i18n';

// Pricing multipliers
const QUALITY_MULTIPLIER = 0.05; // 5% per tier
const RISK_PREMIUM = { low: 1.0, medium: 1.15, high: 1.4 };

export const Quote = () => {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [offerCreated, setOfferCreated] = useState(false);
  const { t, lang } = useLanguage();

  // Form State
  const [formData, setFormData] = useState({
    serviceId: '',
    location: '',
    durationHours: 2,
    qualityTier: 'standard', // standard, premium, elite
    riskLevel: 'low',
    startDate: '',
  });

  // Estimated Price State
  const [estimate, setEstimate] = useState<{ base: number; total: number; bonding: number } | null>(null);

  useEffect(() => {
    api.getServices().then(setServices);
  }, []);

  // Real-time price simulation
  useEffect(() => {
    if (formData.serviceId) {
      setCalculating(true);
      const timer = setTimeout(() => {
        const service = services.find(s => s.id === formData.serviceId);
        const baseRate = service ? service.avgPrice : 50;
        
        const qMult = formData.qualityTier === 'premium' ? 1.5 : formData.qualityTier === 'elite' ? 2.5 : 1.0;
        const rMult = RISK_PREMIUM[formData.riskLevel as keyof typeof RISK_PREMIUM];
        
        const hourlyTotal = baseRate * qMult * rMult;
        const total = hourlyTotal * formData.durationHours;
        
        setEstimate({
          base: baseRate,
          total: Math.round(total),
          bonding: Math.round(total * 0.1) // 10% bonding requirement
        });
        setCalculating(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [formData, services]);

  const handleCreateOffer = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setOfferCreated(true);
      setStep(3);
    }, 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-center">
            <Terminal className="text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold font-mono text-white tracking-tight glitch" data-text={t.quote.title}>{t.quote.title}</h1>
          <p className="text-slate-400 font-mono text-xs uppercase tracking-widest">{t.quote.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column: Configurator */}
        <div className="lg:col-span-7 space-y-8">
          
          <div className="space-y-8">
            {/* Service Selection */}
            <div className="bg-surface/50 border border-white/10 p-6 rounded-xl backdrop-blur-sm">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-primary rounded-full"></div> {t.quote.step_1}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {services.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setFormData({...formData, serviceId: s.id})}
                    className={`relative p-4 rounded border text-left transition-all duration-300 group ${
                      formData.serviceId === s.id 
                      ? 'bg-primary/10 border-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                      : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="font-mono text-sm font-bold mb-1 uppercase tracking-wide group-hover:text-primary transition-colors">{translateServiceType(s.name, lang)}</div>
                    <div className="text-[10px] font-mono opacity-70">est. ${s.avgPrice}/hr</div>
                    {formData.serviceId === s.id && <div className="absolute top-2 right-2 text-primary"><Check size={14} /></div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Parameters */}
            <div className={`transition-all duration-500 ${formData.serviceId ? 'opacity-100 translate-y-0' : 'opacity-50 pointer-events-none translate-y-4'}`}>
              <div className="bg-surface/50 border border-white/10 p-6 rounded-xl space-y-6 backdrop-blur-sm">
                <label className="text-[10px] font-mono font-bold text-slate-500 uppercase flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-primary rounded-full"></div> {t.quote.step_2}
              </label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-mono font-medium text-slate-300 mb-2 flex items-center gap-2">
                       <MapPin size={12} /> {t.quote.label_zone}
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-primary transition-all placeholder:text-slate-700"
                      placeholder="LAT/LNG or ZONE_ID"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono font-medium text-slate-300 mb-2 flex items-center gap-2">
                       <Clock size={12} /> {t.quote.label_duration}
                    </label>
                    <div className="flex items-center gap-4">
                        <input 
                          type="range" 
                          min="1" max="24" step="1"
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
                          value={formData.durationHours}
                          onChange={(e) => setFormData({...formData, durationHours: parseInt(e.target.value)})}
                        />
                        <div className="text-right text-sm text-primary font-mono font-bold w-12">{formData.durationHours}h</div>
                    </div>
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-mono font-medium text-slate-300 mb-3 flex items-center gap-2">
                       <ShieldCheck size={12} /> {t.quote.label_sla}
                    </label>
                   <div className="flex bg-black/40 p-1 rounded border border-white/10">
                      {['standard', 'premium', 'elite'].map((tier) => (
                        <button
                          key={tier}
                          onClick={() => setFormData({...formData, qualityTier: tier})}
                          className={`flex-1 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded transition-all ${
                            formData.qualityTier === tier 
                            ? 'bg-white/10 text-white shadow-sm border border-white/10' 
                            : 'text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Estimate & Action */}
        <div className="lg:col-span-5">
           <div className="sticky top-24">
              <div className="bg-[#050810] border border-white/10 rounded-xl p-8 shadow-2xl relative overflow-hidden group">
                {/* Background effect */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none group-hover:bg-primary/10 transition-colors duration-700"></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>

                <div className="relative z-10">
                  <h2 className="text-sm font-bold font-mono text-white mb-6 flex items-center gap-2 uppercase tracking-widest border-b border-white/10 pb-4">
                    <Calculator size={14} className="text-primary" /> {t.quote.cost_title}
                  </h2>

                  {!formData.serviceId ? (
                     <div className="text-center py-12 text-slate-600 font-mono text-xs border border-dashed border-white/10 rounded bg-white/[0.02]">
                        {t.quote.wait_input}
                     </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                      <div className="space-y-3 pb-6 border-b border-white/10 font-mono text-xs">
                         <div className="flex justify-between text-slate-400">
                           <span>{t.quote.base_rate} ({translateServiceType(services.find(s=>s.id === formData.serviceId)?.name || '', lang)})</span>
                           <span>${estimate?.base}/hr</span>
                         </div>
                         <div className="flex justify-between text-slate-400">
                           <span>{t.quote.label_duration}</span>
                           <span>{formData.durationHours} HRS</span>
                         </div>
                         <div className="flex justify-between text-slate-400">
                           <span>{t.quote.quality_mult}</span>
                           <span className="text-emerald-500 capitalize">+{formData.qualityTier}</span>
                         </div>
                      </div>

                      <div className="flex justify-between items-end">
                         <span className="text-slate-300 font-mono text-xs uppercase">{t.quote.total_est}</span>
                         <div className="text-right">
                            {calculating ? (
                               <div className="h-8 w-24 bg-white/10 animate-pulse rounded"></div>
                            ) : (
                               <div className="text-4xl font-bold font-mono text-white tracking-tighter">
                                 ${estimate?.total}
                               </div>
                            )}
                            <div className="text-[10px] font-mono text-slate-500 mt-1">USDC / VRWX</div>
                         </div>
                      </div>

                      <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded flex gap-3">
                         <div className="mt-0.5 text-primary"><ShieldCheck size={16} /></div>
                         <div>
                            <div className="text-[10px] font-bold font-mono text-primary mb-1 uppercase">{t.quote.bonding_title}</div>
                            <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                               {t.quote.bonding_desc.replace('${amount}', '$' + estimate?.bonding)}
                            </p>
                         </div>
                      </div>

                      <button
                         onClick={handleCreateOffer}
                         disabled={loading || offerCreated}
                         className={`w-full py-4 rounded font-bold font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative overflow-hidden ${
                           offerCreated 
                           ? 'bg-emerald-900/50 text-emerald-500 border border-emerald-500/50 cursor-default'
                           : 'bg-white text-black hover:bg-slate-200'
                         }`}
                      >
                         {loading ? (
                           <Loader2 className="animate-spin" />
                         ) : offerCreated ? (
                           <> {t.quote.btn_done} <Check size={16} /></>
                         ) : (
                           <> {t.quote.btn_sign} <ArrowRight size={16} /></>
                         )}
                      </button>
                      
                      {offerCreated && (
                        <div className="text-center animate-in fade-in zoom-in">
                          <p className="text-[10px] font-mono text-slate-500 mb-2">{t.quote.offer_confirmed}</p>
                          <a href="#" className="text-primary text-[10px] font-mono hover:underline">{t.quote.view_etherscan}</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};
