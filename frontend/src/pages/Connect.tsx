
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Copy, Terminal, CheckCircle, Zap, Wifi, Activity, Radio, Server, Anchor, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

const SignalVisualizer = ({ active }: { active: boolean }) => {
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const { t } = useLanguage();
   
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      let animationId: number;
      let offset = 0;
      
      const draw = () => {
         ctx.clearRect(0, 0, canvas.width, canvas.height);
         ctx.lineWidth = 2;
         
         const width = canvas.width;
         const height = canvas.height;
         const centerY = height / 2;
         
         // Draw grid line
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
         ctx.beginPath();
         ctx.moveTo(0, centerY);
         ctx.lineTo(width, centerY);
         ctx.stroke();

         if (active) {
            // Signal Wave
            ctx.strokeStyle = '#10b981';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#10b981';
            ctx.beginPath();
            
            for (let x = 0; x < width; x++) {
               const y = centerY + Math.sin((x + offset) * 0.05) * 20 * Math.sin((x) * 0.01) + (Math.random() - 0.5) * 5;
               if (x === 0) ctx.moveTo(x, y);
               else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            offset += 2;
         } else {
            // Noise
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
            ctx.beginPath();
            for (let x = 0; x < width; x+=2) {
               const y = centerY + (Math.random() - 0.5) * 10;
               if (x === 0) ctx.moveTo(x, y);
               else ctx.lineTo(x, y);
            }
            ctx.stroke();
         }
         
         animationId = requestAnimationFrame(draw);
      };
      
      draw();
      return () => cancelAnimationFrame(animationId);
   }, [active]);
   
   return (
      <div className="w-full h-32 bg-black/80 border border-white/10 rounded-lg overflow-hidden relative">
         <canvas ref={canvasRef} width={600} height={128} className="w-full h-full" />
         <div className="absolute top-2 left-2 text-[10px] font-mono flex items-center gap-2">
            <Radio size={12} className={active ? "text-emerald-500 animate-pulse" : "text-red-500"} />
            <span className={active ? "text-emerald-500" : "text-red-500"}>
               {active ? t.connect.signal_lock : t.connect.no_carrier}
            </span>
         </div>
      </div>
   )
}

export const Connect = () => {
  const [service, setService] = useState('inspection');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  // Onboarding State
  const [fleetName, setFleetName] = useState('');
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  
  const { t } = useLanguage();

  // Determine API URL based on environment for display
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const displayEndpoint = `${baseUrl.replace(/\/$/, '')}/connectors/webhook/complete`;
  
  const payloads: Record<string, any> = {
    inspection: { robotId: "bot_123", serviceType: "inspection", telemetry: { lat: 34.05, lng: -118.24 }, resultData: { images: ["ipfs://Qm..."] } },
    patrol: { robotId: "guard_01", serviceType: "patrol", duration: 3600, routeHash: "0xabc...", incidents: [] },
    delivery: { robotId: "drone_x", serviceType: "delivery", orderId: "ord_999", signature: "0x123..." }
  };

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.sendWebhookTest(service);
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardLoading(true);
    setOnboardError(null);
    try {
      const data = await api.onboardFleet(fleetName);
      if (data.success && data.connectUrl) {
         window.location.href = data.connectUrl;
      } else {
         throw new Error("Invalid response from VRWX API");
      }
    } catch (err) {
       setOnboardError("Failed to reach VRWX Mainnet. CORS or Network Error.");
    } finally {
       setOnboardLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-2 glitch" data-text={t.connect.title}>{t.connect.title}</h1>
        <p className="text-slate-400 font-mono text-sm">{t.connect.subtitle}</p>
      </div>

      {/* --- PRODUCTION ONBOARDING SECTION --- */}
      <div className="bg-[#050810] border border-emerald-500/30 rounded-xl p-8 mb-16 relative overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.1)] group">
         <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
         
         <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
            <div className="flex-1">
               <div className="flex items-center gap-2 mb-2 text-emerald-500">
                  <Anchor size={20} />
                  <h2 className="font-mono font-bold text-sm tracking-widest uppercase">{t.connect.section_onboard}</h2>
               </div>
               <p className="text-slate-400 text-sm max-w-md">
                  {t.connect.onboard_desc}
               </p>
            </div>

            <form onSubmit={handleOnboard} className="flex-1 w-full flex flex-col gap-4">
               {onboardError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-xs font-mono flex items-center gap-2">
                     <AlertCircle size={14} /> {onboardError}
                  </div>
               )}
               <div className="space-y-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                     <Server size={10} /> {t.connect.fleet_name}
                  </label>
                  <input 
                     type="text" 
                     required
                     value={fleetName}
                     onChange={(e) => setFleetName(e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-700"
                     placeholder="e.g. OMEGA_LOGISTICS_01"
                  />
               </div>
               <button 
                  type="submit"
                  disabled={onboardLoading}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-mono text-sm uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2"
               >
                  {onboardLoading ? (
                     <><Loader2 className="animate-spin" size={16} /> {t.connect.redirecting}</>
                  ) : (
                     <>{t.connect.btn_onboard} <ChevronRight size={16} /></>
                  )}
               </button>
            </form>
         </div>
      </div>

      <div className="flex items-center gap-4 mb-8">
         <div className="h-px bg-white/10 flex-grow"></div>
         <span className="text-xs font-mono text-slate-500 uppercase">{t.connect.section_sim}</span>
         <div className="h-px bg-white/10 flex-grow"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start opacity-70 hover:opacity-100 transition-opacity">
         
         {/* Controls */}
         <div className="space-y-6">
            <div className="bg-surface/50 border border-white/10 p-1 rounded-lg flex">
               {['inspection', 'patrol', 'delivery'].map(k => (
                  <button 
                     key={k}
                     onClick={() => { setService(k); setResult(null); }}
                     className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all rounded ${service === k ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  >
                     {k}
                  </button>
               ))}
            </div>

            <div className="bg-surface border border-white/10 rounded-xl p-6 relative group overflow-hidden">
               
               {/* Endpoint Display */}
               <div className="mb-6 bg-black/40 border border-white/10 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2 text-xs font-mono text-slate-500">
                     <Server size={12} /> {t.connect.endpoint_label}
                  </div>
                  <div className="font-mono text-[10px] text-blue-300 break-all select-all flex justify-between items-center gap-2">
                     {displayEndpoint}
                     <Copy size={12} className="cursor-pointer hover:text-white transition-colors flex-shrink-0" />
                  </div>
               </div>

               <div className="absolute top-0 right-0 p-2 opacity-50 pointer-events-none">
                  <Terminal className="text-slate-700 w-24 h-24 rotate-12" />
               </div>
               
               <label className="text-xs font-mono text-primary mb-2 block">{t.connect.payload_label}</label>
               <pre className="bg-[#050810] p-4 rounded border border-white/5 text-[10px] font-mono text-slate-300 overflow-x-auto relative z-10 custom-scrollbar">
                  {JSON.stringify(payloads[service], null, 2)}
               </pre>

               <button 
                 onClick={handleTest}
                 disabled={loading}
                 className="mt-6 w-full py-4 bg-primary/20 hover:bg-primary text-primary hover:text-white border border-primary/50 font-bold font-mono text-sm uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2 relative z-10 overflow-hidden"
               >
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                  {loading ? t.connect.btn_transmitting : <><Zap size={16} /> {t.connect.btn_transmit}</>}
               </button>
            </div>
         </div>

         {/* Monitor */}
         <div className="space-y-6">
            <SignalVisualizer active={loading || !!result} />
            
            <div className="bg-[#050810] border border-white/10 rounded-xl p-6 min-h-[300px] font-mono text-xs relative shadow-2xl">
               <div className="absolute top-0 left-0 right-0 h-6 bg-white/5 border-b border-white/5 flex items-center px-4 justify-between">
                  <span className="text-slate-500">{t.connect.terminal_title}</span>
                  <div className="flex gap-1">
                     <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                     <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                     <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
                  </div>
               </div>
               
               <div className="pt-6 space-y-2">
                  <div className="text-slate-500">{t.connect.log_init}</div>
                  <div className="text-slate-500">{t.connect.log_wait}</div>
                  
                  {loading && (
                     <>
                        <div className="text-blue-400">{t.connect.log_encrypt}</div>
                        <div className="text-blue-400">{t.connect.log_handshake}</div>
                        <div className="text-blue-400 animate-pulse">{t.connect.log_upload}</div>
                     </>
                  )}

                  {result && (
                     <>
                        <div className="text-emerald-500">{t.connect.log_confirm}</div>
                        <div className="pl-4 border-l-2 border-white/10 py-2 my-2 space-y-1">
                           <div className="text-slate-300">TX: <span className="text-blue-400 cursor-pointer hover:underline">{result.txHash.substring(0, 20)}...</span></div>
                           <div className="text-slate-300">TOKEN_ID: <span className="text-white font-bold">#{result.tokenId}</span></div>
                           <div className="text-slate-300">HASH: {result.manifestHash.substring(0, 20)}...</div>
                        </div>
                        <div className="text-emerald-500">{t.connect.log_mint}</div>
                        <div className="text-slate-500">{t.connect.log_close}</div>
                     </>
                  )}
               </div>
            </div>
         </div>

      </div>
    </div>
  );
};
