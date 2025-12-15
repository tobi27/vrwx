-- Tenants and API Keys for robot onboarding
-- M4.4: Landing → Connect Robots → See Process

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at INTEGER,
    UNIQUE(tenant_id, prefix)
);

CREATE TABLE IF NOT EXISTS robots (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    robot_id TEXT NOT NULL UNIQUE,
    controller_address TEXT NOT NULL,
    registered_tx TEXT,
    registered_at INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_robots_tenant ON robots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_robots_robot_id ON robots(robot_id);
