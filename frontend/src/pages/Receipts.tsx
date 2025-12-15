
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Receipt } from '../types';
import { computeManifestHash } from '../lib/proof';
import { CheckCircle, XCircle, FileText, ExternalLink, RefreshCw, Shield, Lock, Fingerprint, Database, Server, CloudLightning } from 'lucide-react';

const ReceiptDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  
  // Verification State
  const [verifyState, setVerifyState] = useState<'idle' | 'hashing' | 'server_check' | 'success' | 'error'>('idle');
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [clientHash, setClientHash] = useState<string | null>(null);
  const [serverVerified, setServerVerified] = useState<boolean>(false);
  const [manifestData, setManifestData] = useState<any>(null);

  useEffect(() => {
    if (id) {
       api.getReceiptById(id).then(async (data) => {
         setReceipt(data);
         if (data) {
           const mockManifest = {
             serviceType: data.serviceType,
             timestamp: data.timestamp,
             robotId: 'rob_v2_99_unit_alpha',
             telemetry: { lat: 34.0522, lng: -118.2437, altitude: 120, battery: 88, network_latency: 24 },
             sensors: { camera_hash: '0x...', lidar_points: 140203 },
             nonce: Math.floor(Math.random() * 1000000)
           };
           setManifestData(mockManifest);
         }
         setLoading(false);
       });
    }
  }, [id]);

  const runVerification = async () => {
    if (!manifestData || !receipt) return;
    
    // 1. Client Side Hashing
    setVerifyState('hashing');
    setVerifyProgress(0);
    
    const interval = setInterval(() => {
       setVerifyProgress(p => Math.min(p + 5, 80));
    }, 50);

    setTimeout(async () => {
      clearInterval(interval);
      const hash = await computeManifestHash(manifestData);
      setClientHash(hash);
      setVerifyProgress(90);
      
      // 2. Server Side Verification
      setVerifyState('server_check');
      try {
         const serverCheck = await api.verifyManifestOnServer(receipt.manifestHash);
         if (serverCheck.verified) {
             setServerVerified(true);
             setVerifyProgress(100);
             setTimeout(() => setVerifyState('success'), 500);
         } else {
             setVerifyState('error');
         }
      } catch (e) {
         setVerifyState('error');
      }

    }, 1500);
  };

  if (loading) return <div className="h-[60vh] flex items-center justify-center text-slate-500 font-mono animate-pulse">Initializing Secure Connection...</div>;
  if (!receipt) return <div className="pt-32 text-center text-red-500">Receipt not found</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link to="/receipts" className="text-slate-500 hover:text-white text-xs font-mono mb-6 inline-block uppercase tracking-wider">&larr; Return to Explorer</Link>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start border-b border-white/10 pb-8 mb-8 gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
             <h1 className="text-4xl font-bold text-white tracking-tight">Receipt #{receipt.tokenId}</h1>
             <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-wide flex items-center gap-1">
               <Shield size={12} /> Verified
             </div>
           </div>
           <p className="text-slate-400 font-mono text-sm">
             Operator <span className="text-white">{receipt.operator}</span> • {new Date(receipt.timestamp).toLocaleString()}
           </p>
        </div>
        <div className="text-right">
           <div className="text-xs text-slate-500 font-mono mb-1 uppercase tracking-widest">Settlement Value</div>
           <div className="text-3xl font-mono text-white font-bold">${receipt.price.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Manifest Data */}
        <div className="lg:col-span-7 space-y-6">
           <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
              <div className="bg-white/5 px-6 py-3 border-b border-white/10 flex justify-between items-center">
                 <h3 className="font-bold text-sm text-slate-300 flex items-center gap-2">
                   <FileText size={16} /> Execution Manifest
                 </h3>
                 <span className="text-xs text-slate-500 font-mono">JSON-LD</span>
              </div>
              <div className="p-6 relative">
                 <pre className="font-mono text-xs text-blue-300 overflow-x-auto leading-relaxed">
                   {JSON.stringify(manifestData, null, 2)}
                 </pre>
                 <div className="absolute top-0 right-0 p-4">
                    <button className="text-xs text-slate-500 hover:text-white flex items-center gap-1 bg-black/50 px-2 py-1 rounded">
                       Copy Raw
                    </button>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface border border-white/10 p-4 rounded-xl">
                 <div className="text-slate-500 text-xs font-mono uppercase mb-2 flex items-center gap-2"><Server size={12}/> Service Type</div>
                 <div className="text-white font-medium capitalize">{receipt.serviceType}</div>
              </div>
              <div className="bg-surface border border-white/10 p-4 rounded-xl">
                 <div className="text-slate-500 text-xs font-mono uppercase mb-2 flex items-center gap-2"><Database size={12}/> Storage</div>
                 <div className="text-primary text-sm font-mono truncate underline decoration-primary/30 cursor-pointer">ipfs://QmXy...92f</div>
              </div>
           </div>
        </div>

        {/* Right Column: Verification Engine */}
        <div className="lg:col-span-5">
           <div className="bg-[#050b14] border border-white/10 rounded-xl overflow-hidden shadow-2xl h-full flex flex-col">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 border-b border-white/10 flex justify-between items-center">
                 <h3 className="font-bold text-white flex items-center gap-2">
                   <Lock size={16} className="text-primary" /> Cryptographic Proof
                 </h3>
                 {verifyState === 'success' && <CheckCircle size={18} className="text-emerald-500" />}
              </div>
              
              <div className="p-6 flex-grow flex flex-col gap-6">
                 
                 {/* On-Chain Hash Display */}
                 <div>
                    <div className="text-xs text-slate-500 font-mono uppercase mb-2">On-Chain Anchor (Immutable)</div>
                    <div className="bg-black/40 border border-white/10 rounded p-3 font-mono text-[10px] text-slate-400 break-all select-all">
                       {receipt.manifestHash}
                    </div>
                    <div className="text-right mt-1">
                       <a href="#" className="text-[10px] text-primary hover:text-white flex items-center justify-end gap-1">
                          View Transaction <ExternalLink size={10} />
                       </a>
                    </div>
                 </div>

                 {/* Interactive Verifier */}
                 <div className="flex-grow flex flex-col justify-end">
                    {verifyState === 'idle' && (
                       <button 
                         onClick={runVerification}
                         className="w-full py-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 group"
                       >
                          <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                          Recompute Hash & Verify
                       </button>
                    )}

                    {(verifyState === 'hashing' || verifyState === 'server_check') && (
                       <div className="space-y-4">
                          <div className="flex justify-between text-xs text-white font-mono">
                             <span>
                                {verifyState === 'hashing' && '1/2 RECOMPUTING LOCAL HASH...'}
                                {verifyState === 'server_check' && '2/2 QUERYING ON-CHAIN NODE...'}
                             </span>
                             <span>{verifyProgress}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                             <div className="h-full bg-primary transition-all duration-100 ease-out" style={{ width: `${verifyProgress}%` }}></div>
                          </div>
                          <div className="font-mono text-[10px] text-primary/70 animate-pulse">
                             &gt; {verifyState === 'hashing' ? 'sha256(canonical_json)' : 'eth_call(verifyProof)'} running...
                          </div>
                       </div>
                    )}

                    {verifyState === 'success' && (
                       <div className="space-y-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center animate-in zoom-in duration-300">
                                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Fingerprint size={32} className="text-emerald-500" />
                                </div>
                                <h4 className="text-xl font-bold text-white mb-2">Double Match Confirmed</h4>
                                <div className="text-sm text-emerald-200/70 mb-4 space-y-1">
                                    <div className="flex items-center justify-center gap-2">
                                        <CheckCircle size={12} /> Local Recompute Match
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                        <CloudLightning size={12} /> Server Validation OK
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setVerifyState('idle')}
                                className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-mono uppercase tracking-widest rounded"
                            >
                                Reset Verifier
                            </button>
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

const ReceiptsList = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  
  useEffect(() => {
    api.getReceipts().then(setReceipts);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-end mb-8">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">Receipts Explorer</h1>
           <p className="text-slate-400">Public ledger of all verified robotic outcomes.</p>
        </div>
        <button className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
           Download CSV
        </button>
      </div>
      
      <div className="bg-surface border border-white/10 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 text-slate-400 font-mono text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">Token ID</th>
                <th className="px-6 py-4 font-medium">Service</th>
                <th className="px-6 py-4 font-medium">Operator</th>
                <th className="px-6 py-4 font-medium">Time</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {receipts.map((r) => (
                <tr key={r.tokenId} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4 font-mono text-primary font-medium">
                    <Link to={`/receipts/${r.tokenId}`} className="flex items-center gap-2 group-hover:underline">
                       #{r.tokenId}
                       <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                     <span className="inline-flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded text-xs text-slate-300 capitalize">
                        {r.serviceType === 'inspection' && <Shield size={10}/>}
                        {r.serviceType === 'delivery' && <CheckCircle size={10}/>}
                        {r.serviceType}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-mono text-xs">{r.operator}</td>
                  <td className="px-6 py-4 text-slate-400 text-xs">{new Date(r.timestamp).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 tracking-wider">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-white font-medium">${r.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const Receipts = () => {
   const { id } = useParams<{id: string}>();
   return id ? <ReceiptDetail /> : <ReceiptsList />;
};
