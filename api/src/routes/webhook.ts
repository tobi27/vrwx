import { FastifyPluginAsync } from 'fastify';
import { keccak256, toUtf8Bytes } from 'ethers';
import { SERVICE_TYPE_HASHES, ServiceType, isValidServiceType } from './services.js';
import { storeManifest, retrieveManifest, getStorage, isStrictMode, type ExecutionManifest } from '../storage/index.js';
import { config, getServiceModuleVersion } from '../config.js';
import {
  withIdempotency,
  generateIdempotencyKey,
  hashRequest,
  IdempotencyConflictError,
} from '../middleware/idempotency.js';
import { enqueueDLQ } from '../services/dlq.js';
import {
  verifyControllerSignature,
  submitCompletionV2,
  buildClaimForSigning,
  getJob,
  getControllerForRobot,
  registerRobot,
  type CompletionClaimV2,
} from '../services/relayer.js';
import { resolveRobotFromApiKey } from '../middleware/auth.js';
import { execute, queryOne } from '../db/index.js';
import { randomBytes } from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface WebhookCompleteBody {
  serviceType: ServiceType;
  jobId: number;
  robotId: string;
  controller?: string; // Optional: derived from robotId via IdentityRegistry if not provided
  eventBundle: unknown[];
  artifacts?: Array<{ type: string; sha256: string; bytes: number }>;
  // Service-specific fields
  inspection?: { coverageVisited: number; coverageTotal: number };
  patrol?: { checkpointsVisited: string[]; dwellSeconds: number[]; expectedCheckpoints?: string[] };
  delivery?: { pickupProofHash: string; dropoffProofHash: string };
  // Timestamps (optional - will use now if not provided)
  startTs?: number;
  endTs?: number;
  // M4.3: Controller signature (EIP-712) for relay mode
  controllerSig?: string;
}

interface WebhookCompleteQuery {
  dryRun?: string; // "1" or "true" to enable dry run
  chainId?: string; // Override chain ID
  mode?: string; // "selfSubmit" to return typed data instead of relaying
}

interface CompletionResponse {
  // M4.3: Primary response fields
  accepted: boolean;
  success: boolean;
  jobId: number;
  serviceType: string;
  serviceTypeHash: string;
  manifestHash: string;
  manifestUrl: string;
  hashMatch: boolean;
  // Transaction fields (relay mode)
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  // Metadata
  storageProvider: string;
  strictMode: boolean;
  dryRun: boolean;
  cached: boolean;
  relayMode: 'relay' | 'selfSubmit';
  idempotencyKey: string;
  versions: {
    manifestVersion: string;
    schemaVersion: string;
    serviceModuleVersion: string;
  };
  computedValues: {
    qualityScore: number;
    workUnits: number;
  };
  // Legacy completionClaim (for selfSubmit mode)
  completionClaim?: {
    jobId: number;
    completionHash: string;
    qualityScore: number;
    workUnits: number;
    signatureRequired: boolean;
    message: string;
  };
  // selfSubmit mode: typed data for client signing
  typedData?: {
    domain: unknown;
    types: unknown;
    message: unknown;
  };
}

// ============================================================================
// Canonical JSON serialization (for deterministic hashing)
// TODO: Migrate to @vrwx/proof once package dependencies are resolved
// ============================================================================

function canonicalizeManifest(manifest: ExecutionManifest): string {
  const sortKeys = (obj: unknown): unknown => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj as object)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
          return acc;
        },
        {} as Record<string, unknown>
      );
  };
  return JSON.stringify(sortKeys(manifest));
}

function hashManifest(manifest: ExecutionManifest): string {
  const canonical = canonicalizeManifest(manifest);
  return keccak256(toUtf8Bytes(canonical));
}

// ============================================================================
// Service module implementations (quality/workUnits computation)
// ============================================================================

interface QualityWorkUnits {
  qualityScore: number;
  workUnits: number;
}

function computeInspection(manifest: ExecutionManifest): QualityWorkUnits {
  const inspection = manifest.inspection;
  if (!inspection) {
    return { qualityScore: 0, workUnits: 0 };
  }

  const coverageRatio = inspection.coverageTotal > 0 ? inspection.coverageVisited / inspection.coverageTotal : 0;
  const hasArtifacts = (manifest.artifacts?.length || 0) > 0;

  const qualityScore = Math.round(coverageRatio * 80 + (hasArtifacts ? 20 : 0));
  const workUnits = inspection.coverageVisited + (manifest.artifacts?.length || 0);

  return { qualityScore: Math.min(qualityScore, 120), workUnits };
}

function computePatrol(manifest: ExecutionManifest, expectedCheckpoints?: string[]): QualityWorkUnits {
  const patrol = manifest.patrol;
  if (!patrol) {
    return { qualityScore: 0, workUnits: 0 };
  }

  const checkpointRatio =
    expectedCheckpoints && expectedCheckpoints.length > 0
      ? patrol.checkpointsVisited.length / expectedCheckpoints.length
      : patrol.checkpointsVisited.length > 0
        ? 1
        : 0;

  // Dwell compliance (30% weight)
  let dwellCompliance = 1;
  if (patrol.dwellSeconds.length > 0) {
    const avgDwell = patrol.dwellSeconds.reduce((a, b) => a + b, 0) / patrol.dwellSeconds.length;
    dwellCompliance = Math.min(avgDwell / 30, 1); // 30 seconds target
  }

  const qualityScore = Math.round(checkpointRatio * 70 + dwellCompliance * 30);
  const workUnits = patrol.checkpointsVisited.length;

  return { qualityScore: Math.min(qualityScore, 120), workUnits };
}

function computeDelivery(manifest: ExecutionManifest): QualityWorkUnits {
  const delivery = manifest.delivery;
  if (!delivery) {
    return { qualityScore: 0, workUnits: 0 };
  }

  let qualityScore = 0;

  // Pickup proof (40%)
  if (delivery.pickupProofHash && delivery.pickupProofHash.length > 0) {
    qualityScore += 40;
  }

  // Dropoff proof (40%)
  if (delivery.dropoffProofHash && delivery.dropoffProofHash.length > 0) {
    qualityScore += 40;
  }

  // Route digest (10%)
  if (manifest.routeDigest && manifest.routeDigest.length > 0) {
    qualityScore += 10;
  }

  // Timing (10%) - assume on-time if duration is reasonable
  const durationMinutes = (manifest.endTs - manifest.startTs) / 60;
  if (durationMinutes > 0 && durationMinutes < 120) {
    // Under 2 hours
    qualityScore += 10;
  }

  return { qualityScore: Math.min(qualityScore, 120), workUnits: 1 };
}

function computeQualityWorkUnits(manifest: ExecutionManifest, extra?: { expectedCheckpoints?: string[] }): QualityWorkUnits {
  switch (manifest.serviceType) {
    case 'inspection':
      return computeInspection(manifest);
    case 'security_patrol':
      return computePatrol(manifest, extra?.expectedCheckpoints);
    case 'delivery':
      return computeDelivery(manifest);
    default:
      return { qualityScore: 100, workUnits: 1 };
  }
}

// ============================================================================
// Webhook Routes
// ============================================================================

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /connectors/webhook/complete
   *
   * Universal completion webhook with strict pipeline:
   * A) Validate request auth + rate limit (future)
   * B) Validate JobSpec schema + serviceType
   * C) Build ExecutionManifest with versions
   * D) Canonicalize manifest
   * E) Compute manifestHash
   * F) Upload manifest (R2/S3/local)
   * G) Verify: recompute hash from stored bytes
   * H) Recompute qualityScore/workUnits (never trust declarative)
   * I) Build completion claim
   * J) Pass through idempotency guard
   * K) Return response
   */
  fastify.post<{ Body: WebhookCompleteBody; Querystring: WebhookCompleteQuery }>(
    '/complete',
    async (request, reply) => {
      const {
        serviceType,
        jobId,
        robotId,
        controller,
        eventBundle,
        artifacts,
        inspection,
        patrol,
        delivery,
        startTs: providedStartTs,
        endTs: providedEndTs,
        controllerSig,
      } = request.body;

      // Parse query params
      const dryRun = request.query.dryRun === '1' || request.query.dryRun === 'true';
      const chainId = request.query.chainId ? parseInt(request.query.chainId) : config.DEFAULT_CHAIN_ID;
      const selfSubmitMode = request.query.mode === 'selfSubmit' || config.RELAY_MODE === 'selfSubmit';
      const relayMode = !selfSubmitMode && config.RELAY_MODE === 'relay';

      // =========================================
      // STEP A: Validate request
      // =========================================

      // Validate service type
      if (!isValidServiceType(serviceType)) {
        enqueueDLQ('VALIDATION_FAIL', request.body, 'Invalid serviceType', {
          connectorType: 'webhook',
          jobId,
          errorCode: 'INVALID_SERVICE_TYPE',
        });
        return reply.status(400).send({
          error: 'Invalid serviceType',
          code: 'INVALID_SERVICE_TYPE',
          validTypes: ['inspection', 'security_patrol', 'delivery'],
        });
      }

      if (!jobId || !robotId) {
        enqueueDLQ('VALIDATION_FAIL', request.body, 'Missing required fields', {
          connectorType: 'webhook',
          jobId,
          errorCode: 'MISSING_REQUIRED_FIELDS',
        });
        return reply.status(400).send({
          error: 'Missing required fields: jobId, robotId',
          code: 'MISSING_REQUIRED_FIELDS',
        });
      }

      // =========================================
      // STEP A.0: Resolve robotId from Bearer token if not provided
      // =========================================

      let resolvedRobotId = robotId;
      let tenantId: string | undefined;

      // Extract API key for robot resolution
      const authHeader = request.headers['x-api-key'] as string | undefined;
      const bearerHeader = request.headers.authorization;
      const apiKey = authHeader || (bearerHeader?.startsWith('Bearer ') ? bearerHeader.slice(7) : undefined);

      if (!resolvedRobotId && apiKey) {
        // Resolve robot from API key
        const resolved = resolveRobotFromApiKey(apiKey);
        if (resolved.valid && resolved.robot) {
          resolvedRobotId = resolved.robot.robot_id;
          tenantId = resolved.tenantId;
          fastify.log.info(`[RELAY] Resolved robotId from API key: ${resolvedRobotId}`);
        }
      }

      if (!resolvedRobotId) {
        enqueueDLQ('VALIDATION_FAIL', request.body, 'Missing robotId', {
          connectorType: 'webhook',
          jobId,
          errorCode: 'MISSING_ROBOT_ID',
        });
        return reply.status(400).send({
          error: 'Missing robotId - provide in body or use Bearer token with associated robot',
          code: 'MISSING_ROBOT_ID',
        });
      }

      // =========================================
      // STEP A.1: Derive controller from IdentityRegistry if not provided
      // =========================================

      let resolvedController = controller;
      let autoRegistered = false;

      if (!resolvedController) {
        // Derive controller from robotId via IdentityRegistry
        let registryController = await getControllerForRobot(resolvedRobotId);

        // AUTO-REGISTER: If robot not on-chain, register it automatically
        if (!registryController && config.RELAY_MODE === 'relay') {
          fastify.log.info(`[RELAY] Robot ${resolvedRobotId} not registered, attempting auto-register...`);

          // Get robot record from DB to get controller address
          const robotRecord = queryOne<{ controller_address: string; tenant_id: string }>(
            'SELECT controller_address, tenant_id FROM robots WHERE robot_id = ?',
            [resolvedRobotId]
          );

          if (robotRecord) {
            tenantId = robotRecord.tenant_id;
            try {
              const registerResult = await registerRobot(resolvedRobotId, robotRecord.controller_address);
              if (registerResult.success) {
                fastify.log.info(`[RELAY] Auto-registered robot ${resolvedRobotId}, tx: ${registerResult.txHash}`);
                registryController = robotRecord.controller_address;
                autoRegistered = true;

                // Update robot status in DB
                execute(
                  'UPDATE robots SET status = ?, registered_tx = ?, registered_at = ?, updated_at = ? WHERE robot_id = ?',
                  ['registered', registerResult.txHash, Date.now(), Date.now(), resolvedRobotId]
                );
              } else {
                fastify.log.error(`[RELAY] Auto-register failed: ${registerResult.error}`);
              }
            } catch (err) {
              fastify.log.error(`[RELAY] Auto-register error: ${(err as Error).message}`);
            }
          }
        }

        if (!registryController) {
          enqueueDLQ('VALIDATION_FAIL', request.body, 'Robot not registered in IdentityRegistry', {
            connectorType: 'webhook',
            jobId,
            robotId: resolvedRobotId,
            errorCode: 'ROBOT_NOT_REGISTERED',
          });
          return reply.status(404).send({
            error: `Robot ${resolvedRobotId} not registered in IdentityRegistry`,
            code: 'ROBOT_NOT_REGISTERED',
            hint: 'Robot must be registered before submitting completions',
          });
        }
        resolvedController = registryController;
        fastify.log.info(`[RELAY] Derived controller from IdentityRegistry: ${resolvedController}`);
      }

      // =========================================
      // STEP B-C: Build ExecutionManifest with versions
      // =========================================

      const now = Math.floor(Date.now() / 1000);
      const manifest: ExecutionManifest & {
        manifestVersion: string;
        schemaVersion: string;
        serviceModuleVersion: string;
      } = {
        // Version fields
        manifestVersion: config.CURRENT_MANIFEST_VERSION,
        schemaVersion: config.CURRENT_SCHEMA_VERSION,
        serviceModuleVersion: getServiceModuleVersion(serviceType),
        // Core fields
        jobId,
        robotId: resolvedRobotId, // Use resolved robotId
        controller: resolvedController, // Use resolved controller (derived or provided)
        serviceType,
        startTs: providedStartTs || now - 3600, // Default: 1 hour ago
        endTs: providedEndTs || now,
        artifacts: artifacts || [],
      };

      // Add service-specific data
      if (serviceType === 'inspection' && inspection) {
        manifest.inspection = inspection;
      }
      if (serviceType === 'security_patrol' && patrol) {
        manifest.patrol = {
          checkpointsVisited: patrol.checkpointsVisited,
          dwellSeconds: patrol.dwellSeconds,
        };
      }
      if (serviceType === 'delivery' && delivery) {
        manifest.delivery = delivery;
      }

      // Compute route digest from eventBundle
      if (eventBundle && eventBundle.length > 0) {
        manifest.routeDigest = keccak256(toUtf8Bytes(JSON.stringify(eventBundle)));
      }

      // =========================================
      // STEP D-E: Canonicalize and hash manifest
      // =========================================

      const manifestHash = hashManifest(manifest);

      // =========================================
      // STEP H: Compute quality and work units (NEVER trust declarative)
      // =========================================

      const { qualityScore, workUnits } = computeQualityWorkUnits(manifest, {
        expectedCheckpoints: patrol?.expectedCheckpoints,
      });

      // =========================================
      // STEP J: Idempotency guard
      // =========================================

      const idempotencyKey = generateIdempotencyKey(chainId, jobId);
      const requestHash = hashRequest(request.body);

      try {
        const { result, cached } = await withIdempotency<CompletionResponse>(
          idempotencyKey,
          requestHash,
          manifestHash,
          async () => {
            // =========================================
            // STEP F: Store manifest (inside idempotency handler)
            // =========================================

            let manifestUrl: string;
            try {
              if (!dryRun) {
                manifestUrl = await storeManifest(manifestHash, manifest);
                fastify.log.info(`Manifest stored: ${manifestHash} -> ${manifestUrl}`);
              } else {
                // Dry run: generate URL without storing
                manifestUrl = getStorage().getUrl(manifestHash);
                fastify.log.info(`Dry run: manifest would be stored at ${manifestUrl}`);
              }
            } catch (error) {
              // In strict mode, storage failure = completion failure
              if (isStrictMode() && config.VRWX_STORAGE_REQUIRED) {
                const err = error as Error;
                enqueueDLQ('UPLOAD_FAIL', request.body, err.message, {
                  connectorType: 'webhook',
                  serviceType,
                  jobId,
                  manifestHash,
                  errorCode: 'STORAGE_UPLOAD_FAILED',
                  errorStack: err.stack,
                });
                throw new Error(`Storage failure (strict mode): ${err.message}`);
              }
              // Non-strict mode: continue with fallback URL
              manifestUrl = getStorage().getUrl(manifestHash);
              fastify.log.warn(`Storage failed, using fallback URL: ${manifestUrl}`);
            }

            // =========================================
            // STEP G: Verify hash (if stored and strict mode)
            // =========================================

            if (!dryRun && isStrictMode()) {
              try {
                const storedManifest = await retrieveManifest(manifestHash);
                if (storedManifest) {
                  const recomputedHash = hashManifest(storedManifest);
                  if (recomputedHash !== manifestHash) {
                    enqueueDLQ('HASH_MISMATCH', request.body, `Hash mismatch: ${recomputedHash} !== ${manifestHash}`, {
                      connectorType: 'webhook',
                      serviceType,
                      jobId,
                      manifestHash,
                      errorCode: 'HASH_VERIFICATION_FAILED',
                    });
                    throw new Error(`Hash verification failed: stored manifest hash mismatch`);
                  }
                }
              } catch (verifyError) {
                if ((verifyError as Error).message.includes('Hash verification')) {
                  throw verifyError;
                }
                // Retrieval error in strict mode is acceptable (may be async storage)
                fastify.log.warn(`Could not verify stored manifest: ${verifyError}`);
              }
            }

            // =========================================
            // STEP I: Build completion claim and handle relay/selfSubmit
            // =========================================

            fastify.log.info(
              `Webhook complete: job=${jobId}, service=${serviceType}, quality=${qualityScore}, workUnits=${workUnits}, dryRun=${dryRun}, relayMode=${relayMode}`
            );

            // Build base response
            const response: CompletionResponse = {
              accepted: false, // Will be set to true on success
              success: false,
              jobId,
              serviceType,
              serviceTypeHash: SERVICE_TYPE_HASHES[serviceType],
              manifestHash,
              manifestUrl,
              hashMatch: true, // Verified in Step G
              storageProvider: getStorage().provider,
              strictMode: isStrictMode(),
              dryRun,
              cached: false,
              relayMode: relayMode ? 'relay' : 'selfSubmit',
              idempotencyKey,
              versions: {
                manifestVersion: config.CURRENT_MANIFEST_VERSION,
                schemaVersion: config.CURRENT_SCHEMA_VERSION,
                serviceModuleVersion: getServiceModuleVersion(serviceType),
              },
              computedValues: {
                qualityScore,
                workUnits,
              },
            };

            // =========================================
            // STEP J: Relay mode - verify signature and submit tx
            // =========================================

            if (relayMode && !dryRun) {
              // In strict mode: controllerSig is REQUIRED
              // In non-strict mode: controllerSig is OPTIONAL (custodial mode)
              const strictProof = config.VRWX_STRICT_PROOF;

              if (strictProof && !controllerSig) {
                enqueueDLQ('VALIDATION_FAIL', request.body, 'Missing controllerSig in strict mode', {
                  connectorType: 'webhook',
                  jobId,
                  errorCode: 'SIGNATURE_REQUIRED',
                });
                throw new Error('controllerSig is required in strict mode. Provide EIP-712 signature or disable VRWX_STRICT_PROOF');
              }

              // If controllerSig provided, verify it (both strict and non-strict modes)
              if (controllerSig) {
                // Build claim for verification
                const claimData = await buildClaimForSigning(
                  BigInt(jobId),
                  manifestHash,
                  qualityScore,
                  workUnits
                );

                if (!claimData) {
                  enqueueDLQ('VALIDATION_FAIL', request.body, 'Failed to build claim - job not found', {
                    connectorType: 'webhook',
                    jobId,
                    errorCode: 'JOB_NOT_FOUND',
                  });
                  throw new Error('Failed to build claim: job not found or robot not registered');
                }

                // Verify controller signature against IdentityRegistry
                const verifyResult = await verifyControllerSignature(claimData.claim, controllerSig);
                if (!verifyResult.valid) {
                  enqueueDLQ('VALIDATION_FAIL', request.body, verifyResult.error || 'Signature verification failed', {
                    connectorType: 'webhook',
                    jobId,
                    errorCode: 'INVALID_SIGNATURE',
                    recoveredAddress: verifyResult.recoveredAddress,
                    expectedController: verifyResult.expectedController,
                  });
                  throw new Error(`Signature verification failed: ${verifyResult.error}`);
                }

                // =========================================
                // ENFORCE TRIPLE EQUALITY:
                // controller (if provided) == recoveredSigner == IdentityRegistry.controllerOf(robotId)
                // =========================================
                if (controller) {
                  // Controller was explicitly provided - enforce triple equality
                  const recoveredLower = verifyResult.recoveredAddress?.toLowerCase();
                  const expectedLower = verifyResult.expectedController?.toLowerCase();
                  const providedLower = controller.toLowerCase();

                  if (providedLower !== recoveredLower || providedLower !== expectedLower) {
                    enqueueDLQ('VALIDATION_FAIL', request.body, 'Triple equality check failed', {
                      connectorType: 'webhook',
                      jobId,
                      errorCode: 'CONTROLLER_MISMATCH',
                      providedController: controller,
                      recoveredSigner: verifyResult.recoveredAddress,
                      registryController: verifyResult.expectedController,
                    });
                    throw new Error(
                      `Controller mismatch: provided=${controller}, signer=${verifyResult.recoveredAddress}, registry=${verifyResult.expectedController}`
                    );
                  }
                  fastify.log.info(`[RELAY] Triple equality verified: ${controller}`);
                }

                fastify.log.info(`[RELAY] Signature verified for job ${jobId}, controller: ${verifyResult.recoveredAddress}`);

                // Submit transaction via relayer (with verified signature)
                const relayResult = await submitCompletionV2(
                  BigInt(jobId),
                  manifestHash,
                  qualityScore,
                  workUnits,
                  controllerSig
                );

                if (!relayResult.success) {
                  enqueueDLQ('TX_FAIL', request.body, relayResult.error || 'Transaction failed', {
                    connectorType: 'webhook',
                    jobId,
                    manifestHash,
                    errorCode: 'RELAY_TX_FAILED',
                  });
                  throw new Error(`Transaction failed: ${relayResult.error}`);
                }

                // Success - populate tx fields
                response.accepted = true;
                response.success = true;
                response.txHash = relayResult.txHash;
                response.blockNumber = relayResult.blockNumber;
                response.gasUsed = relayResult.gasUsed;

                fastify.log.info(`[RELAY] Tx submitted: ${relayResult.txHash} in block ${relayResult.blockNumber}`);
              } else {
                // Non-strict mode without controllerSig: custodial mode
                // Store completion locally, no on-chain tx (manifest proof only)
                fastify.log.info(`[RELAY] Custodial mode: storing job ${jobId} without on-chain tx (no controllerSig)`);

                response.accepted = true;
                response.success = true;
                // No txHash - custodial mode doesn't submit on-chain
              }

              // Store job completion in DB for live feed (both modes)
              if (tenantId) {
                const completionId = randomBytes(16).toString('hex');
                const completionNow = Date.now();
                try {
                  execute(
                    `INSERT OR REPLACE INTO job_completions
                     (id, tenant_id, robot_id, job_id, service_type, manifest_hash, tx_hash, status, hash_match, quality_score, work_units, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [completionId, tenantId, resolvedRobotId, jobId, serviceType, manifestHash, response.txHash || null, controllerSig ? 'completed' : 'custodial', controllerSig ? 1 : 0, qualityScore, workUnits, completionNow, completionNow]
                  );
                  fastify.log.info(`[RELAY] Job completion stored for tenant ${tenantId}`);
                } catch (dbErr) {
                  fastify.log.warn(`[RELAY] Failed to store job completion: ${(dbErr as Error).message}`);
                }
              }
            }

            // =========================================
            // STEP K: SelfSubmit mode - return typed data for client signing
            // =========================================

            else if (selfSubmitMode || dryRun) {
              // Build typed data for client signing
              const claimData = await buildClaimForSigning(
                BigInt(jobId),
                manifestHash,
                qualityScore,
                workUnits
              );

              response.accepted = true;
              response.success = true;

              if (claimData) {
                response.typedData = {
                  domain: claimData.domain,
                  types: claimData.types,
                  message: {
                    jobId: claimData.claim.jobId.toString(),
                    jobSpecHash: claimData.claim.jobSpecHash,
                    completionHash: claimData.claim.completionHash,
                    robotId: claimData.claim.robotId,
                    controller: claimData.claim.controller,
                    deadline: claimData.claim.deadline.toString(),
                    qualityScore: claimData.claim.qualityScore,
                    workUnits: claimData.claim.workUnits,
                  },
                };
              }

              // Legacy completionClaim for backwards compatibility
              response.completionClaim = {
                jobId,
                completionHash: manifestHash,
                qualityScore,
                workUnits,
                signatureRequired: !dryRun,
                message: dryRun
                  ? 'Dry run: no transaction submitted'
                  : 'Sign typedData with controller key and submit to JobEscrow.submitCompletionV2',
              };
            }

            return response;
          }
        );

        // Mark if cached response
        if (cached) {
          result.cached = true;
          fastify.log.info(`Idempotency cache hit: ${idempotencyKey}`);
        }

        return result;
      } catch (error) {
        // Handle idempotency conflict (202 Accepted - processing)
        if (error instanceof IdempotencyConflictError) {
          return reply.status(202).send({
            status: 'processing',
            message: error.message,
            idempotencyKey,
            retryAfterMs: error.retryAfterMs,
          });
        }

        const err = error as Error;

        // Handle signature errors (400 Bad Request)
        if (err.message.includes('controllerSig is required') || err.message.includes('Signature verification failed')) {
          return reply.status(400).send({
            error: err.message,
            code: 'SIGNATURE_ERROR',
            idempotencyKey,
          });
        }

        // Handle controller mismatch (400 Bad Request)
        if (err.message.includes('Controller mismatch')) {
          return reply.status(400).send({
            error: err.message,
            code: 'CONTROLLER_MISMATCH',
            idempotencyKey,
          });
        }

        // Handle relay transaction failures (502 Bad Gateway)
        if (err.message.includes('Transaction failed')) {
          return reply.status(502).send({
            error: err.message,
            code: 'RELAY_TX_FAILED',
            idempotencyKey,
          });
        }

        // Handle job not found (404)
        if (err.message.includes('job not found') || err.message.includes('robot not registered')) {
          return reply.status(404).send({
            error: err.message,
            code: 'JOB_NOT_FOUND',
            idempotencyKey,
          });
        }

        // Handle strict mode failures
        if (err.message.includes('strict mode') || err.message.includes('Hash verification')) {
          return reply.status(502).send({
            error: err.message,
            code: 'STRICT_MODE_FAILURE',
            idempotencyKey,
          });
        }

        // Re-throw other errors
        throw error;
      }
    }
  );

  /**
   * GET /connectors/webhook/status/:jobId
   *
   * Check idempotency status for a job
   */
  fastify.get<{ Params: { jobId: string }; Querystring: { chainId?: string } }>(
    '/status/:jobId',
    async (request, reply) => {
      const jobId = parseInt(request.params.jobId);
      const chainId = request.query.chainId ? parseInt(request.query.chainId) : config.DEFAULT_CHAIN_ID;

      if (isNaN(jobId)) {
        return reply.status(400).send({ error: 'Invalid jobId' });
      }

      const key = generateIdempotencyKey(chainId, jobId);

      // Import here to avoid circular dependency
      const { getIdempotencyRecord } = await import('../middleware/idempotency.js');
      const record = getIdempotencyRecord(key);

      if (!record) {
        return reply.status(404).send({
          error: 'No completion found for this job',
          idempotencyKey: key,
        });
      }

      return {
        idempotencyKey: key,
        status: record.status,
        manifestHash: record.manifest_hash,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        cached: record.status === 'COMPLETED',
        response: record.response_json ? JSON.parse(record.response_json) : null,
        error: record.error_code
          ? { code: record.error_code, message: record.error_message }
          : null,
      };
    }
  );

  /**
   * GET /connectors/webhook/manifests/:hash
   *
   * Retrieve stored manifest (legacy endpoint)
   */
  fastify.get<{ Params: { hash: string } }>('/manifests/:hash', async (request, reply) => {
    const { hash } = request.params;

    const manifest = await retrieveManifest(hash);
    if (!manifest) {
      return reply.status(404).send({ error: 'Manifest not found' });
    }

    const storage = getStorage();
    return {
      manifest,
      hash,
      url: storage.getUrl(hash),
    };
  });

  /**
   * POST /connectors/webhook/verify
   *
   * Verify quality/workUnits against manifest
   */
  fastify.post<{ Body: { manifestHash: string; claimedQuality: number; claimedWorkUnits: number } }>(
    '/verify',
    async (request, reply) => {
      const { manifestHash, claimedQuality, claimedWorkUnits } = request.body;

      const manifest = await retrieveManifest(manifestHash);
      if (!manifest) {
        return reply.status(404).send({ error: 'Manifest not found' });
      }

      const { qualityScore, workUnits } = computeQualityWorkUnits(manifest);

      const qualityMatch = claimedQuality === qualityScore;
      const workUnitsMatch = claimedWorkUnits === workUnits;

      if (!qualityMatch || !workUnitsMatch) {
        return reply.status(400).send({
          error: 'Verification failed - values do not match',
          claimed: { quality: claimedQuality, workUnits: claimedWorkUnits },
          computed: { quality: qualityScore, workUnits },
          match: { quality: qualityMatch, workUnits: workUnitsMatch },
        });
      }

      return {
        verified: true,
        manifestHash,
        values: { qualityScore, workUnits },
      };
    }
  );
};
