-- Connect tokens for one-time secrets download
-- M4.5: Plug-and-Play Backend

CREATE TABLE IF NOT EXISTS connect_tokens (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    robot_id TEXT NOT NULL REFERENCES robots(robot_id),
    token TEXT UNIQUE NOT NULL,
    secrets_json TEXT,  -- Encrypted, NULL after download
    expires_at INTEGER NOT NULL,
    downloaded_at INTEGER,  -- NULL = not yet downloaded
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connect_tokens_token ON connect_tokens(token);
CREATE INDEX IF NOT EXISTS idx_connect_tokens_tenant ON connect_tokens(tenant_id);
