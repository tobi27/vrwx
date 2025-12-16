-- Job completions table (live feed)
CREATE TABLE IF NOT EXISTS job_completions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  robot_id TEXT NOT NULL,
  job_id INTEGER NOT NULL,
  service_type TEXT NOT NULL,
  manifest_hash TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  hash_match INTEGER,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_completions_tenant ON job_completions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_robot ON job_completions(robot_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_status ON job_completions(status);
