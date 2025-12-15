/**
 * Golden Hash Tests
 *
 * These tests ensure that manifest hashing is deterministic and
 * that the same manifest always produces the same hash.
 *
 * Run with: pnpm test
 */

import { describe, it, expect } from 'vitest';
import { hashManifest, canonicalizeManifest } from '../index.js';

// ============================================================================
// Golden Test Fixtures
// ============================================================================

const INSPECTION_MANIFEST = {
  manifestVersion: '2.0',
  schemaVersion: '2025-12-15',
  serviceModuleVersion: '1.0',
  jobId: 1001,
  robotId: 'robot-inspect-001',
  controller: '0x1234567890123456789012345678901234567890',
  serviceType: 'inspection' as const,
  startTs: 1702500000,
  endTs: 1702500400,
  artifacts: [
    { type: 'thermal_scan', sha256: 'abc123def456789...', bytes: 2048 },
    { type: 'photo', sha256: 'xyz987abc654321...', bytes: 4096 },
  ],
  inspection: {
    coverageVisited: 45,
    coverageTotal: 50,
  },
};

const PATROL_MANIFEST = {
  manifestVersion: '2.0',
  schemaVersion: '2025-12-15',
  serviceModuleVersion: '1.0',
  jobId: 2001,
  robotId: 'robot-patrol-001',
  controller: '0x2345678901234567890123456789012345678901',
  serviceType: 'security_patrol' as const,
  startTs: 1702510000,
  endTs: 1702510500,
  patrol: {
    checkpointsVisited: ['cp-1', 'cp-2', 'cp-3', 'cp-4'],
    dwellSeconds: [35, 40, 30, 45],
  },
};

const DELIVERY_MANIFEST = {
  manifestVersion: '2.0',
  schemaVersion: '2025-12-15',
  serviceModuleVersion: '1.0',
  jobId: 3001,
  robotId: 'robot-delivery-001',
  controller: '0x3456789012345678901234567890123456789012',
  serviceType: 'delivery' as const,
  startTs: 1702520000,
  endTs: 1702520700,
  delivery: {
    pickupProofHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    dropoffProofHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('Manifest Hashing', () => {
  describe('Determinism', () => {
    it('should produce identical hashes for identical manifests', () => {
      const hash1 = hashManifest(INSPECTION_MANIFEST);
      const hash2 = hashManifest(INSPECTION_MANIFEST);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should produce identical hashes regardless of property order', () => {
      // Create manifest with properties in different order
      const reorderedManifest = {
        serviceType: 'inspection',
        robotId: 'robot-inspect-001',
        jobId: 1001,
        controller: '0x1234567890123456789012345678901234567890',
        manifestVersion: '2.0',
        schemaVersion: '2025-12-15',
        serviceModuleVersion: '1.0',
        endTs: 1702500400,
        startTs: 1702500000,
        inspection: {
          coverageTotal: 50,
          coverageVisited: 45,
        },
        artifacts: [
          { sha256: 'abc123def456789...', type: 'thermal_scan', bytes: 2048 },
          { bytes: 4096, type: 'photo', sha256: 'xyz987abc654321...' },
        ],
      };

      const hash1 = hashManifest(INSPECTION_MANIFEST);
      const hash2 = hashManifest(reorderedManifest);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different manifests', () => {
      const hash1 = hashManifest(INSPECTION_MANIFEST);
      const hash2 = hashManifest(PATROL_MANIFEST);
      const hash3 = hashManifest(DELIVERY_MANIFEST);

      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
      expect(hash1).not.toBe(hash3);
    });

    it('should produce different hashes when a single field changes', () => {
      const modifiedManifest = {
        ...INSPECTION_MANIFEST,
        inspection: {
          ...INSPECTION_MANIFEST.inspection,
          coverageVisited: 46, // Changed from 45
        },
      };

      const hash1 = hashManifest(INSPECTION_MANIFEST);
      const hash2 = hashManifest(modifiedManifest);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Canonicalization', () => {
    it('should produce consistent JSON for identical manifests', () => {
      const canonical1 = canonicalizeManifest(INSPECTION_MANIFEST);
      const canonical2 = canonicalizeManifest(INSPECTION_MANIFEST);

      expect(canonical1).toBe(canonical2);
    });

    it('should sort object keys alphabetically', () => {
      const manifest = {
        z: 1,
        a: 2,
        m: 3,
      };

      const canonical = canonicalizeManifest(manifest as any);
      const parsed = JSON.parse(canonical);
      const keys = Object.keys(parsed);

      expect(keys).toEqual(['a', 'm', 'z']);
    });

    it('should handle nested objects', () => {
      const manifest = {
        outer: {
          z: 1,
          a: 2,
        },
      };

      const canonical = canonicalizeManifest(manifest as any);
      expect(canonical).toContain('"a":2');
      expect(canonical).toContain('"z":1');
    });

    it('should preserve array order', () => {
      const manifest = {
        arr: [3, 1, 2],
      };

      const canonical = canonicalizeManifest(manifest as any);
      expect(canonical).toBe('{"arr":[3,1,2]}');
    });
  });

  describe('Service Types', () => {
    it('should hash inspection manifest correctly', () => {
      const hash = hashManifest(INSPECTION_MANIFEST);
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should hash patrol manifest correctly', () => {
      const hash = hashManifest(PATROL_MANIFEST);
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should hash delivery manifest correctly', () => {
      const hash = hashManifest(DELIVERY_MANIFEST);
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('Version Fields', () => {
    it('should include version fields in hash', () => {
      const withVersion = {
        ...INSPECTION_MANIFEST,
        manifestVersion: '2.0',
      };

      const withDifferentVersion = {
        ...INSPECTION_MANIFEST,
        manifestVersion: '3.0',
      };

      const hash1 = hashManifest(withVersion);
      const hash2 = hashManifest(withDifferentVersion);

      expect(hash1).not.toBe(hash2);
    });

    it('should include schemaVersion in hash', () => {
      const v1 = {
        ...INSPECTION_MANIFEST,
        schemaVersion: '2025-12-15',
      };

      const v2 = {
        ...INSPECTION_MANIFEST,
        schemaVersion: '2025-12-01',
      };

      const hash1 = hashManifest(v1);
      const hash2 = hashManifest(v2);

      expect(hash1).not.toBe(hash2);
    });
  });
});

describe('Idempotency', () => {
  it('should produce identical hash when called 100 times', () => {
    const hashes: string[] = [];

    for (let i = 0; i < 100; i++) {
      hashes.push(hashManifest(INSPECTION_MANIFEST));
    }

    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1);
  });
});
