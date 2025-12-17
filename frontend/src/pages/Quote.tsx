
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Service } from '../types';
import { Calculator, MapPin, Clock, ShieldCheck, ArrowRight, Check, Loader2, DollarSign, Terminal, Info, Wallet } from 'lucide-react';
import { useLanguage, translateServiceType } from '../lib/i18n';
import { useAccount, useWriteContract, useReadContract, USDC_ADDRESS, USDC_ABI, JOB_ESCROW_ADDRESS } from '../lib/wallet';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';

// Quality tier multipliers
const QUALITY_MULT = { standard: 1.0, premium: 1.15, elite: 1.30 };

export const Quote = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [rates, setRates] = useState<{ platformBps: number; minBondRatio: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [offerCreated, setOfferCreated] = useState(false);
  const { t, lang } = useLanguage();

  // Wallet state
  const { address, isConnected } = useAccount();
  const { writeContract, isPending: isApproving } = useWriteContract();

  // Form State
  const [formData, setFormData] = useState({
    serviceId: '',
    location: '',
    units: 1,
    qualityTier: 'standard' as 'standard' | 'premium' | 'elite',
  });

  // Estimate state with full breakdown
  const [estimate, setEstimate] = useState<{
    baseRate: number;
    units: number;
    subtotal: number;
    qualityAdj: number;
    grossTotal: number;
    platformFee: number;
    netReceive: number;
    bondRequired: number;
  } | null>(null);

  useEffect(() => {
    api.getServices().then(setServices);
    api.getRates().then(data => setRates(data.fees));
  }, []);

  // Real-time price calculation
  useEffect(() => {
    if (formData.serviceId && rates) {
      setCalculating(true);
      const timer = setTimeout(() => {
        const service = services.find(s => s.id === formData.serviceId);
        const baseRate = service?.avgPrice || 100;

        const qMult = QUALITY_MULT[formData.qualityTier];
        const subtotal = baseRate * formData.units;
        const qualityAdj = subtotal * (qMult - 1);
        const grossTotal = subtotal + qualityAdj;

        // Platform fee: 2.5% (250 bps)
        const platformFeeRate = rates.platformBps / 10000;
        const platformFee = Math.max(grossTotal * platformFeeRate, 0.05); // min $0.05

        const netReceive = grossTotal - platformFee;
        const bondRequired = grossTotal * rates.minBondRatio;

        setEstimate({
          baseRate,
          units: formData.units,
          subtotal,
          qualityAdj,
          grossTotal,
          platformFee,
          netReceive,
          bondRequired,
        });
        setCalculating(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [formData, services, rates]);

  const handleCreateOffer = async () => {
    if (!isConnected || !estimate) return;

    setLoading(true);
    try {
      // Approve USDC spend (USDC has 6 decimals)
      const amountInUSDC = parseUnits(estimate.grossTotal.toFixed(2), 6);

      writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [JOB_ESCROW_ADDRESS, amountInUSDC],
      });

      // For demo, simulate success after approval
      setTimeout(() => {
        setLoading(false);
        setOfferCreated(true);
      }, 2000);
    } catch (err) {
      console.error('Transaction failed:', err);
      setLoading(false);
    }
  };

  const formatUSD = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-center">
          <Calculator className="text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">{t.quote.title}</h1>
          <p className="text-slate-400 text-sm">{t.quote.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column: Configurator */}
        <div className="lg:col-span-7 space-y-6">

          {/* Service Selection */}
          <div className="bg-surface border border-white/10 p-6 rounded-xl">
            <label className="text-xs font-medium text-slate-400 uppercase mb-4 block">{t.quote.step_1}</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {services.map(s => (
                <button
                  key={s.id}
                  onClick={() => setFormData({...formData, serviceId: s.id})}
                  className={`relative p-4 rounded-lg border text-left transition-all ${
                    formData.serviceId === s.id
                    ? 'bg-primary/10 border-primary text-white'
                    : 'bg-black/20 border-white/10 text-slate-400 hover:border-white/30'
                  }`}
                >
                  <div className="font-bold text-sm mb-1">{translateServiceType(s.name, lang)}</div>
                  <div className="text-xs text-slate-500 font-mono">${s.avgPrice}/unit</div>
                  {formData.serviceId === s.id && (
                    <div className="absolute top-2 right-2 text-primary"><Check size={14} /></div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className={`transition-all duration-300 ${formData.serviceId ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="bg-surface border border-white/10 p-6 rounded-xl space-y-6">
              <label className="text-xs font-medium text-slate-400 uppercase block">{t.quote.step_2}</label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs text-slate-400 mb-2 flex items-center gap-2">
                    <MapPin size={12} /> {t.quote.label_zone}
                  </label>
                  <input
                    type="text"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary transition-all"
                    placeholder="e.g. Zone-1, Building A"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2 flex items-center gap-2">
                    <DollarSign size={12} /> Units
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1" max="50" step="1"
                      className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
                      value={formData.units}
                      onChange={(e) => setFormData({...formData, units: parseInt(e.target.value)})}
                    />
                    <div className="text-primary font-mono font-bold w-12 text-right">{formData.units}</div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-3 flex items-center gap-2">
                  <ShieldCheck size={12} /> {t.quote.label_sla}
                </label>
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                  {(['standard', 'premium', 'elite'] as const).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => setFormData({...formData, qualityTier: tier})}
                      className={`flex-1 py-2.5 text-xs font-medium uppercase rounded transition-all ${
                        formData.qualityTier === tier
                        ? 'bg-white/10 text-white'
                        : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {tier} {tier !== 'standard' && <span className="text-emerald-500/70 ml-1">+{Math.round((QUALITY_MULT[tier] - 1) * 100)}%</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Cost Breakdown */}
        <div className="lg:col-span-5">
          <div className="sticky top-24">
            <div className="bg-[#050810] border border-white/10 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

              <h2 className="text-sm font-bold text-white mb-6 flex items-center gap-2 uppercase border-b border-white/10 pb-4">
                <Calculator size={14} className="text-primary" /> {t.quote.cost_title}
              </h2>

              {!formData.serviceId ? (
                <div className="text-center py-12 text-slate-600 text-sm border border-dashed border-white/10 rounded-lg">
                  {t.quote.wait_input}
                </div>
              ) : calculating ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="animate-spin text-primary" size={24} />
                </div>
              ) : estimate && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Breakdown */}
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-slate-400">
                      <span>{t.quote.base_rate}</span>
                      <span className="font-mono">{formatUSD(estimate.baseRate)} x {estimate.units}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Subtotal</span>
                      <span className="font-mono">{formatUSD(estimate.subtotal)}</span>
                    </div>
                    {estimate.qualityAdj > 0 && (
                      <div className="flex justify-between text-emerald-500/80">
                        <span>Quality ({formData.qualityTier})</span>
                        <span className="font-mono">+{formatUSD(estimate.qualityAdj)}</span>
                      </div>
                    )}
                    <div className="border-t border-white/10 pt-3 flex justify-between text-slate-300">
                      <span>Gross Total</span>
                      <span className="font-mono font-medium">{formatUSD(estimate.grossTotal)}</span>
                    </div>
                    <div className="flex justify-between text-red-400/70">
                      <span className="flex items-center gap-1">
                        Protocol Fee (2.5%)
                        <Info size={10} className="text-slate-600" />
                      </span>
                      <span className="font-mono">-{formatUSD(estimate.platformFee)}</span>
                    </div>
                  </div>

                  {/* Net Total */}
                  <div className="border-t border-white/10 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 text-sm">You Receive</span>
                      <span className="text-3xl font-bold font-mono text-white">
                        {formatUSD(estimate.netReceive)}
                      </span>
                    </div>
                    <div className="text-right text-xs text-slate-500 mt-1">USDC on Base</div>
                  </div>

                  {/* Bond Info */}
                  <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-lg mt-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck size={16} className="text-primary mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-primary mb-1">{t.quote.bonding_title}</div>
                        <p className="text-xs text-slate-400">
                          {formatUSD(estimate.bondRequired)} (10%) - Refunded on completion
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  {!isConnected ? (
                    <div className="mt-4">
                      <ConnectButton.Custom>
                        {({ openConnectModal }) => (
                          <button
                            onClick={openConnectModal}
                            className="w-full py-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                          >
                            <Wallet size={18} /> Connect Wallet to Pay
                          </button>
                        )}
                      </ConnectButton.Custom>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateOffer}
                      disabled={loading || offerCreated || isApproving}
                      className={`w-full py-4 rounded-lg font-bold text-sm uppercase transition-all flex items-center justify-center gap-2 mt-4 ${
                        offerCreated
                        ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30 cursor-default'
                        : 'bg-primary hover:bg-blue-600 text-white'
                      }`}
                    >
                      {loading || isApproving ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : offerCreated ? (
                        <><Check size={18} /> {t.quote.btn_done}</>
                      ) : (
                        <>{t.quote.btn_sign} <ArrowRight size={18} /></>
                      )}
                    </button>
                  )}

                  {offerCreated && (
                    <div className="text-center pt-2 animate-in fade-in">
                      <p className="text-xs text-slate-500 mb-1">{t.quote.offer_confirmed}</p>
                      <a href="https://basescan.org" target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">
                        {t.quote.view_etherscan}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
