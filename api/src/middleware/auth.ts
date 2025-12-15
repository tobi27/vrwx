/**
 * API Key Authentication Middleware
 * M4.4: Robot onboarding + API key validation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { query, queryOne, execute } from '../db/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyRecord {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  key_hash: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface TenantRecord {
  [key: string]: unknown;
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface RobotRecord {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  robot_id: string;
  controller_address: string;
  registered_tx: string | null;
  registered_at: number | null;
  status: string;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new API key
 * Format: vrwx_{prefix}_{secret}
 * Returns: { key: full key (show once), keyHash: for storage, prefix: for display }
 */
export function generateApiKey(): { key: string; keyHash: string; prefix: string } {
  const prefix = randomBytes(4).toString('hex'); // 8 chars
  const secret = randomBytes(24).toString('hex'); // 48 chars
  const key = `vrwx_${prefix}_${secret}`;
  const keyHash = hashApiKey(key);
  return { key, keyHash, prefix };
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ============================================================================
// Key Validation
// ============================================================================

/**
 * Validate an API key and return tenant info
 */
export async function validateApiKey(key: string): Promise<{
  valid: boolean;
  tenantId?: string;
  error?: string;
}> {
  if (!key || !key.startsWith('vrwx_')) {
    return { valid: false, error: 'Invalid key format' };
  }

  const keyHash = hashApiKey(key);

  const record = queryOne<ApiKeyRecord>(
    'SELECT * FROM api_keys WHERE key_hash = ?',
    [keyHash]
  );

  if (!record) {
    return { valid: false, error: 'Key not found' };
  }

  if (record.revoked_at) {
    return { valid: false, error: 'Key revoked' };
  }

  // Update last_used_at
  execute(
    'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
    [Date.now(), record.id]
  );

  return { valid: true, tenantId: record.tenant_id };
}

// ============================================================================
// Fastify Hook
// ============================================================================

/**
 * Fastify preHandler hook for API key authentication
 * Skips auth for public routes
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Public routes - no auth required
  const publicPaths = [
    '/health',
    '/v1/onboard', // POST to create tenant
    '/manifests', // Public verification
    '/connect', // Connect page (token-based auth)
    '/v1/feed', // Live feed (public with tenant param)
    '/v1/robot-config', // Robot config download (public)
  ];

  const isPublic = publicPaths.some(p => request.url.startsWith(p));
  if (isPublic && request.method === 'GET') {
    return;
  }

  // Allow POST /v1/onboard without auth (creates new tenant)
  if (request.url === '/v1/onboard' && request.method === 'POST') {
    return;
  }

  // Extract API key from header
  const authHeader = request.headers['x-api-key'] as string | undefined;
  const bearerHeader = request.headers.authorization;

  let apiKey: string | undefined;

  if (authHeader) {
    apiKey = authHeader;
  } else if (bearerHeader?.startsWith('Bearer ')) {
    apiKey = bearerHeader.slice(7);
  }

  if (!apiKey) {
    reply.status(401).send({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
      message: 'Provide API key via X-API-Key header or Bearer token',
    });
    return;
  }

  const result = await validateApiKey(apiKey);

  if (!result.valid) {
    reply.status(401).send({
      error: 'Invalid API key',
      code: 'INVALID_KEY',
      message: result.error,
    });
    return;
  }

  // Attach tenant to request
  (request as any).tenantId = result.tenantId;
}

// ============================================================================
// Tenant/Key Management
// ============================================================================

/**
 * Create a new tenant with API key
 */
export function createTenant(name: string): {
  tenant: TenantRecord;
  apiKey: { key: string; prefix: string };
} {
  const tenantId = randomBytes(16).toString('hex');
  const now = Date.now();

  execute(
    'INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [tenantId, name, now, now]
  );

  const { key, keyHash, prefix } = generateApiKey();
  const keyId = randomBytes(16).toString('hex');

  execute(
    'INSERT INTO api_keys (id, tenant_id, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)',
    [keyId, tenantId, keyHash, prefix, now]
  );

  return {
    tenant: { id: tenantId, name, created_at: now, updated_at: now },
    apiKey: { key, prefix },
  };
}

/**
 * Get tenant by ID
 */
export function getTenant(tenantId: string): TenantRecord | undefined {
  return queryOne<TenantRecord>(
    'SELECT * FROM tenants WHERE id = ?',
    [tenantId]
  );
}

/**
 * List API keys for tenant (without hashes)
 */
export function listApiKeys(tenantId: string): Array<{
  id: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
  revoked: boolean;
}> {
  const records = query<ApiKeyRecord>(
    'SELECT * FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC',
    [tenantId]
  );

  return records.map(r => ({
    id: r.id,
    prefix: r.prefix,
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    revoked: r.revoked_at !== null,
  }));
}

/**
 * Revoke an API key
 */
export function revokeApiKey(keyId: string, tenantId: string): boolean {
  const result = execute(
    'UPDATE api_keys SET revoked_at = ? WHERE id = ? AND tenant_id = ?',
    [Date.now(), keyId, tenantId]
  );
  return result.changes > 0;
}

// ============================================================================
// Robot Resolution (M4.5)
// ============================================================================

/**
 * Resolve robot from API key
 * Returns the first robot for the tenant (or specified robot)
 */
export function resolveRobotFromApiKey(apiKey: string, robotIdOverride?: string): {
  valid: boolean;
  tenantId?: string;
  robot?: RobotRecord;
  error?: string;
} {
  if (!apiKey || !apiKey.startsWith('vrwx_')) {
    return { valid: false, error: 'Invalid key format' };
  }

  const keyHash = hashApiKey(apiKey);

  const record = queryOne<ApiKeyRecord>(
    'SELECT * FROM api_keys WHERE key_hash = ?',
    [keyHash]
  );

  if (!record) {
    return { valid: false, error: 'Key not found' };
  }

  if (record.revoked_at) {
    return { valid: false, error: 'Key revoked' };
  }

  // Update last_used_at
  execute(
    'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
    [Date.now(), record.id]
  );

  // Get robot - either by override or first robot for tenant
  let robot: RobotRecord | undefined;

  if (robotIdOverride) {
    robot = queryOne<RobotRecord>(
      'SELECT * FROM robots WHERE tenant_id = ? AND robot_id = ?',
      [record.tenant_id, robotIdOverride]
    );
  } else {
    robot = queryOne<RobotRecord>(
      'SELECT * FROM robots WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1',
      [record.tenant_id]
    );
  }

  if (!robot) {
    return { valid: true, tenantId: record.tenant_id, error: 'No robot found for tenant' };
  }

  return { valid: true, tenantId: record.tenant_id, robot };
}

/**
 * Rotate API key for tenant (keeps same robot/controller)
 */
export function rotateApiKey(tenantId: string): {
  success: boolean;
  apiKey?: { key: string; prefix: string };
  error?: string;
} {
  // Verify tenant exists
  const tenant = getTenant(tenantId);
  if (!tenant) {
    return { success: false, error: 'Tenant not found' };
  }

  // Revoke all existing keys
  execute(
    'UPDATE api_keys SET revoked_at = ? WHERE tenant_id = ? AND revoked_at IS NULL',
    [Date.now(), tenantId]
  );

  // Generate new key
  const { key, keyHash, prefix } = generateApiKey();
  const keyId = randomBytes(16).toString('hex');
  const now = Date.now();

  execute(
    'INSERT INTO api_keys (id, tenant_id, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)',
    [keyId, tenantId, keyHash, prefix, now]
  );

  return { success: true, apiKey: { key, prefix } };
}

/**
 * Get robot by robot_id
 */
export function getRobot(robotId: string): RobotRecord | undefined {
  return queryOne<RobotRecord>(
    'SELECT * FROM robots WHERE robot_id = ?',
    [robotId]
  );
}

/**
 * Get first robot for tenant
 */
export function getFirstRobotForTenant(tenantId: string): RobotRecord | undefined {
  return queryOne<RobotRecord>(
    'SELECT * FROM robots WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1',
    [tenantId]
  );
}
