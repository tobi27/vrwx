
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Metrics } from '../types';
import { Activity, Cpu, Globe, Server, Users, Zap, Database } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

const NodeRow = ({ id, region, latency, status }: { id: string, region: string, latency: number, status: 'active' | 'syncing' }) => (
  <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 hover:bg-white/5 px-4 -mx-4 transition-colors group">
    <div className="flex items-center gap-4">
       <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-yellow-500 animate-pulse'}`}></div>
       <div className="font-mono text-xs text-slate-300 group-hover:text-white">{id}</div>
    </div>
    <div className="flex items-center gap-8">
       <div className="font-mono text-xs text-slate-500 w-24">{region}</div>
       <div className="font-mono text-xs text-primary w-16 text-right">{latency}ms</div>
    </div>
  </div>
);

export const Community = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    // Fetch real metrics from backend
    api.getMetrics().then(data => {
      setMetrics(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white mb-2 glitch" data-text={t.community.title}>{t.community.title}</h1>
          <p className="text-slate-400 font-mono text-xs">{t.community.subtitle}</p>
        </div>
        <div className="flex gap-4">
           <div className="text-right">
              <div className="text-[10px] text-slate-500 font-mono uppercase">{t.community.label_gmv}</div>
              {loading ? (
                <div className="h-6 w-24 bg-white/10 animate-pulse rounded mt-1"></div>
              ) : (
                <div className="text-xl font-bold font-mono text-white">${metrics ? metrics.gmv.toLocaleString() : '0.00'}</div>
              )}
           </div>
           <div className="text-right">
              <div className="text-[10px] text-slate-500 font-mono uppercase">{t.community.label_receipts}</div>
              {loading ? (
                <div className="h-6 w-16 bg-white/10 animate-pulse rounded mt-1"></div>
              ) : (
                <div className="text-xl font-bold font-mono text-emerald-500">{metrics?.totalReceipts || 0}</div>
              )}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
         <div className="bg-surface/30 border border-white/10 p-6 rounded-xl backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-50 transition-opacity">
                <Server size={48} />
            </div>
            <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-blue-500/10 rounded-lg"><Database size={20} className="text-primary"/></div>
               <div className="font-mono text-sm font-bold text-white">{t.community.stat_active}</div>
            </div>
            <div className="text-3xl font-mono text-white font-bold mb-1">
               {loading ? '...' : metrics?.activeOffers || 0}
            </div>
            <div className="text-xs text-slate-500">{t.community.stat_active_sub}</div>
         </div>
         
         <div className="bg-surface/30 border border-white/10 p-6 rounded-xl backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-50 transition-opacity">
                <Users size={48} />
            </div>
            <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-purple-500/10 rounded-lg"><Users size={20} className="text-purple-500"/></div>
               <div className="font-mono text-sm font-bold text-white">{t.community.stat_dispute}</div>
            </div>
            <div className="text-3xl font-mono text-white font-bold mb-1">
               {loading ? '...' : ((metrics?.disputeRate || 0) * 100).toFixed(2)}%
            </div>
            <div className="text-xs text-slate-500">{t.community.stat_dispute_sub}</div>
         </div>

         <div className="bg-surface/30 border border-white/10 p-6 rounded-xl backdrop-blur-sm relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-50 transition-opacity">
                <Zap size={48} />
            </div>
            <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-emerald-500/10 rounded-lg"><Zap size={20} className="text-emerald-500"/></div>
               <div className="font-mono text-sm font-bold text-white">{t.community.stat_uptime}</div>
            </div>
            <div className="text-3xl font-mono text-white font-bold mb-1">99.99%</div>
            <div className="text-xs text-slate-500">{t.community.stat_uptime_sub}</div>
         </div>
      </div>

      <div className="bg-[#050810] border border-white/10 rounded-xl overflow-hidden">
         <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
            <h3 className="font-mono text-xs font-bold text-slate-300 flex items-center gap-2">
               <Globe size={14} /> {t.community.topology}
            </h3>
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
               <span className="text-[10px] font-mono text-emerald-500">{t.community.sync_live} ({loading ? t.community.sync_conn : 'ONLINE'})</span>
            </div>
         </div>
         <div className="p-6">
            <NodeRow id="v-node-0x8a...2f" region="US-WEST-1" latency={24} status="active" />
            <NodeRow id="v-node-0x3c...9a" region="EU-CENTRAL" latency={112} status="active" />
            <NodeRow id="v-node-0x1b...4d" region="AP-SOUTH-1" latency={185} status="syncing" />
            <NodeRow id="v-node-0x7f...11" region="US-EAST-2" latency={45} status="active" />
            <NodeRow id="v-node-0x9e...88" region="SA-EAST-1" latency={150} status="active" />
         </div>
      </div>
    </div>
  );
};
