
import React from 'react';
import { Terminal, Book, Share2, Shield, ArrowRight, Code } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

export const Docs = () => {
  const { t } = useLanguage();
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row items-end justify-between mb-12 border-b border-white/10 pb-8 gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
               <Terminal size={24} className="text-emerald-500" />
             </div>
             <h1 className="text-3xl font-bold text-white font-mono">{t.docs.title}</h1>
           </div>
           <p className="text-slate-400 max-w-xl">
             {t.docs.subtitle}
           </p>
        </div>
        <div className="flex gap-4">
           <button className="text-xs font-mono px-3 py-2 bg-white/5 border border-white/10 rounded hover:bg-white/10 text-white transition-colors">
              {t.docs.sdk_ref}
           </button>
           <button className="text-xs font-mono px-3 py-2 bg-white/5 border border-white/10 rounded hover:bg-white/10 text-white transition-colors">
              {t.docs.smart_contracts}
           </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-8">
           <div className="space-y-2">
              <div className="text-xs font-bold font-mono text-primary uppercase tracking-wider mb-4">{t.docs.core_concepts}</div>
              <a href="#" className="block text-sm text-white font-medium border-l-2 border-primary pl-4 py-1">{t.docs.link_webhook}</a>
              <a href="#" className="block text-sm text-slate-500 hover:text-slate-300 pl-4 py-1 transition-colors">{t.docs.link_proof}</a>
              <a href="#" className="block text-sm text-slate-500 hover:text-slate-300 pl-4 py-1 transition-colors">{t.docs.link_manifest}</a>
           </div>
           
           <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-6">
              <h3 className="text-sm font-bold text-white mb-2">{t.docs.api_key_title}</h3>
              <p className="text-xs text-slate-400 mb-4">
                 {t.docs.api_key_desc}
              </p>
              <button className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
                 {t.docs.apply_access} <ArrowRight size={12}/>
              </button>
           </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-2 space-y-12">
           
           {/* Section 1: Webhooks */}
           <section className="animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Share2 size={20} className="text-emerald-500" /> {t.docs.section_webhook}
              </h2>
              <div className="prose prose-invert prose-sm text-slate-400 mb-6">
                 <p>{t.docs.webhook_desc}</p>
              </div>
              
              <div className="bg-[#050810] border border-white/10 rounded-xl overflow-hidden relative group">
                 <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 bg-white/10 rounded hover:bg-white/20"><Code size={14}/></button>
                 </div>
                 <div className="flex border-b border-white/10 bg-white/5">
                    <div className="px-4 py-2 text-xs font-mono text-white border-b-2 border-primary bg-white/5">cURL</div>
                    <div className="px-4 py-2 text-xs font-mono text-slate-500">Node.js</div>
                 </div>
                 <pre className="p-6 text-xs font-mono leading-relaxed overflow-x-auto text-blue-300">
{`curl -X POST https://api.vrwx.network/v1/connectors/webhook/complete \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -d '{
    "robotId": "unit_8842_alpha",
    "serviceType": "inspection",
    "telemetry": {
      "lat": 34.0522,
      "lng": -118.2437,
      "battery": 92
    },
    "resultData": {
      "images": ["ipfs://QmHash...", "ipfs://QmHash2..."]
    }
  }'`}
                 </pre>
              </div>
           </section>

           {/* Section 2: Verification */}
           <section className="animate-in fade-in slide-in-from-bottom-4 delay-100">
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Shield size={20} className="text-emerald-500" /> {t.docs.section_proof}
              </h2>
              <div className="prose prose-invert prose-sm text-slate-400 mb-6">
                <p>{t.docs.proof_desc}</p>
                <ol className="list-decimal pl-5 space-y-2 marker:text-emerald-500">
                   <li>{t.docs.step_1}</li>
                   <li>{t.docs.step_2}</li>
                   <li>{t.docs.step_3}</li>
                   <li>{t.docs.step_4}</li>
                </ol>
              </div>
              
              <div className="bg-surface/50 border border-white/10 rounded-xl p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-xs font-mono text-white">lib/proof.ts</span>
                 </div>
                 <code className="text-xs font-mono text-slate-400 block">
                    const computed = await crypto.subtle.digest('SHA-256', data);
                 </code>
              </div>
           </section>

        </div>
      </div>
    </div>
  );
};
