/**
 * Storage types for manifest persistence
 */

export interface ExecutionManifest {
  // Version fields (M4.2)
  manifestVersion?: string; // e.g., "2.0"
  schemaVersion?: string; // e.g., "2025-12-15"
  serviceModuleVersion?: string; // e.g., "1.0"
  // Core fields
  jobId: number;
  robotId: string;
  controller: string;
  serviceType: string;
  startTs: number;
  endTs: number;
  routeDigest?: string;
  artifacts?: Array<{
    type: string;
    sha256: string;
    bytes: number;
  }>;
  inspection?: {
    coverageVisited: number;
    coverageTotal: number;
  };
  patrol?: {
    checkpointsVisited: string[];
    dwellSeconds: number[];
  };
  delivery?: {
    pickupProofHash?: string;
    dropoffProofHash?: string;
  };
}

export interface IManifestStorage {
  /**
   * Store a manifest and return its URL
   */
  store(hash: string, manifest: ExecutionManifest): Promise<string>;

  /**
   * Retrieve a manifest by hash
   */
  retrieve(hash: string): Promise<ExecutionManifest | null>;

  /**
   * Check if manifest exists
   */
  exists(hash: string): Promise<boolean>;

  /**
   * Get the URL for a manifest hash
   */
  getUrl(hash: string): string;

  /**
   * Provider name for logging
   */
  readonly provider: string;
}

export interface StorageConfig {
  provider: 'local' | 'r2' | 's3';
  strict: boolean;
  baseUrl?: string;
  // Local
  dataDir?: string;
  // R2
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Bucket?: string;
  // S3
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Bucket?: string;
  s3Region?: string;
}
