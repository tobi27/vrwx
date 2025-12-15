/**
 * Storage factory and configuration
 *
 * Creates the appropriate storage backend based on environment configuration.
 * Supports: local (dev), r2 (Cloudflare), s3 (AWS)
 */

import type { IManifestStorage, StorageConfig, ExecutionManifest } from './types.js';
import { LocalStorage } from './local.js';
import { R2Storage } from './r2.js';
import { S3Storage } from './s3.js';

export type { IManifestStorage, StorageConfig, ExecutionManifest };
export { LocalStorage, R2Storage, S3Storage };

/**
 * Get storage configuration from environment
 */
export function getStorageConfig(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || 'local') as StorageConfig['provider'];
  const strict = process.env.STRICT_STORAGE === 'true' || process.env.NODE_ENV === 'production';

  return {
    provider,
    strict,
    baseUrl: process.env.STORAGE_BASE_URL,
    // Local
    dataDir: process.env.STORAGE_DATA_DIR || './data/manifests',
    // R2
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    r2Bucket: process.env.R2_BUCKET || 'vrwx-manifests',
    // S3
    s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: process.env.S3_BUCKET || 'vrwx-manifests',
    s3Region: process.env.S3_REGION || 'us-east-1',
  };
}

/**
 * Create storage instance based on configuration
 */
export function createStorage(config?: StorageConfig): IManifestStorage {
  const cfg = config || getStorageConfig();

  switch (cfg.provider) {
    case 'r2':
      if (!cfg.r2AccountId || !cfg.r2AccessKeyId || !cfg.r2SecretAccessKey) {
        throw new Error('R2 storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY');
      }
      return new R2Storage({
        accountId: cfg.r2AccountId,
        accessKeyId: cfg.r2AccessKeyId,
        secretAccessKey: cfg.r2SecretAccessKey,
        bucket: cfg.r2Bucket || 'vrwx-manifests',
        publicUrl: cfg.baseUrl,
      });

    case 's3':
      if (!cfg.s3AccessKeyId || !cfg.s3SecretAccessKey) {
        throw new Error('S3 storage requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
      }
      return new S3Storage({
        accessKeyId: cfg.s3AccessKeyId,
        secretAccessKey: cfg.s3SecretAccessKey,
        bucket: cfg.s3Bucket || 'vrwx-manifests',
        region: cfg.s3Region || 'us-east-1',
        publicUrl: cfg.baseUrl,
      });

    case 'local':
    default:
      return new LocalStorage(cfg.dataDir, cfg.baseUrl || '/manifests');
  }
}

/**
 * Singleton storage instance
 */
let storageInstance: IManifestStorage | null = null;

/**
 * Get or create the storage instance
 */
export function getStorage(): IManifestStorage {
  if (!storageInstance) {
    const config = getStorageConfig();
    storageInstance = createStorage(config);
    console.log(`[Storage] Initialized ${storageInstance.provider} storage (strict=${config.strict})`);
  }
  return storageInstance;
}

/**
 * Check if strict storage mode is enabled
 */
export function isStrictMode(): boolean {
  const config = getStorageConfig();
  return config.strict;
}

/**
 * Store manifest with strict mode enforcement
 *
 * @param hash - Manifest hash
 * @param manifest - Execution manifest
 * @returns URL to stored manifest
 * @throws Error if strict mode enabled and storage fails
 */
export async function storeManifest(hash: string, manifest: ExecutionManifest): Promise<string> {
  const storage = getStorage();
  const strict = isStrictMode();

  try {
    const url = await storage.store(hash, manifest);

    // In strict mode, verify the manifest was stored correctly
    if (strict) {
      const exists = await storage.exists(hash);
      if (!exists) {
        throw new Error(`Manifest ${hash} not found after storage (strict mode)`);
      }
    }

    return url;
  } catch (error) {
    if (strict) {
      throw error;
    }
    // In non-strict mode, log and return a placeholder URL
    console.error(`[Storage] Failed to store manifest ${hash}:`, error);
    return storage.getUrl(hash);
  }
}

/**
 * Retrieve manifest from storage
 *
 * @param hash - Manifest hash
 * @returns Manifest or null if not found
 */
export async function retrieveManifest(hash: string): Promise<ExecutionManifest | null> {
  const storage = getStorage();
  return storage.retrieve(hash);
}
