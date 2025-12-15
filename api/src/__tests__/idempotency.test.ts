/**
 * Idempotency Tests (M4.3)
 *
 * Tests that replay 10x produces identical txHash/response.
 * This validates the anti-replay mechanism works correctly.
 *
 * Run with: pnpm test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  withIdempotency,
  generateIdempotencyKey,
  hashRequest,
  getIdempotencyRecord,
  cleanupExpiredIdempotency,
  getIdempotencyStats,
  IdempotencyConflictError,
} from '../middleware/idempotency.js';
import { initDatabase, closeDatabase, execute } from '../db/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_REQUEST = {
  serviceType: 'inspection',
  jobId: 1001,
  robotId: '0x1234567890123456789012345678901234567890123456789012345678901234',
  controller: '0x1234567890123456789012345678901234567890',
  eventBundle: [],
  inspection: { coverageVisited: 45, coverageTotal: 50 },
};

const SAMPLE_RESPONSE = {
  accepted: true,
  success: true,
  jobId: 1001,
  manifestHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  txHash: '0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef',
  blockNumber: 12345,
  gasUsed: '150000',
};

// ============================================================================
// Setup/Teardown
// ============================================================================

describe('Idempotency', () => {
  beforeEach(() => {
    // Use in-memory database for tests
    process.env.DATABASE_PATH = ':memory:';
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
  });

  // ============================================================================
  // Key Generation Tests
  // ============================================================================

  describe('Key Generation', () => {
    it('should generate consistent keys for same chainId and jobId', () => {
      const key1 = generateIdempotencyKey(8453, 1001);
      const key2 = generateIdempotencyKey(8453, 1001);

      expect(key1).toBe(key2);
      expect(key1).toBe('base:8453:job:1001');
    });

    it('should generate different keys for different jobIds', () => {
      const key1 = generateIdempotencyKey(8453, 1001);
      const key2 = generateIdempotencyKey(8453, 1002);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different chainIds', () => {
      const key1 = generateIdempotencyKey(8453, 1001);
      const key2 = generateIdempotencyKey(1, 1001);

      expect(key1).not.toBe(key2);
    });
  });

  // ============================================================================
  // Request Hashing Tests
  // ============================================================================

  describe('Request Hashing', () => {
    it('should produce consistent hashes for identical requests', () => {
      const hash1 = hashRequest(SAMPLE_REQUEST);
      const hash2 = hashRequest(SAMPLE_REQUEST);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different requests', () => {
      const hash1 = hashRequest(SAMPLE_REQUEST);
      const hash2 = hashRequest({ ...SAMPLE_REQUEST, jobId: 1002 });

      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================================
  // Core Idempotency Tests
  // ============================================================================

  describe('Replay Idempotency (10x)', () => {
    it('should return identical response for 10 replays of same request', async () => {
      const key = generateIdempotencyKey(8453, 1001);
      const requestHash = hashRequest(SAMPLE_REQUEST);
      const manifestHash = SAMPLE_RESPONSE.manifestHash;

      const results: typeof SAMPLE_RESPONSE[] = [];
      let handlerCallCount = 0;

      // Execute 10 times
      for (let i = 0; i < 10; i++) {
        const { result, cached } = await withIdempotency(
          key,
          requestHash,
          manifestHash,
          async () => {
            handlerCallCount++;
            return SAMPLE_RESPONSE;
          }
        );
        results.push(result);

        // First call should not be cached, rest should be
        if (i === 0) {
          expect(cached).toBe(false);
        } else {
          expect(cached).toBe(true);
        }
      }

      // Handler should only be called once
      expect(handlerCallCount).toBe(1);

      // All results should be identical
      const firstResult = results[0];
      for (const result of results) {
        expect(result.txHash).toBe(firstResult.txHash);
        expect(result.manifestHash).toBe(firstResult.manifestHash);
        expect(result.blockNumber).toBe(firstResult.blockNumber);
        expect(result.accepted).toBe(firstResult.accepted);
        expect(result.success).toBe(firstResult.success);
      }
    });

    it('should return same txHash on 10x replay', async () => {
      const key = generateIdempotencyKey(8453, 2001);
      const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 2001 });
      const manifestHash = SAMPLE_RESPONSE.manifestHash;

      const txHashes = new Set<string>();
      let handlerCalls = 0;

      for (let i = 0; i < 10; i++) {
        const { result } = await withIdempotency(
          key,
          requestHash,
          manifestHash,
          async () => {
            handlerCalls++;
            return { ...SAMPLE_RESPONSE, txHash: '0xunique123...' };
          }
        );
        if (result.txHash) {
          txHashes.add(result.txHash);
        }
      }

      // Only one unique txHash
      expect(txHashes.size).toBe(1);
      // Handler called only once
      expect(handlerCalls).toBe(1);
    });

    it('should allow new request for different jobId', async () => {
      const key1 = generateIdempotencyKey(8453, 3001);
      const key2 = generateIdempotencyKey(8453, 3002);
      const requestHash1 = hashRequest({ ...SAMPLE_REQUEST, jobId: 3001 });
      const requestHash2 = hashRequest({ ...SAMPLE_REQUEST, jobId: 3002 });

      let handlerCalls = 0;

      // First job
      await withIdempotency(key1, requestHash1, 'hash1', async () => {
        handlerCalls++;
        return { jobId: 3001 };
      });

      // Second job (different key)
      await withIdempotency(key2, requestHash2, 'hash2', async () => {
        handlerCalls++;
        return { jobId: 3002 };
      });

      // Both handlers should be called
      expect(handlerCalls).toBe(2);
    });
  });

  // ============================================================================
  // Record Management Tests
  // ============================================================================

  describe('Record Management', () => {
    it('should retrieve stored record', async () => {
      const key = generateIdempotencyKey(8453, 4001);
      const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 4001 });

      await withIdempotency(key, requestHash, 'test-hash', async () => {
        return SAMPLE_RESPONSE;
      });

      const record = getIdempotencyRecord(key);
      expect(record).toBeDefined();
      expect(record?.status).toBe('COMPLETED');
      expect(record?.manifest_hash).toBe('test-hash');
    });

    it('should return undefined for non-existent key', () => {
      const record = getIdempotencyRecord('non:existent:key');
      expect(record).toBeUndefined();
    });

    it('should track stats correctly', async () => {
      // Create some records
      for (let i = 0; i < 5; i++) {
        const key = generateIdempotencyKey(8453, 5000 + i);
        const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 5000 + i });

        await withIdempotency(key, requestHash, `hash-${i}`, async () => {
          return { jobId: 5000 + i };
        });
      }

      const stats = getIdempotencyStats();
      expect(stats.completed).toBeGreaterThanOrEqual(5);
      expect(stats.pending).toBe(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should mark record as FAILED on handler error', async () => {
      const key = generateIdempotencyKey(8453, 6001);
      const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 6001 });

      try {
        await withIdempotency(key, requestHash, 'fail-hash', async () => {
          throw new Error('Handler failed');
        });
      } catch (e) {
        // Expected
      }

      const record = getIdempotencyRecord(key);
      expect(record?.status).toBe('FAILED');
      expect(record?.error_message).toContain('Handler failed');
    });

    it('should allow retry after FAILED status', async () => {
      const key = generateIdempotencyKey(8453, 7001);
      const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 7001 });
      let handlerCalls = 0;

      // First call - fails
      try {
        await withIdempotency(key, requestHash, 'retry-hash', async () => {
          handlerCalls++;
          throw new Error('First attempt failed');
        });
      } catch (e) {
        // Expected
      }

      // Second call - succeeds
      const { result, cached } = await withIdempotency(key, requestHash, 'retry-hash', async () => {
        handlerCalls++;
        return SAMPLE_RESPONSE;
      });

      expect(handlerCalls).toBe(2);
      expect(cached).toBe(false);
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe('Cleanup', () => {
    it('should clean up expired records', async () => {
      const key = generateIdempotencyKey(8453, 8001);
      const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 8001 });

      await withIdempotency(key, requestHash, 'cleanup-hash', async () => {
        return SAMPLE_RESPONSE;
      });

      // Manually expire the record
      execute(
        'UPDATE idempotency_keys SET ttl_expires_at = ? WHERE key = ?',
        [Date.now() - 1000, key]
      );

      const cleaned = cleanupExpiredIdempotency();
      expect(cleaned).toBeGreaterThanOrEqual(1);

      const record = getIdempotencyRecord(key);
      expect(record).toBeUndefined();
    });
  });
});

// ============================================================================
// Relay Mode Tests (Integration)
// ============================================================================

describe('Relay Mode Integration', () => {
  beforeEach(() => {
    process.env.DATABASE_PATH = ':memory:';
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should cache txHash in idempotency response', async () => {
    const key = generateIdempotencyKey(8453, 9001);
    const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 9001 });

    const responseWithTx = {
      ...SAMPLE_RESPONSE,
      txHash: '0xrelayed1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      blockNumber: 54321,
    };

    // First call
    const { result: result1 } = await withIdempotency(
      key,
      requestHash,
      responseWithTx.manifestHash,
      async () => responseWithTx
    );

    // Second call (cached)
    const { result: result2, cached } = await withIdempotency(
      key,
      requestHash,
      responseWithTx.manifestHash,
      async () => {
        throw new Error('Should not be called on cache hit');
      }
    );

    expect(cached).toBe(true);
    expect(result2.txHash).toBe(result1.txHash);
    expect(result2.blockNumber).toBe(result1.blockNumber);
  });

  it('should prevent double-submit via idempotency', async () => {
    const key = generateIdempotencyKey(8453, 9002);
    const requestHash = hashRequest({ ...SAMPLE_REQUEST, jobId: 9002 });
    let txSubmitCount = 0;

    const simulateRelaySubmit = async () => {
      txSubmitCount++;
      return {
        ...SAMPLE_RESPONSE,
        txHash: `0xsubmit${txSubmitCount}`,
      };
    };

    // Submit 10x in parallel (simulate race conditions)
    const promises = Array(10).fill(null).map(() =>
      withIdempotency(key, requestHash, 'double-hash', simulateRelaySubmit)
    );

    // Note: Due to mutex-like behavior, only 1 should actually submit
    // Others will either wait or get cached result
    const results = await Promise.all(promises);

    // All should return the same txHash
    const txHashes = new Set(results.map(r => r.result.txHash));
    expect(txHashes.size).toBe(1);

    // Tx should only be submitted once
    expect(txSubmitCount).toBe(1);
  });
});
