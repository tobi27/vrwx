-- Job completions tracking for live feed
-- M4.5: Plug-and-Play Backend

CREATE TABLE IF NOT EXISTS job_completions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    robot_id TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    service_type TEXT NOT NULL,
    manifest_hash TEXT NOT NULL,
    tx_hash TEXT,
    receipt_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    hash_match INTEGER,
    quality_score INTEGER,
    work_units INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(tenant_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_completions_tenant ON job_completions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_robot ON job_completions(robot_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_created ON job_completions(created_at DESC);
