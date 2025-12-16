/**
 * VRWX API Configuration
 * Centralized environment variables with sensible defaults
 */

export const config = {
  // Server
  PORT: parseInt(process.env.PORT || '3000'),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Strict Mode (default true in production)
  VRWX_STRICT_PROOF: process.env.VRWX_STRICT_PROOF !== '0',
  VRWX_STORAGE_REQUIRED: process.env.VRWX_STORAGE_REQUIRED !== '0',

  // Schema versioning
  CURRENT_SCHEMA_VERSION: '2025-12-15',
  CURRENT_MANIFEST_VERSION: '2.0',
  VRWX_ACCEPT_SCHEMA_VERSIONS: (
    process.env.VRWX_ACCEPT_SCHEMA_VERSIONS || '2025-12-15,2025-12-01'
  ).split(','),

  // Database (use /tmp on Railway if no volume mounted, or in-memory for testing)
  DATABASE_PATH: process.env.DATABASE_PATH || (process.env.RAILWAY_ENVIRONMENT ? '/tmp/vrwx.db' : './data/vrwx.db'),

  // Chain configuration
  DEFAULT_CHAIN_ID: parseInt(process.env.DEFAULT_CHAIN_ID || '8453'), // Base Mainnet

  // Storage
  STORAGE_PROVIDER: (process.env.STORAGE_PROVIDER || 'local') as
    | 'local'
    | 'r2'
    | 's3',
  STORAGE_DATA_DIR: process.env.STORAGE_DATA_DIR || './data/manifests',
  STORAGE_BASE_URL: process.env.STORAGE_BASE_URL,

  // R2
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET || 'vrwx-manifests',

  // S3
  S3_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  S3_BUCKET: process.env.S3_BUCKET || 'vrwx-manifests',
  S3_REGION: process.env.S3_REGION || 'us-east-1',

  // Idempotency
  IDEMPOTENCY_TTL_MS: parseInt(
    process.env.IDEMPOTENCY_TTL_MS || String(24 * 60 * 60 * 1000)
  ), // 24h default

  // DLQ
  DLQ_MAX_RETRIES: parseInt(process.env.DLQ_MAX_RETRIES || '3'),
  DLQ_BACKOFF_BASE_MS: parseInt(process.env.DLQ_BACKOFF_BASE_MS || '60000'), // 1 min

  // Rate limiting (future)
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED === '1',
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  RATE_LIMIT_WINDOW_MS: parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || '60000'
  ),

  // =========================================
  // Relayer (M4.3)
  // =========================================

  // Relay mode: 'relay' (default) or 'selfSubmit'
  RELAY_MODE: (process.env.RELAY_MODE || 'relay') as 'relay' | 'selfSubmit',

  // Relayer wallet private key (REQUIRED in relay mode)
  RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,

  // RPC endpoint for tx submission
  RPC_URL: process.env.RPC_URL || 'https://mainnet.base.org',

  // Contract addresses (Base Mainnet - from deploy/addresses.base-mainnet.json)
  JOB_ESCROW_ADDRESS: process.env.JOB_ESCROW_ADDRESS || '0x7B55CD2614d42E328622E13E2F04c6A4044dCf8B',
  IDENTITY_REGISTRY_ADDRESS: process.env.IDENTITY_REGISTRY_ADDRESS || '0x1f9Aa1738428a8b81798C79F571a61f0C2A8658b',
  STABLE_TOKEN_ADDRESS: process.env.STABLE_TOKEN_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  VRWX_TOKEN_ADDRESS: process.env.VRWX_TOKEN_ADDRESS || '0x47f81Aa69BA606552201E5b4Ba9827d340fe23A4',
  BOND_MANAGER_ADDRESS: process.env.BOND_MANAGER_ADDRESS || '0xA0d9224a0528695383ECF8d1a7F62b5E32de79C4',
  USDC_ADDRESS: process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',

  // API Base URL (for webhook snippets in onboarding)
  API_BASE_URL: process.env.API_BASE_URL,

  // Encryption key for temporary secrets storage (M4.5)
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,

  // Gas settings
  GAS_LIMIT_MULTIPLIER: parseFloat(process.env.GAS_LIMIT_MULTIPLIER || '1.2'),
  MAX_FEE_PER_GAS_GWEI: parseFloat(process.env.MAX_FEE_PER_GAS_GWEI || '50'),
  MAX_PRIORITY_FEE_GWEI: parseFloat(process.env.MAX_PRIORITY_FEE_GWEI || '1'),

  // =========================================
  // Tenant Billing (M4.3)
  // =========================================

  // Billing mode: 'onchain' (immediate) or 'custodial' (queue if no funds/terms)
  TENANT_BILLING_MODE: (process.env.TENANT_BILLING_MODE || 'onchain') as 'onchain' | 'custodial',

  // Custodial mode settings
  CUSTODIAL_QUEUE_ENABLED: process.env.CUSTODIAL_QUEUE_ENABLED === '1',
  CUSTODIAL_DENY_ON_NO_TERMS: process.env.CUSTODIAL_DENY_ON_NO_TERMS === '1',
} as const;

// Validate critical config on startup
export function validateConfig(): void {
  if (config.NODE_ENV === 'production') {
    if (!config.VRWX_STRICT_PROOF) {
      console.warn(
        '[CONFIG] WARNING: VRWX_STRICT_PROOF=0 in production is not recommended'
      );
    }
    if (!config.VRWX_STORAGE_REQUIRED) {
      console.warn(
        '[CONFIG] WARNING: VRWX_STORAGE_REQUIRED=0 in production is not recommended'
      );
    }
  }

  // Relayer validation
  if (config.RELAY_MODE === 'relay') {
    if (!config.RELAYER_PRIVATE_KEY) {
      throw new Error(
        '[CONFIG] RELAYER_PRIVATE_KEY is required when RELAY_MODE=relay'
      );
    }
    console.log('[CONFIG] Relay mode enabled - API will submit transactions');
  } else {
    console.log('[CONFIG] SelfSubmit mode - clients submit their own transactions');
  }

  // Log contract addresses
  console.log(`[CONFIG] JobEscrow: ${config.JOB_ESCROW_ADDRESS}`);
  console.log(`[CONFIG] IdentityRegistry: ${config.IDENTITY_REGISTRY_ADDRESS}`);
  console.log(`[CONFIG] Chain ID: ${config.DEFAULT_CHAIN_ID}`);
  console.log(`[CONFIG] Billing mode: ${config.TENANT_BILLING_MODE}`);
}

// Service module versions (for manifest versioning)
export const SERVICE_MODULE_VERSIONS: Record<string, string> = {
  inspection: '1.0',
  security_patrol: '1.0',
  delivery: '1.0',
};

export function getServiceModuleVersion(serviceType: string): string {
  return SERVICE_MODULE_VERSIONS[serviceType] || '1.0';
}
