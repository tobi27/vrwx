/**
 * AWS S3 manifest storage
 * For production use
 */

import type { ExecutionManifest, IManifestStorage } from './types.js';

interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  publicUrl?: string;
}

export class S3Storage implements IManifestStorage {
  readonly provider = 's3';
  private config: S3Config;
  private baseUrl: string;

  constructor(config: S3Config) {
    this.config = config;
    // S3 URL format: https://{bucket}.s3.{region}.amazonaws.com
    // Or custom domain if configured
    this.baseUrl =
      config.publicUrl || `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
  }

  private getKey(hash: string): string {
    return `manifests/${hash}.json`;
  }

  private getEndpoint(): string {
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
  }

  async store(hash: string, manifest: ExecutionManifest): Promise<string> {
    const key = this.getKey(hash);
    const body = JSON.stringify(manifest);
    const url = `${this.getEndpoint()}/${key}`;

    try {
      // Note: In production, use @aws-sdk/client-s3
      // This is a simplified implementation
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          // In production: add AWS SigV4 authorization header
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`S3 PUT failed: ${response.status} ${response.statusText}`);
      }

      return this.getUrl(hash);
    } catch (error) {
      throw new Error(`Failed to store manifest to S3: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async retrieve(hash: string): Promise<ExecutionManifest | null> {
    const key = this.getKey(hash);
    const url = `${this.getEndpoint()}/${key}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          // In production: add AWS SigV4 authorization header
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`S3 GET failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as ExecutionManifest;
    } catch (error) {
      console.error(`Failed to retrieve manifest from S3:`, error);
      return null;
    }
  }

  async exists(hash: string): Promise<boolean> {
    const key = this.getKey(hash);
    const url = `${this.getEndpoint()}/${key}`;

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          // In production: add AWS SigV4 authorization header
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  getUrl(hash: string): string {
    return `${this.baseUrl}/manifests/${hash}.json`;
  }
}
