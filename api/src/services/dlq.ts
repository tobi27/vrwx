/**
 * Dead Letter Queue (DLQ) Service
 * Stores failed completions for retry and debugging
 */

import { execute, query, queryOne, transaction } from '../db/index.js';
import { config } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export type DLQEventType =
  | 'HASH_MISMATCH'
  | 'UPLOAD_FAIL'
  | 'SCHEMA_FAIL'
  | 'TX_FAIL'
  | 'DISPUTE_FAIL'
  | 'VALIDATION_FAIL'
  | 'IDEMPOTENCY_CONFLICT';

export type ResolutionType = 'RETRIED' | 'MANUAL' | 'EXPIRED' | 'SKIPPED';

export interface DLQEvent {
  [key: string]: unknown;
  id: number;
  type: DLQEventType;
  payload: string;
  reason: string | null;
  error_code: string | null;
  error_stack: string | null;
  retry_count: number;
  next_retry_at: number | null;
  last_retry_at: number | null;
  resolved_at: number | null;
  resolution_type: ResolutionType | null;
  resolution_notes: string | null;
  connector_type: string;
  service_type: string | null;
  job_id: number | null;
  manifest_hash: string | null;
  created_at: number;
}

export interface EnqueueOptions {
  connectorType?: string;
  serviceType?: string;
  jobId?: number;
  manifestHash?: string;
  errorCode?: string;
  errorStack?: string;
  robotId?: string;
  recoveredAddress?: string;
  expectedController?: string;
  providedController?: string;
  registryController?: string;
  recoveredSigner?: string;
}

// ============================================================================
// Metrics (in-memory counters for Prometheus export)
// ============================================================================

const dlqMetrics = {
  enqueued: new Map<DLQEventType, number>(),
  retried: new Map<DLQEventType, number>(),
  resolved: new Map<DLQEventType, number>(),
};

export function getDLQMetrics(): {
  enqueued: Record<DLQEventType, number>;
  retried: Record<DLQEventType, number>;
  resolved: Record<DLQEventType, number>;
} {
  const toRecord = (m: Map<DLQEventType, number>) =>
    Object.fromEntries(m) as Record<DLQEventType, number>;
  return {
    enqueued: toRecord(dlqMetrics.enqueued),
    retried: toRecord(dlqMetrics.retried),
    resolved: toRecord(dlqMetrics.resolved),
  };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Add a failed event to the DLQ
 */
export function enqueueDLQ(
  type: DLQEventType,
  payload: unknown,
  reason: string,
  options: EnqueueOptions = {}
): number {
  const now = Date.now();

  // Calculate first retry time with exponential backoff
  const nextRetryAt = now + config.DLQ_BACKOFF_BASE_MS;

  const result = execute(
    `INSERT INTO dlq_events
     (type, payload, reason, error_code, error_stack, connector_type, service_type, job_id, manifest_hash, next_retry_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      type,
      JSON.stringify(payload),
      reason,
      options.errorCode || null,
      options.errorStack || null,
      options.connectorType || 'webhook',
      options.serviceType || null,
      options.jobId || null,
      options.manifestHash || null,
      nextRetryAt,
      now,
    ]
  );

  // Update metrics
  dlqMetrics.enqueued.set(
    type,
    (dlqMetrics.enqueued.get(type) || 0) + 1
  );

  console.log(`[DLQ] Enqueued ${type} event #${result.lastInsertRowid}: ${reason}`);

  return Number(result.lastInsertRowid);
}

/**
 * Get events due for retry
 */
export function getDueEvents(limit = 100): DLQEvent[] {
  const now = Date.now();
  return query<DLQEvent>(
    `SELECT * FROM dlq_events
     WHERE resolved_at IS NULL
       AND next_retry_at <= ?
       AND retry_count < ?
     ORDER BY next_retry_at ASC
     LIMIT ?`,
    [now, config.DLQ_MAX_RETRIES, limit]
  );
}

/**
 * Get all unresolved events
 */
export function getUnresolvedEvents(limit = 100): DLQEvent[] {
  return query<DLQEvent>(
    `SELECT * FROM dlq_events
     WHERE resolved_at IS NULL
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );
}

/**
 * Get event by ID
 */
export function getDLQEvent(id: number): DLQEvent | undefined {
  return queryOne<DLQEvent>(
    'SELECT * FROM dlq_events WHERE id = ?',
    [id]
  );
}

/**
 * Mark event as retrying (increment retry count, set next retry time)
 */
export function markRetrying(id: number): void {
  const now = Date.now();
  const event = getDLQEvent(id);
  if (!event) return;

  // Exponential backoff: base * 2^retry_count
  const backoff =
    config.DLQ_BACKOFF_BASE_MS * Math.pow(2, event.retry_count);
  const nextRetryAt = now + backoff;

  execute(
    `UPDATE dlq_events
     SET retry_count = retry_count + 1,
         last_retry_at = ?,
         next_retry_at = ?
     WHERE id = ?`,
    [now, nextRetryAt, id]
  );

  // Update metrics
  dlqMetrics.retried.set(
    event.type as DLQEventType,
    (dlqMetrics.retried.get(event.type as DLQEventType) || 0) + 1
  );
}

/**
 * Mark event as resolved
 */
export function markResolved(
  id: number,
  resolutionType: ResolutionType,
  notes?: string
): void {
  const now = Date.now();
  const event = getDLQEvent(id);

  execute(
    `UPDATE dlq_events
     SET resolved_at = ?,
         resolution_type = ?,
         resolution_notes = ?
     WHERE id = ?`,
    [now, resolutionType, notes || null, id]
  );

  // Update metrics
  if (event) {
    dlqMetrics.resolved.set(
      event.type as DLQEventType,
      (dlqMetrics.resolved.get(event.type as DLQEventType) || 0) + 1
    );
  }

  console.log(`[DLQ] Resolved event #${id}: ${resolutionType}`);
}

/**
 * Delete an event (use with caution)
 */
export function deleteDLQEvent(id: number): void {
  execute('DELETE FROM dlq_events WHERE id = ?', [id]);
}

// ============================================================================
// Statistics
// ============================================================================

export interface DLQStats {
  total: number;
  unresolved: number;
  pendingRetry: number;
  exceededRetries: number;
  byType: Record<string, number>;
}

export function getDLQStats(): DLQStats {
  const now = Date.now();

  const total = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM dlq_events',
    []
  )?.count || 0;

  const unresolved = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM dlq_events WHERE resolved_at IS NULL',
    []
  )?.count || 0;

  const pendingRetry = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM dlq_events
     WHERE resolved_at IS NULL
       AND next_retry_at <= ?
       AND retry_count < ?`,
    [now, config.DLQ_MAX_RETRIES]
  )?.count || 0;

  const exceededRetries = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM dlq_events
     WHERE resolved_at IS NULL
       AND retry_count >= ?`,
    [config.DLQ_MAX_RETRIES]
  )?.count || 0;

  const byTypeRows = query<{ type: string; count: number }>(
    `SELECT type, COUNT(*) as count FROM dlq_events
     WHERE resolved_at IS NULL
     GROUP BY type`,
    []
  );

  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byType[row.type] = row.count;
  }

  return {
    total,
    unresolved,
    pendingRetry,
    exceededRetries,
    byType,
  };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Mark events that exceeded max retries as expired
 */
export function expireStuckEvents(): number {
  const result = execute(
    `UPDATE dlq_events
     SET resolved_at = ?,
         resolution_type = 'EXPIRED',
         resolution_notes = 'Exceeded maximum retry count'
     WHERE resolved_at IS NULL
       AND retry_count >= ?`,
    [Date.now(), config.DLQ_MAX_RETRIES]
  );

  if (result.changes > 0) {
    console.log(`[DLQ] Expired ${result.changes} events that exceeded max retries`);
  }

  return result.changes;
}

/**
 * Delete resolved events older than retention period
 */
export function cleanupOldEvents(retentionDays = 30): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const result = execute(
    `DELETE FROM dlq_events
     WHERE resolved_at IS NOT NULL
       AND resolved_at < ?`,
    [cutoff]
  );

  if (result.changes > 0) {
    console.log(`[DLQ] Cleaned up ${result.changes} old resolved events`);
  }

  return result.changes;
}
