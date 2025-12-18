
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Shield, FileJson, Cpu, Activity, ExternalLink, Layers, Code2, Zap, DollarSign, TrendingUp, Scale, Globe } from 'lucide-react';
import { api } from '../lib/api';
import { Metrics, Receipt } from '../types';
import { useLanguage, translateServiceType } from '../lib/i18n';

// Pricing plan card component
const PlanCard = ({ name, price, desc, features, cta, popular, popularLabel, month, planId, onSubscribe }: {
  name: string, price: string, desc: string, features: string[], cta: string, popular?: boolean, popularLabel?: string, month: string, planId: string, onSubscribe: (plan: string) => void
}) => {
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    if (planId === 'launch') {
      // Free plan - go to connect
      window.location.href = '/#/connect';
      return;
    }
    setLoading(true);
    onSubscribe(planId);
  };

  return (
    <div className={`relative p-6 rounded-xl border ${popular ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/[0.02]'} hover:border-primary/50 transition-all duration-300 group`}>
      {popular && popularLabel && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white text-[10px] font-bold rounded-full">
          {popularLabel}
        </div>
      )}
      <h3 className="text-lg font-bold text-white mb-1">{name}</h3>
      <p className="text-slate-500 text-xs mb-4">{desc}</p>
      <div className="mb-4">
        <span className="text-4xl font-mono font-bold text-white">${price}</span>
        <span className="text-sm text-slate-400">{month}</span>
      </div>
      <ul className="space-y-2 mb-6">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
            <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 ${popular ? 'bg-primary hover:bg-blue-600 text-white' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'} text-sm font-medium rounded-lg transition-all disabled:opacity-50`}
      >
        {loading ? 'Loading...' : cta} {!loading && <ArrowRight size={14} />}
      </button>
    </div>
  );
};

// How it works step component
const HowItWorksStep = ({ num, title, subtitle, desc }: { num: string, title: string, subtitle: string, desc: string }) => (
  <div className="text-center group">
    <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-3 text-primary font-mono font-bold text-lg group-hover:bg-primary group-hover:text-white transition-all">
      {num}
    </div>
    <h3 className="font-bold text-white mb-1">{title}</h3>
    <p className="text-xs text-slate-500 mb-1">{subtitle}</p>
    <p className="text-xs text-slate-400">{desc}</p>
  </div>
);

// Value Proposition Card with stat
const ValuePropCard = ({ icon: Icon, title, desc, stat, statLabel, color }: {
  icon: any, title: string, desc: string, stat: string, statLabel: string, color: string
}) => (
  <div className="relative p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent hover:border-primary/30 transition-all duration-500 group overflow-hidden">
    <div className={`absolute top-0 right-0 w-32 h-32 ${color} rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity`}></div>
    <div className="relative z-10">
      <div className={`w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6`}>
        <Icon className={`${color.replace('bg-', 'text-')}`} size={28} />
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed mb-6">{desc}</p>
      <div className="pt-4 border-t border-white/10">
        <div className="text-3xl font-mono font-bold text-white mb-1">{stat}</div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">{statLabel}</div>
      </div>
    </div>
  </div>
);

const FeatureCard = ({ icon: Icon, title, desc, delay }: { icon: any, title: string, desc: string, delay: string }) => (
  <div className={`p-8 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-primary/30 transition-all duration-500 group backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards ${delay}`}>
    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
      <Icon className="text-slate-200 group-hover:text-primary transition-colors" size={24} />
    </div>
    <h3 className="text-xl font-bold mb-3 text-white group-hover:text-primary-glow transition-colors">{title}</h3>
    <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
  </div>
);

const ProofRow: React.FC<{ receipt: Receipt }> = ({ receipt }) => {
   const { t, lang } = useLanguage();
   return (
  <div className="group flex items-center justify-between py-4 border-b border-white/5 last:border-0 text-sm hover:bg-white/[0.02] transition-colors px-4 -mx-4 rounded-lg">
    <div className="flex items-center gap-4">
      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
        <CheckCircle size={14} />
      </div>
      <div>
        <div className="flex items-center gap-2">
           <span className="font-mono text-xs text-slate-500">ID</span>
           <Link to={`/receipts/${receipt.tokenId}`} className="text-white hover:text-primary font-mono font-medium transition-colors">#{receipt.tokenId}</Link>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{new Date(receipt.timestamp).toLocaleTimeString()}</div>
      </div>
    </div>
    
    <div className="hidden sm:block">
      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 capitalize">
        {translateServiceType(receipt.serviceType, lang)}
      </div>
    </div>
    
    <div className="hidden md:block text-right">
      <div className="font-mono text-xs text-slate-500 mb-1">DATA HASH</div>
      <div className="font-mono text-emerald-500/70 text-xs truncate w-24 group-hover:w-auto group-hover:text-emerald-400 transition-all bg-emerald-500/5 px-2 py-0.5 rounded">
        {receipt.manifestHash.substring(0, 8)}...
      </div>
    </div>
    
    <Link to={`/receipts/${receipt.tokenId}`} className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 transition-all">
      {t.live.verify}
    </Link>
  </div>
)};

const StatBox = ({ label, value, sub, delay }: { label: string, value: string | number, sub?: string, delay: string }) => (
  <div className={`text-center p-6 border-r border-white/5 last:border-0 animate-in fade-in zoom-in duration-700 ${delay}`}>
    <div className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">{label}</div>
    <div className="text-3xl md:text-4xl font-mono text-white font-bold tracking-tighter glow-text mb-1">
      {value}
    </div>
    {sub && <div className="text-xs font-medium text-emerald-500">{sub}</div>}
  </div>
);

export const Landing = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const { t } = useLanguage();

  useEffect(() => {
    api.getMetrics().then(setMetrics);
    api.getReceipts().then(data => setReceipts(data.slice(0, 3)));
  }, []);

  const handleSubscribe = async (plan: string) => {
    try {
      const result = await api.subscribe(plan as 'launch' | 'fleet' | 'network');
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else if (result.connectUrl) {
        window.location.href = `/#${result.connectUrl}`;
      }
    } catch (err) {
      console.error('Subscription failed:', err);
      alert('Failed to start subscription. Please try again.');
    }
  };

  return (
    <div className="space-y-32 pb-20 overflow-hidden">
      {/* Hero Section */}
      <section className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center z-10">
        
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-medium mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          {t.hero.badge}
        </div>
        
        <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-tight text-white mb-8 animate-in fade-in zoom-in duration-1000 glitch" data-text={t.hero.title_1 + t.hero.title_2}>
          {t.hero.title_1} <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500">{t.hero.title_2}</span>
        </h1>
        
        <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-400 mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          {t.hero.subtitle}
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
          <Link to="/connect" className="w-full sm:w-auto px-8 py-4 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold transition-all shadow-[0_0_40px_rgba(59,130,246,0.3)] hover:shadow-[0_0_60px_rgba(59,130,246,0.5)] flex items-center justify-center gap-3 group">
            <Cpu size={20} className="group-hover:rotate-12 transition-transform" />
            <span>{t.hero.btn_connect}</span>
            <ArrowRight size={16} className="opacity-50 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link to="/marketplace" className="w-full sm:w-auto px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl font-bold transition-all backdrop-blur flex items-center justify-center gap-2">
            {t.hero.btn_market}
          </Link>
          <Link to="/docs" className="w-full sm:w-auto px-8 py-4 bg-transparent border border-dashed border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-slate-400 hover:text-emerald-400 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group">
             <Code2 size={20} className="text-slate-600 group-hover:text-emerald-500 transition-colors"/>
             <span>{t.hero.btn_docs}</span>
          </Link>
        </div>

        {/* Floating Glass Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 max-w-5xl mx-auto bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] animate-scan pointer-events-none"></div>
           <StatBox label={t.hero.stat_gmv} value={metrics ? `$${(metrics.gmv / 1000).toFixed(1)}k` : '---'} sub="+12.5%" delay="delay-500" />
           <StatBox label={t.hero.stat_active} value={metrics ? metrics.activeOffers : '---'} delay="delay-600" />
           <StatBox label={t.hero.stat_settled} value={metrics ? metrics.totalReceipts.toLocaleString() : '---'} delay="delay-700" />
           <StatBox label={t.hero.stat_security} value={metrics ? '99.9%' : '---'} sub={t.hero.stat_uptime} delay="delay-800" />
        </div>
      </section>

      {/* Value Proposition - Why Tokenize? */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t.value_prop.title}</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">{t.value_prop.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ValuePropCard
            icon={TrendingUp}
            title={t.value_prop.card_1_title}
            desc={t.value_prop.card_1_desc}
            stat={t.value_prop.card_1_stat}
            statLabel={t.value_prop.card_1_stat_label}
            color="bg-emerald-500"
          />
          <ValuePropCard
            icon={Scale}
            title={t.value_prop.card_2_title}
            desc={t.value_prop.card_2_desc}
            stat={t.value_prop.card_2_stat}
            statLabel={t.value_prop.card_2_stat_label}
            color="bg-blue-500"
          />
          <ValuePropCard
            icon={Globe}
            title={t.value_prop.card_3_title}
            desc={t.value_prop.card_3_desc}
            stat={t.value_prop.card_3_stat}
            statLabel={t.value_prop.card_3_stat_label}
            color="bg-purple-500"
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-white mb-2">{t.how_it_works.title}</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <HowItWorksStep num="1" title={t.how_it_works.step_1_title} subtitle={t.how_it_works.step_1_subtitle} desc={t.how_it_works.step_1_desc} />
          <HowItWorksStep num="2" title={t.how_it_works.step_2_title} subtitle={t.how_it_works.step_2_subtitle} desc={t.how_it_works.step_2_desc} />
          <HowItWorksStep num="3" title={t.how_it_works.step_3_title} subtitle={t.how_it_works.step_3_subtitle} desc={t.how_it_works.step_3_desc} />
          <HowItWorksStep num="4" title={t.how_it_works.step_4_title} subtitle={t.how_it_works.step_4_subtitle} desc={t.how_it_works.step_4_desc} />
        </div>
        {/* Connection lines between steps */}
        <div className="hidden md:flex justify-center mt-4">
          <div className="flex items-center gap-2 text-slate-600">
            <div className="w-20 h-px bg-gradient-to-r from-primary/50 to-transparent"></div>
            <Zap size={12} className="text-primary" />
            <div className="w-20 h-px bg-primary/30"></div>
            <Zap size={12} className="text-primary" />
            <div className="w-20 h-px bg-primary/30"></div>
            <Zap size={12} className="text-primary" />
            <div className="w-20 h-px bg-gradient-to-l from-primary/50 to-transparent"></div>
          </div>
        </div>
      </section>

      {/* Value Prop Grid */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">{t.features.title}</h2>
          <p className="text-slate-400">{t.features.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={Shield}
            title={t.features.card_1_title}
            desc={t.features.card_1_desc}
            delay="delay-0"
          />
          <FeatureCard
            icon={FileJson}
            title={t.features.card_2_title}
            desc={t.features.card_2_desc}
             delay="delay-100"
          />
          <FeatureCard
            icon={Layers}
            title={t.features.card_3_title}
            desc={t.features.card_3_desc}
             delay="delay-200"
          />
        </div>
      </section>

      {/* Pricing Section */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">{t.pricing.title}</h2>
          <p className="text-slate-400">{t.pricing.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <PlanCard
            planId="launch"
            name={t.pricing.launch_name}
            price={t.pricing.launch_price}
            desc={t.pricing.launch_desc}
            features={[t.pricing.launch_f1, t.pricing.launch_f2, t.pricing.launch_f3, t.pricing.launch_f4, t.pricing.launch_f5]}
            cta={t.pricing.get_started}
            month={t.pricing.month}
            onSubscribe={handleSubscribe}
          />
          <PlanCard
            planId="fleet"
            name={t.pricing.fleet_name}
            price={t.pricing.fleet_price}
            desc={t.pricing.fleet_desc}
            features={[t.pricing.fleet_f1, t.pricing.fleet_f2, t.pricing.fleet_f3, t.pricing.fleet_f4, t.pricing.fleet_f5]}
            cta={t.pricing.get_started}
            month={t.pricing.month}
            popular
            popularLabel={t.pricing.popular}
            onSubscribe={handleSubscribe}
          />
          <PlanCard
            planId="network"
            name={t.pricing.network_name}
            price={t.pricing.network_price}
            desc={t.pricing.network_desc}
            features={[t.pricing.network_f1, t.pricing.network_f2, t.pricing.network_f3, t.pricing.network_f4, t.pricing.network_f5]}
            cta={t.pricing.contact_sales}
            month={t.pricing.month}
            onSubscribe={handleSubscribe}
          />
        </div>
        {/* Protocol fee info */}
        <div className="text-center p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <div className="flex items-center justify-center gap-2 text-sm">
            <DollarSign size={14} className="text-emerald-500" />
            <span className="text-slate-300">{t.pricing.protocol_fee}: </span>
            <span className="text-white font-mono">2.5%</span>
            <span className="text-slate-500 text-xs">{t.pricing.protocol_fee_desc}</span>
          </div>
        </div>
      </section>

      {/* Live Feed Terminal */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="bg-[#050b14] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative group">
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          
          <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
              </div>
              <h3 className="font-mono text-sm text-slate-400 ml-2 flex items-center gap-2">
                 <Activity size={14} className="text-emerald-500 animate-pulse" />
                 {t.live.title}
              </h3>
            </div>
            <Link to="/receipts" className="text-xs font-mono text-primary hover:text-white transition-colors flex items-center gap-1">
              {t.live.view_explorer} <ExternalLink size={10} />
            </Link>
          </div>
          
          <div className="p-6 min-h-[300px] flex flex-col justify-end relative">
             <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#050b14] to-transparent z-10 pointer-events-none"></div>
             {receipts.length > 0 ? (
               receipts.map((r) => <ProofRow key={r.tokenId} receipt={r} />)
             ) : (
               <div className="flex flex-col items-center justify-center py-12 text-center">
                 <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                   <Activity size={20} className="text-slate-600" />
                 </div>
                 <p className="text-slate-500 text-sm">{t.live.empty}</p>
                 <Link to="/connect" className="mt-4 text-primary text-xs hover:underline flex items-center gap-1">
                   {t.hero.btn_connect} <ArrowRight size={12} />
                 </Link>
               </div>
             )}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-emerald-900/20 rounded-3xl blur-3xl -z-10"></div>
        <div className="text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">{t.cta.title}</h2>
          <p className="text-slate-400 mb-10 max-w-xl mx-auto">{t.cta.subtitle}</p>
          <div className="flex justify-center gap-6">
             <Link to="/quote" className="text-white hover:text-primary font-bold flex items-center gap-2 transition-colors border-b border-transparent hover:border-primary pb-1">
               {t.cta.btn_quote} <ArrowRight size={16} />
             </Link>
             <Link to="/docs" className="text-slate-500 hover:text-white font-medium transition-colors pb-1">
               {t.cta.btn_docs}
             </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
