/**
 * Onboarding Routes
 * M4.5: Plug-and-Play Backend
 *
 * Machine-native onboarding:
 * 1. POST /v1/onboard - Create tenant + robot → returns connectUrl (secrets via connect page)
 * 2. POST /v1/robots/register - Relay IdentityRegistry.registerRobot()
 * 3. GET /v1/onboard/:tenant - Status + webhook snippet
 */

import { FastifyPluginAsync } from 'fastify';
import { Wallet, ethers, keccak256, toUtf8Bytes } from 'ethers';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { createTenant, getTenant, RobotRecord } from '../middleware/auth.js';
import { query, queryOne, execute } from '../db/index.js';
import { config } from '../config.js';

// ============================================================================
// Types
// ============================================================================

interface OnboardBody {
  name: string; // Tenant/org name
  robotName?: string; // Optional robot name for robotId derivation
}

interface RegisterBody {
  robotId: string;
  pubkey?: string; // Optional pubkey for IdentityRegistry
}

interface ConnectTokenRecord {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  robot_id: string;
  token: string;
  secrets_json: string | null;
  expires_at: number;
  downloaded_at: number | null;
  created_at: number;
}

// ============================================================================
// Contract ABI
// ============================================================================

const IDENTITY_REGISTRY_ABI = [
  'function registerRobot(bytes32 robotId, address controller, bytes pubkey) external',
  'function getController(bytes32 robotId) view returns (address)',
  'function isActive(bytes32 robotId) view returns (bool)',
];

// ============================================================================
// Helpers
// ============================================================================

function generateRobotId(tenantId: string, robotName?: string): string {
  const seed = robotName
    ? `${tenantId}:${robotName}`
    : `${tenantId}:${randomBytes(8).toString('hex')}`;
  return keccak256(toUtf8Bytes(seed));
}

function generateShortToken(): string {
  // 12 char alphanumeric token
  return randomBytes(9).toString('base64url').slice(0, 12);
}

// Simple encryption for temporary secrets storage
const ENCRYPTION_KEY = config.ENCRYPTION_KEY || 'vrwx-default-key-change-in-prod!';

function encryptSecrets(data: object): string {
  const key = scryptSync(ENCRYPTION_KEY, 'vrwx-salt', 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptSecrets(encrypted: string): object | null {
  try {
    const key = scryptSync(ENCRYPTION_KEY, 'vrwx-salt', 32);
    const data = Buffer.from(encrypted, 'base64');
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const ciphertext = data.subarray(32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

// ============================================================================
// Routes
// ============================================================================

export const onboardRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /v1/onboard
   *
   * Create tenant + API key + robot identity + controller keypair
   * Returns ONLY connectUrl + statusUrl - secrets accessed via connect page
   */
  fastify.post<{ Body: OnboardBody }>('/onboard', async (request, reply) => {
    const { name, robotName } = request.body;

    if (!name || name.length < 2) {
      return reply.status(400).send({
        error: 'Name required (min 2 chars)',
        code: 'INVALID_NAME',
      });
    }

    // Create tenant + API key
    const { tenant, apiKey } = createTenant(name);

    // Generate controller keypair (robot keeps private key)
    const controllerWallet = Wallet.createRandom();
    const controllerAddress = controllerWallet.address;
    const controllerPrivateKey = controllerWallet.privateKey;

    // Generate robotId
    const robotId = generateRobotId(tenant.id, robotName);

    // Store robot record (pending registration)
    const robotRecordId = randomBytes(16).toString('hex');
    const now = Date.now();

    execute(
      `INSERT INTO robots (id, tenant_id, robot_id, controller_address, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [robotRecordId, tenant.id, robotId, controllerAddress, 'pending', now, now]
    );

    // Generate connect token with encrypted secrets
    const shortToken = generateShortToken();
    const tokenId = randomBytes(16).toString('hex');
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes TTL

    // Encrypt secrets for temporary storage
    // In non-strict mode: only store apiKey (controllerSig not required)
    // In strict mode: also store controllerPrivateKey for Robot Key File download
    const secrets: Record<string, string> = {
      apiKey: apiKey.key,
      robotId,
      controllerAddress,
    };
    if (config.VRWX_STRICT_PROOF) {
      secrets.controllerPrivateKey = controllerPrivateKey;
    }
    const encryptedSecrets = encryptSecrets(secrets);

    execute(
      `INSERT INTO connect_tokens (id, tenant_id, robot_id, token, secrets_json, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tokenId, tenant.id, robotId, shortToken, encryptedSecrets, expiresAt, now]
    );

    // Base URL
    const baseUrl = config.API_BASE_URL || `http://localhost:${config.PORT}`;

    fastify.log.info(`[ONBOARD] Created tenant ${tenant.id} with robot ${robotId}`);

    // Return ONLY URLs - no secrets in response
    return {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
      connectUrl: `${baseUrl}/connect/${shortToken}`,
      statusUrl: `${baseUrl}/v1/feed?tenant=${tenant.id}`,
      expiresIn: '10 minutes',
      note: 'Visit connectUrl to copy your API key and integration snippet',
    };
  });

  /**
   * POST /v1/robots/register
   *
   * Relay IdentityRegistry.registerRobot() transaction
   * Requires valid API key
   */
  fastify.post<{ Body: RegisterBody }>('/robots/register', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { robotId, pubkey } = request.body;

    if (!robotId) {
      return reply.status(400).send({
        error: 'robotId required',
        code: 'MISSING_ROBOT_ID',
      });
    }

    // Find robot record
    const robot = queryOne<RobotRecord>(
      'SELECT * FROM robots WHERE robot_id = ? AND tenant_id = ?',
      [robotId, tenantId]
    );

    if (!robot) {
      return reply.status(404).send({
        error: 'Robot not found for this tenant',
        code: 'ROBOT_NOT_FOUND',
      });
    }

    if (robot.status === 'registered') {
      return reply.status(409).send({
        error: 'Robot already registered',
        code: 'ALREADY_REGISTERED',
        txHash: robot.registered_tx,
      });
    }

    // Check if relayer is configured
    if (config.RELAY_MODE !== 'relay' || !config.RELAYER_PRIVATE_KEY) {
      return reply.status(503).send({
        error: 'Relay mode not enabled',
        code: 'RELAY_DISABLED',
        message: 'Configure RELAYER_PRIVATE_KEY to enable robot registration relay',
      });
    }

    try {
      // Create provider and wallet
      const provider = new ethers.JsonRpcProvider(config.RPC_URL);
      const relayerWallet = new Wallet(config.RELAYER_PRIVATE_KEY, provider);

      const identityRegistry = new ethers.Contract(
        config.IDENTITY_REGISTRY_ADDRESS,
        IDENTITY_REGISTRY_ABI,
        relayerWallet
      );

      // Check if already registered on-chain
      const existingController = await identityRegistry.getController(robotId);
      if (existingController !== ethers.ZeroAddress) {
        // Update local status
        execute(
          'UPDATE robots SET status = ?, registered_at = ?, updated_at = ? WHERE id = ?',
          ['registered', Date.now(), Date.now(), robot.id]
        );

        return reply.status(200).send({
          success: true,
          alreadyRegistered: true,
          robotId,
          controller: existingController,
          message: 'Robot was already registered on-chain',
        });
      }

      // Submit registration tx
      fastify.log.info(`[REGISTER] Registering robot ${robotId} with controller ${robot.controller_address}`);

      const tx = await identityRegistry.registerRobot(
        robotId,
        robot.controller_address,
        pubkey || '0x', // Empty pubkey if not provided
        {
          gasLimit: 200000,
          maxFeePerGas: ethers.parseUnits(String(config.MAX_FEE_PER_GAS_GWEI), 'gwei'),
          maxPriorityFeePerGas: ethers.parseUnits(String(config.MAX_PRIORITY_FEE_GWEI), 'gwei'),
        }
      );

      fastify.log.info(`[REGISTER] Tx submitted: ${tx.hash}`);

      const receipt = await tx.wait();

      // Update robot record
      execute(
        'UPDATE robots SET status = ?, registered_tx = ?, registered_at = ?, updated_at = ? WHERE id = ?',
        ['registered', tx.hash, Date.now(), Date.now(), robot.id]
      );

      fastify.log.info(`[REGISTER] Robot ${robotId} registered in block ${receipt.blockNumber}`);

      return {
        success: true,
        robotId,
        controller: robot.controller_address,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorerUrl: `https://basescan.org/tx/${tx.hash}`,
      };
    } catch (error) {
      const err = error as Error;
      fastify.log.error(`[REGISTER] Failed: ${err.message}`);

      // Parse common errors
      if (err.message.includes('RobotAlreadyRegistered')) {
        return reply.status(409).send({
          error: 'Robot already registered on-chain',
          code: 'ALREADY_REGISTERED',
        });
      }

      return reply.status(500).send({
        error: 'Registration failed',
        code: 'TX_FAILED',
        message: err.message,
      });
    }
  });

  /**
   * GET /v1/onboard/:tenantId
   *
   * Get onboarding status and webhook snippet
   */
  fastify.get<{ Params: { tenantId: string } }>('/onboard/:tenantId', async (request, reply) => {
    const { tenantId } = request.params;
    const authTenantId = (request as any).tenantId;

    // Must be authenticated as this tenant
    if (authTenantId !== tenantId) {
      return reply.status(403).send({
        error: 'Access denied',
        code: 'FORBIDDEN',
      });
    }

    const tenant = getTenant(tenantId);
    if (!tenant) {
      return reply.status(404).send({
        error: 'Tenant not found',
        code: 'NOT_FOUND',
      });
    }

    // Get robots for this tenant
    const robots = query<RobotRecord>(
      'SELECT * FROM robots WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );

    const baseUrl = config.API_BASE_URL || `http://localhost:${config.PORT}`;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        created_at: tenant.created_at,
      },
      robots: robots.map(r => ({
        robotId: r.robot_id,
        controllerAddress: r.controller_address,
        status: r.status,
        registeredTx: r.registered_tx,
        registeredAt: r.registered_at,
      })),
      webhook: {
        endpoint: `${baseUrl}/connectors/webhook/complete`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer vrwx_****_****',
        },
      },
      contracts: {
        chainId: config.DEFAULT_CHAIN_ID,
        network: 'Base Mainnet',
        identityRegistry: config.IDENTITY_REGISTRY_ADDRESS,
        jobEscrow: config.JOB_ESCROW_ADDRESS,
      },
    };
  });

  /**
   * GET /v1/robots
   *
   * List all robots for authenticated tenant
   */
  fastify.get('/robots', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const robots = query<RobotRecord>(
      'SELECT * FROM robots WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );

    return {
      count: robots.length,
      robots: robots.map(r => ({
        robotId: r.robot_id,
        controllerAddress: r.controller_address,
        status: r.status,
        registeredTx: r.registered_tx,
        registeredAt: r.registered_at,
        createdAt: r.created_at,
      })),
    };
  });

  /**
   * POST /v1/robots/add
   *
   * Add another robot to existing tenant
   * Returns connectUrl for one-time secrets download
   */
  fastify.post<{ Body: { robotName?: string } }>('/robots/add', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { robotName } = request.body;

    // Generate new controller keypair
    const controllerWallet = Wallet.createRandom();
    const controllerAddress = controllerWallet.address;
    const controllerPrivateKey = controllerWallet.privateKey;

    // Generate robotId
    const robotId = generateRobotId(tenantId, robotName);

    // Check if robotId already exists
    const existing = queryOne<RobotRecord>(
      'SELECT * FROM robots WHERE robot_id = ?',
      [robotId]
    );

    if (existing) {
      return reply.status(409).send({
        error: 'Robot ID already exists',
        code: 'DUPLICATE_ROBOT',
        hint: 'Use a different robotName or let system generate unique ID',
      });
    }

    // Store robot record
    const robotRecordId = randomBytes(16).toString('hex');
    const now = Date.now();

    execute(
      `INSERT INTO robots (id, tenant_id, robot_id, controller_address, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [robotRecordId, tenantId, robotId, controllerAddress, 'pending', now, now]
    );

    // Generate connect token with encrypted secrets (need to get existing apiKey)
    // For add robot, we generate a new connect token but the apiKey stays the same
    // The user will need their existing apiKey to use this robot
    const shortToken = generateShortToken();
    const tokenId = randomBytes(16).toString('hex');
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes TTL

    // Store secrets for new robot only (apiKey not included - user already has it)
    const secrets = {
      controllerPrivateKey,
      robotId,
      controllerAddress,
      note: 'Use your existing API key with this new robot',
    };
    const encryptedSecrets = encryptSecrets(secrets);

    execute(
      `INSERT INTO connect_tokens (id, tenant_id, robot_id, token, secrets_json, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tokenId, tenantId, robotId, shortToken, encryptedSecrets, expiresAt, now]
    );

    const baseUrl = config.API_BASE_URL || `http://localhost:${config.PORT}`;

    return {
      success: true,
      robot: {
        robotId,
        controllerAddress,
        status: 'pending',
      },
      connectUrl: `${baseUrl}/connect/${shortToken}`,
      expiresIn: '10 minutes',
      note: 'Visit connectUrl to download the controller private key (one-time only)',
    };
  });

  /**
   * GET /v1/robot-config/:robotId
   *
   * Download non-secret robot configuration (re-downloadable)
   */
  fastify.get<{ Params: { robotId: string } }>('/robot-config/:robotId', async (request, reply) => {
    const { robotId } = request.params;

    const robot = queryOne<RobotRecord>(
      'SELECT * FROM robots WHERE robot_id = ?',
      [robotId]
    );

    if (!robot) {
      return reply.status(404).send({
        error: 'Robot not found',
        code: 'NOT_FOUND',
      });
    }

    const baseUrl = config.API_BASE_URL || `http://localhost:${config.PORT}`;

    // Non-secret config - can be re-downloaded anytime
    return {
      robotId: robot.robot_id,
      controllerAddress: robot.controller_address,
      webhookUrl: `${baseUrl}/connectors/webhook/complete`,
      apiBaseUrl: baseUrl,
      chainId: config.DEFAULT_CHAIN_ID,
      authHeaderTemplate: 'Authorization: Bearer <API_KEY>',
      contracts: {
        identityRegistry: config.IDENTITY_REGISTRY_ADDRESS,
        jobEscrow: config.JOB_ESCROW_ADDRESS,
      },
    };
  });
};

// Export helpers for connect.ts
export { decryptSecrets, ConnectTokenRecord };
