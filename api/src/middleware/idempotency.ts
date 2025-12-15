/**
 * Idempotency Middleware
 * Ensures exactly-once settlement for job completions
 *
 * Key strategy: base:{chainId}:job:{jobId}
 * - Same jobId cannot settle twice, even with different manifests
 * - manifestHash stored as secondary field for debugging
 */

import { keccak256, toUtf8Bytes } from 'ethers';
import { queryOne, execute, transaction } from '../db/index.js';
import { config } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export type IdempotencyStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface IdempotencyRecord {
  [key: string]: unknown;
  key: string;
  status: IdempotencyStatus;
  request_hash: string | null;
  manifest_hash: string | null;
  response_json: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  ttl_expires_at: number | null;
}

export interface IdempotencyResult<T> {
  result: T;
  cached: boolean;
  key: string;
}

export class IdempotencyConflictError extends Error {
  public readonly statusCode = 202;
  public readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs = 5000) {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate idempotency key for a job completion
 * Format: base:{chainId}:job:{jobId}
 */
export function generateIdempotencyKey(
  chainId: number,
  jobId: number
): string {
  return `base:${chainId}:job:${jobId}`;
}

/**
 * Hash a request body for comparison
 */
export function hashRequest(body: unknown): string {
  const canonical = JSON.stringify(body, Object.keys(body as object).sort());
  return keccak256(toUtf8Bytes(canonical));
}

// ============================================================================
// Idempotency Logic
// ============================================================================

/**
 * Execute a handler with idempotency protection
 *
 * Behavior:
 * - COMPLETED: Return cached response (200)
 * - PENDING: Throw 202 conflict (retry later)
 * - FAILED: Allow retry with same key
 * - NEW: Insert PENDING, execute, mark COMPLETED/FAILED
 */
export async function withIdempotency<T>(
  key: string,
  requestHash: string,
  manifestHash: string | null,
  handler: () => Promise<T>
): Promise<IdempotencyResult<T>> {
  const now = Date.now();

  // Check existing record
  const existing = queryOne<IdempotencyRecord>(
    'SELECT * FROM idempotency_keys WHERE key = ?',
    [key]
  );

  // Case 1: COMPLETED - return cached response
  if (existing?.status === 'COMPLETED' && existing.response_json) {
    return {
      result: JSON.parse(existing.response_json) as T,
      cached: true,
      key,
    };
  }

  // Case 2: PENDING - throw conflict (another request in flight)
  if (existing?.status === 'PENDING') {
    // Check if stuck (older than 2 minutes = likely dead)
    const stuckThreshold = now - 120000;
    if (existing.created_at < stuckThreshold) {
      // Mark as FAILED and allow retry
      execute(
        'UPDATE idempotency_keys SET status = ?, error_code = ?, updated_at = ? WHERE key = ?',
        ['FAILED', 'STUCK_TIMEOUT', now, key]
      );
    } else {
      throw new IdempotencyConflictError(
        'Request already in progress',
        5000
      );
    }
  }

  // Case 3: FAILED - allow retry (delete old record first)
  if (existing?.status === 'FAILED') {
    execute('DELETE FROM idempotency_keys WHERE key = ?', [key]);
  }

  // Case 4: NEW - insert PENDING record
  const ttlExpiresAt = now + config.IDEMPOTENCY_TTL_MS;

  try {
    execute(
      `INSERT INTO idempotency_keys
       (key, status, request_hash, manifest_hash, created_at, updated_at, ttl_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [key, 'PENDING', requestHash, manifestHash, now, now, ttlExpiresAt]
    );
  } catch (err) {
    // Race condition: another request inserted first
    if ((err as Error).message.includes('UNIQUE constraint failed')) {
      throw new IdempotencyConflictError('Request already in progress', 5000);
    }
    throw err;
  }

  // Execute handler
  try {
    const result = await handler();

    // Mark COMPLETED
    execute(
      `UPDATE idempotency_keys
       SET status = ?, response_json = ?, updated_at = ?
       WHERE key = ?`,
      ['COMPLETED', JSON.stringify(result), Date.now(), key]
    );

    return { result, cached: false, key };
  } catch (error) {
    // Mark FAILED
    const err = error as Error;
    execute(
      `UPDATE idempotency_keys
       SET status = ?, error_code = ?, error_message = ?, updated_at = ?
       WHERE key = ?`,
      ['FAILED', err.name, err.message, Date.now(), key]
    );
    throw error;
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get idempotency record by key
 */
export function getIdempotencyRecord(
  key: string
): IdempotencyRecord | undefined {
  return queryOne<IdempotencyRecord>(
    'SELECT * FROM idempotency_keys WHERE key = ?',
    [key]
  );
}

/**
 * Get idempotency record by job ID
 */
export function getIdempotencyByJobId(
  chainId: number,
  jobId: number
): IdempotencyRecord | undefined {
  const key = generateIdempotencyKey(chainId, jobId);
  return getIdempotencyRecord(key);
}

/**
 * Clean up expired idempotency records
 */
export function cleanupExpiredIdempotency(): number {
  const result = execute(
    'DELETE FROM idempotency_keys WHERE ttl_expires_at < ? AND status != ?',
    [Date.now(), 'PENDING']
  );
  return result.changes;
}

/**
 * Get stats about idempotency records
 */
export function getIdempotencyStats(): {
  total: number;
  pending: number;
  completed: number;
  failed: number;
} {
  const stats = queryOne<{
    total: number;
    pending: number;
    completed: number;
    failed: number;
  }>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
     FROM idempotency_keys`,
    []
  );

  return stats || { total: 0, pending: 0, completed: 0, failed: 0 };
}
