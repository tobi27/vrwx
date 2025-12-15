export interface Service {
  id: string;
  name: string;
  description: string;
  icon: string;
  avgPrice: number;
}

export interface Offer {
  id: string;
  serviceType: string;
  providerId: string;
  price: number;
  currency: string;
  location: string;
  qualityMin: number;
  expiry: string;
}

export interface Manifest {
  serviceType: string;
  timestamp: string;
  robotId: string;
  geoHash: string;
  dataHash: string;
  metadata: Record<string, any>;
}

export interface Receipt {
  tokenId: string;
  serviceType: string;
  manifestHash: string; // The on-chain hash
  manifestUrl: string;
  status: 'minted' | 'settled' | 'disputed';
  timestamp: string;
  txHash: string;
  operator: string;
  price: number;
}

export interface Metrics {
  gmv: number;
  activeOffers: number;
  totalReceipts: number;
  disputeRate: number;
}
