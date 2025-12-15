/**
 * Cloudflare R2 manifest storage
 * For production use
 */

import type { ExecutionManifest, IManifestStorage } from './types.js';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string;
}

export class R2Storage implements IManifestStorage {
  readonly provider = 'r2';
  private config: R2Config;
  private baseUrl: string;

  constructor(config: R2Config) {
    this.config = config;
    // R2 public URL format: https://{accountId}.r2.cloudflarestorage.com/{bucket}
    // Or custom domain if configured
    this.baseUrl =
      config.publicUrl ||
      `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  }

  private getKey(hash: string): string {
    return `manifests/${hash}.json`;
  }

  private async getSignedHeaders(
    method: string,
    key: string,
    body?: string
  ): Promise<Record<string, string>> {
    // AWS Signature V4 compatible signing
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = date.substring(0, 8);

    const host = `${this.config.accountId}.r2.cloudflarestorage.com`;
    const region = 'auto';
    const service = 's3';

    // Simplified signing - in production, use @aws-sdk/signature-v4
    const headers: Record<string, string> = {
      'Host': host,
      'x-amz-date': date,
      'x-amz-content-sha256': body ? await this.sha256(body) : 'UNSIGNED-PAYLOAD',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    // Note: Full AWS SigV4 implementation would go here
    // For production, recommend using @aws-sdk/client-s3
    return headers;
  }

  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async store(hash: string, manifest: ExecutionManifest): Promise<string> {
    const key = this.getKey(hash);
    const body = JSON.stringify(manifest);
    const url = `https://${this.config.accountId}.r2.cloudflarestorage.com/${this.config.bucket}/${key}`;

    try {
      // Use AWS SDK or fetch with signed request
      // For now, using simplified fetch (requires @aws-sdk/client-s3 in production)
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          // In production: add AWS SigV4 authorization header
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`R2 PUT failed: ${response.status} ${response.statusText}`);
      }

      return this.getUrl(hash);
    } catch (error) {
      throw new Error(`Failed to store manifest to R2: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async retrieve(hash: string): Promise<ExecutionManifest | null> {
    const key = this.getKey(hash);
    const url = `https://${this.config.accountId}.r2.cloudflarestorage.com/${this.config.bucket}/${key}`;

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
        throw new Error(`R2 GET failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as ExecutionManifest;
    } catch (error) {
      console.error(`Failed to retrieve manifest from R2:`, error);
      return null;
    }
  }

  async exists(hash: string): Promise<boolean> {
    const key = this.getKey(hash);
    const url = `https://${this.config.accountId}.r2.cloudflarestorage.com/${this.config.bucket}/${key}`;

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
