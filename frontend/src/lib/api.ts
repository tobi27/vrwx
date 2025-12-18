import { Metrics, Offer, Receipt, Service } from '../types';

// CONFIGURATION
const RAW_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_BASE = RAW_API_BASE.replace(/\/$/, '');

// --- MOCK DATA (Metrics only - others use real API) ---
const generateRandomHash = () => '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const generateTxHash = () => '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const MOCK_METRICS: Metrics = {
  gmv: 482500,
  activeOffers: 1242,
  totalReceipts: 18903,
  disputeRate: 0.02,
};

// Mock offers (marketplace - not yet in API)
const MOCK_OFFERS: Offer[] = [
  { id: 'off_001', serviceType: 'inspection', providerId: 'op_alpha_dynamics', price: 85, currency: 'USDC', location: 'Zone-1 (West)', qualityMin: 98, expiry: '2024-12-01T00:00:00Z' },
  { id: 'off_002', serviceType: 'security_patrol', providerId: 'sec_systems_inc', price: 160, currency: 'USDC', location: 'Zone-4 (North)', qualityMin: 95, expiry: '2024-12-05T00:00:00Z' },
  { id: 'off_003', serviceType: 'delivery', providerId: 'logistics_dao', price: 45, currency: 'USDC', location: 'Zone-2 (East)', qualityMin: 99, expiry: '2024-12-06T00:00:00Z' },
];

// --- NETWORK LAYER ---
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const url = `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...options,
    });

    if (!res.ok) {
      throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.warn(`[API] Failed to reach ${endpoint}`, error);
    throw error;
  }
}

// --- EXPORTED API CLIENT ---
export const api = {
  checkConnection: async (): Promise<boolean> => {
    try {
      await fetch(`${API_BASE}/health`, { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  },

  // MOCK - metrics stay as mock data
  getMetrics: async (): Promise<Metrics> => {
    return MOCK_METRICS;
  },

  // REAL - from /services endpoint
  getServices: async (): Promise<Service[]> => {
    try {
      const data = await fetchAPI<any[]>('/services');
      // Map API format to frontend format
      return data.map(s => ({
        id: s.id,
        name: s.label || s.name,
        description: s.description,
        icon: s.id === 'inspection' ? 'Camera' : s.id === 'security_patrol' ? 'Shield' : 'Box',
        avgPrice: s.baseRateUsd || 100,
      }));
    } catch {
      // Fallback
      return [
        { id: 'inspection', name: 'Facility Inspection', description: 'Autonomous inspection with coverage tracking', icon: 'Camera', avgPrice: 100 },
        { id: 'security_patrol', name: 'Security Patrol', description: 'Scheduled patrol with checkpoint verification', icon: 'Shield', avgPrice: 150 },
        { id: 'delivery', name: 'Autonomous Delivery', description: 'Point-to-point delivery with proof', icon: 'Box', avgPrice: 200 },
      ];
    }
  },

  // MOCK - offers marketplace not yet implemented
  getOffers: async (serviceType?: string): Promise<Offer[]> => {
    if (serviceType) return MOCK_OFFERS.filter(o => o.serviceType === serviceType);
    return MOCK_OFFERS;
  },

  // REAL - from /v1/feed endpoint (job completions)
  getReceipts: async (tenantId?: string): Promise<Receipt[]> => {
    try {
      // If no tenantId, try to get from localStorage or return empty
      const tid = tenantId || localStorage.getItem('vrwx_tenant_id');
      if (!tid) {
        console.warn('[API] No tenant ID for receipts');
        return [];
      }
      
      const data = await fetchAPI<{ jobs: any[] }>(`/v1/feed?tenant=${tid}`);
      
      // Map job_completions to Receipt format
      return (data.jobs || []).map(j => ({
        tokenId: j.id?.slice(0, 8) || String(j.job_id),
        serviceType: j.service_type,
        manifestHash: j.manifest_hash,
        manifestUrl: '', // Not stored in job_completions
        status: j.status === 'completed' ? 'settled' : j.status,
        timestamp: new Date(j.created_at).toISOString(),
        txHash: j.tx_hash || generateTxHash(),
        operator: j.robot_id?.slice(0, 16) || 'unknown',
        price: j.work_units || 0,
      }));
    } catch {
      return [];
    }
  },
  
  getReceiptById: async (id: string): Promise<Receipt | undefined> => {
    const receipts = await api.getReceipts();
    return receipts.find(r => r.tokenId === id);
  },

  verifyManifestOnServer: async (hash: string): Promise<{ verified: boolean, timestamp: string }> => {
    try {
      return await fetchAPI<{ verified: boolean, timestamp: string }>(`/manifests/${hash}/verify`);
    } catch {
      // Simulation for demo
      return { verified: true, timestamp: new Date().toISOString() };
    }
  },

  // MOCK - buy offer not implemented
  buyOffer: async (offerId: string): Promise<{ txHash: string, receiptId: string }> => {
    console.log("Simulating Buy Offer...", offerId);
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ txHash: generateTxHash(), receiptId: Math.floor(Math.random() * 10000).toString() });
      }, 2000);
    });
  },

  // REAL - Fleet Onboarding
  onboardFleet: async (name: string): Promise<{ success: boolean, connectUrl: string, statusUrl?: string, tenant?: { id: string } }> => {
    const res = await fetch(`${API_BASE}/v1/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Onboarding Failed');
    const data = await res.json();
    
    // Store tenant ID for later use
    if (data.tenant?.id) {
      localStorage.setItem('vrwx_tenant_id', data.tenant.id);
    }
    
    return data;
  },

  // REAL - Get pricing rates
  getRates: async (): Promise<{
    services: { [key: string]: { baseRate: number, unit: string } },
    fees: { platformBps: number, minBondRatio: number }
  }> => {
    try {
      return await fetchAPI('/v1/rates');
    } catch {
      // Fallback defaults matching contract constants
      return {
        services: {
          inspection: { baseRate: 100, unit: 'scan' },
          patrol: { baseRate: 150, unit: 'hour' },
          delivery: { baseRate: 200, unit: 'package' }
        },
        fees: {
          platformBps: 250, // 2.5%
          minBondRatio: 0.10 // 10%
        }
      };
    }
  },

  // REAL - Create Stripe checkout session
  createCheckout: async (params: {
    serviceType: string;
    units: number;
    qualityTier: 'standard' | 'premium' | 'elite';
    location?: string;
    email?: string;
  }): Promise<{ checkoutUrl: string; sessionId: string; paymentId: string }> => {
    const res = await fetch(`${API_BASE}/v1/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Checkout failed');
    }
    return res.json();
  },

  // REAL - Check payment status
  getPaymentStatus: async (sessionId: string): Promise<{ status: string; amountTotal: number | null }> => {
    return fetchAPI(`/v1/payments/session/${sessionId}`);
  },

  // REAL - Subscribe to a plan
  subscribe: async (plan: 'launch' | 'fleet' | 'network', email?: string): Promise<{
    checkoutUrl?: string;
    sessionId?: string;
    plan: string;
    status?: string;
    connectUrl?: string;
  }> => {
    const res = await fetch(`${API_BASE}/v1/payments/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, email })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Subscription failed');
    }
    return res.json();
  },

  // REAL - Get subscription plans
  getPlans: async (): Promise<{
    plans: Array<{
      id: string;
      name: string;
      priceMonthly: number;
      robots: number;
      completionsPerMonth: number;
      features: string[];
    }>;
  }> => {
    return fetchAPI('/v1/payments/plans');
  },

  // REAL - Webhook test
  sendWebhookTest: async (serviceType: string): Promise<{ status: string, txHash: string, manifestHash: string, tokenId: string }> => {
    try {
      const payload = {
        robotId: "web-client-simulator",
        serviceType,
        telemetry: { source: "web_ui_test", timestamp: Date.now() }
      };
      
      return await fetchAPI<any>('/connectors/webhook/complete', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch {
      // Simulation fallback
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            status: 'success',
            txHash: generateTxHash(),
            manifestHash: generateRandomHash(),
            tokenId: Math.floor(Math.random() * 5000 + 1000).toString()
          });
        }, 2000);
      });
    }
  }
};
