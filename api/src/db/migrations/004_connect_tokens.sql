-- Connect tokens table (one-time secrets download)
CREATE TABLE IF NOT EXISTS connect_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  robot_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  secrets_json TEXT,
  expires_at INTEGER NOT NULL,
  downloaded_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connect_tokens_token ON connect_tokens(token);
CREATE INDEX IF NOT EXISTS idx_connect_tokens_expires ON connect_tokens(expires_at);
