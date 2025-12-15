-- Migration: 002_dlq
-- Creates dlq_events table for dead letter queue
-- Stores failed completions for retry

CREATE TABLE IF NOT EXISTS dlq_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Event type
  type TEXT NOT NULL CHECK(type IN (
    'HASH_MISMATCH',
    'UPLOAD_FAIL',
    'SCHEMA_FAIL',
    'TX_FAIL',
    'DISPUTE_FAIL',
    'VALIDATION_FAIL',
    'IDEMPOTENCY_CONFLICT'
  )),

  -- Original request payload (JSON)
  payload TEXT NOT NULL,

  -- Error details
  reason TEXT,
  error_code TEXT,
  error_stack TEXT,

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  next_retry_at INTEGER,
  last_retry_at INTEGER,

  -- Resolution
  resolved_at INTEGER,
  resolution_type TEXT CHECK(resolution_type IN ('RETRIED', 'MANUAL', 'EXPIRED', 'SKIPPED')),
  resolution_notes TEXT,

  -- Metadata
  connector_type TEXT DEFAULT 'webhook',
  service_type TEXT,
  job_id INTEGER,
  manifest_hash TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL
);

-- Index for retry scheduling
CREATE INDEX IF NOT EXISTS idx_dlq_next_retry ON dlq_events(next_retry_at)
  WHERE resolved_at IS NULL;

-- Index for type queries
CREATE INDEX IF NOT EXISTS idx_dlq_type ON dlq_events(type);

-- Index for job lookups
CREATE INDEX IF NOT EXISTS idx_dlq_job ON dlq_events(job_id);

-- Index for unresolved events
CREATE INDEX IF NOT EXISTS idx_dlq_unresolved ON dlq_events(created_at)
  WHERE resolved_at IS NULL;
