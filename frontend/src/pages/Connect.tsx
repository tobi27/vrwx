
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Copy, CheckCircle, ChevronRight, AlertCircle, Loader2, Rocket, Key, Terminal, ArrowRight, Activity } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

// Step indicator component
const StepIndicator = ({ num, title, active, completed }: { num: number, title: string, active: boolean, completed: boolean }) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm transition-all ${
      completed ? 'bg-emerald-500 text-white' :
      active ? 'bg-primary text-white border-2 border-primary' :
      'bg-white/5 text-slate-500 border border-white/10'
    }`}>
      {completed ? <CheckCircle size={18} /> : num}
    </div>
    <span className={`font-medium text-sm ${active || completed ? 'text-white' : 'text-slate-500'}`}>{title}</span>
  </div>
);

export const Connect = () => {
  const [step, setStep] = useState(1);
  const [fleetName, setFleetName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [copied, setCopied] = useState<'key' | 'snippet' | null>(null);

  const { t } = useLanguage();

  const baseUrl = import.meta.env.VITE_API_URL || 'https://api.vrwx.io';
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/connectors/webhook/complete`;

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.onboardFleet(fleetName);
      if (data.success) {
        // In production, API would return apiKey here (shown once)
        // For now, simulate it
        setApiKey(data.connectUrl?.includes('vrwx_') ? data.connectUrl : `vrwx_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 10)}`);
        setTenantId(data.tenant?.id || 'tenant_demo');
        setStep(2);
      } else {
        throw new Error("Failed to connect fleet");
      }
    } catch (err) {
      setError(t.connect.error_network);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, type: 'key' | 'snippet') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const snippet = `curl -X POST ${webhookUrl} \\
  -H "Authorization: Bearer ${apiKey || '<API_KEY>'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jobId": 1,
    "serviceType": "inspection",
    "inspection": { "coverageVisited": 45, "coverageTotal": 50 }
  }'`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-3">{t.connect.title}</h1>
        <p className="text-slate-400 text-sm">{t.connect.subtitle}</p>
      </div>

      {/* Step Progress */}
      <div className="flex justify-between items-center mb-12 px-4">
        <StepIndicator num={1} title={t.connect.step_1_title} active={step === 1} completed={step > 1} />
        <div className="flex-1 h-px bg-white/10 mx-4"></div>
        <StepIndicator num={2} title={t.connect.step_2_title} active={step === 2} completed={step > 2} />
        <div className="flex-1 h-px bg-white/10 mx-4"></div>
        <StepIndicator num={3} title={t.connect.step_3_title} active={step === 3} completed={false} />
      </div>

      {/* Step Content */}
      <div className="bg-surface border border-white/10 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-emerald-500/50 to-transparent"></div>

        {/* Step 1: Name Your Fleet */}
        {step === 1 && (
          <form onSubmit={handleOnboard} className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Rocket className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{t.connect.step_1_title}</h2>
                <p className="text-slate-500 text-sm">{t.connect.step_1_desc}</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex items-center gap-3">
                <AlertCircle size={18} /> {error}
              </div>
            )}

            <div>
              <label className="text-xs font-mono text-slate-500 uppercase mb-2 block">{t.connect.fleet_name}</label>
              <input
                type="text"
                required
                value={fleetName}
                onChange={(e) => setFleetName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-4 text-white font-mono focus:outline-none focus:border-primary transition-all placeholder:text-slate-700"
                placeholder="e.g. ALPHA_LOGISTICS"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !fleetName.trim()}
              className="w-full py-4 bg-primary hover:bg-blue-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="animate-spin" size={18} /> {t.connect.connecting}</>
              ) : (
                <>{t.connect.btn_connect} <ChevronRight size={18} /></>
              )}
            </button>
          </form>
        )}

        {/* Step 2: Get API Key */}
        {step === 2 && apiKey && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Key className="text-emerald-500" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{t.connect.step_2_title}</h2>
                <p className="text-slate-500 text-sm">{t.connect.step_2_desc}</p>
              </div>
            </div>

            <div className="bg-black/40 border border-emerald-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-mono mb-1">{t.connect.api_key_label}</div>
                  <code className="text-emerald-400 font-mono text-lg">{apiKey}</code>
                </div>
                <button
                  onClick={() => handleCopy(apiKey, 'key')}
                  className="p-3 hover:bg-white/5 rounded-lg transition-colors"
                >
                  {copied === 'key' ? <CheckCircle className="text-emerald-500" size={20} /> : <Copy className="text-slate-400" size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-amber-500/80 text-xs bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
              <AlertCircle size={14} />
              <span>{t.connect.api_key_warning}</span>
            </div>

            <button
              onClick={() => setStep(3)}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {t.connect.btn_next} <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Step 3: Send First Job */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Terminal className="text-blue-500" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{t.connect.step_3_title}</h2>
                <p className="text-slate-500 text-sm">{t.connect.step_3_desc}</p>
              </div>
            </div>

            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                <span className="text-xs font-mono text-slate-500">{t.connect.snippet_label}</span>
                <button
                  onClick={() => handleCopy(snippet, 'snippet')}
                  className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  {copied === 'snippet' ? <><CheckCircle size={12} /> {t.connect.copied}</> : <><Copy size={12} /> {t.connect.copy}</>}
                </button>
              </div>
              <pre className="p-4 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {snippet}
              </pre>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Link
                to={`/receipts`}
                className="py-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Activity size={18} /> {t.connect.btn_feed}
              </Link>
              <Link
                to="/docs"
                className="py-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {t.connect.btn_docs} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {step === 3 && tenantId && (
        <div className="mt-8 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <CheckCircle size={14} className="text-emerald-500" />
              <span>{t.connect.fleet_ready}: <span className="text-white font-mono">{fleetName}</span></span>
            </div>
            <Link to="/receipts" className="text-primary hover:text-white transition-colors flex items-center gap-1 text-xs">
              {t.connect.view_feed} <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
