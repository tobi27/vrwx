-- Migration: 001_idempotency
-- Creates idempotency_keys table for exactly-once settlement
-- Key strategy: base:{chainId}:job:{jobId}

CREATE TABLE IF NOT EXISTS idempotency_keys (
  -- Primary key: base:{chainId}:job:{jobId}
  key TEXT PRIMARY KEY,

  -- Status of the request
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'COMPLETED', 'FAILED')),

  -- Hash of the request body (for verification)
  request_hash TEXT,

  -- Manifest hash (secondary field, not part of key)
  manifest_hash TEXT,

  -- Stored response for replay
  response_json TEXT,

  -- Error details if FAILED
  error_code TEXT,
  error_message TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- TTL for automatic cleanup (optional)
  ttl_expires_at INTEGER
);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_idempotency_status ON idempotency_keys(status);

-- Index for TTL cleanup
CREATE INDEX IF NOT EXISTS idx_idempotency_ttl ON idempotency_keys(ttl_expires_at);

-- Index for manifest_hash lookups
CREATE INDEX IF NOT EXISTS idx_idempotency_manifest ON idempotency_keys(manifest_hash);
