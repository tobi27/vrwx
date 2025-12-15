/**
 * Local file-based manifest storage
 * For development and testing
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ExecutionManifest, IManifestStorage } from './types.js';

export class LocalStorage implements IManifestStorage {
  readonly provider = 'local';
  private dataDir: string;
  private baseUrl: string;

  constructor(dataDir: string = './data/manifests', baseUrl: string = '/manifests') {
    this.dataDir = dataDir;
    this.baseUrl = baseUrl;

    // Ensure directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private getFilePath(hash: string): string {
    // Sanitize hash to prevent directory traversal
    const safeHash = hash.replace(/[^a-fA-F0-9x]/g, '');
    return join(this.dataDir, `${safeHash}.json`);
  }

  async store(hash: string, manifest: ExecutionManifest): Promise<string> {
    const filePath = this.getFilePath(hash);

    try {
      const data = JSON.stringify(manifest, null, 2);
      writeFileSync(filePath, data, 'utf-8');
      return this.getUrl(hash);
    } catch (error) {
      throw new Error(`Failed to store manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async retrieve(hash: string): Promise<ExecutionManifest | null> {
    const filePath = this.getFilePath(hash);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as ExecutionManifest;
    } catch (error) {
      console.error(`Failed to read manifest ${hash}:`, error);
      return null;
    }
  }

  async exists(hash: string): Promise<boolean> {
    const filePath = this.getFilePath(hash);
    return existsSync(filePath);
  }

  getUrl(hash: string): string {
    return `${this.baseUrl}/${hash}`;
  }
}
