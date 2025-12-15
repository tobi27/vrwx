import { FastifyPluginAsync } from 'fastify';
import { keccak256, toUtf8Bytes } from 'ethers';
import { getStorage, retrieveManifest, type ExecutionManifest } from '../storage/index.js';
import { isValidServiceType, SERVICE_TYPE_HASHES, type ServiceType } from './services.js';
import { config, getServiceModuleVersion } from '../config.js';

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
// Quality/WorkUnits computation (same as webhook.ts)
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

function computePatrol(manifest: ExecutionManifest): QualityWorkUnits {
  const patrol = manifest.patrol;
  if (!patrol) {
    return { qualityScore: 0, workUnits: 0 };
  }

  const checkpointRatio = patrol.checkpointsVisited.length > 0 ? 1 : 0;

  let dwellCompliance = 1;
  if (patrol.dwellSeconds.length > 0) {
    const avgDwell = patrol.dwellSeconds.reduce((a, b) => a + b, 0) / patrol.dwellSeconds.length;
    dwellCompliance = Math.min(avgDwell / 30, 1);
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

  if (delivery.pickupProofHash && delivery.pickupProofHash.length > 0) {
    qualityScore += 40;
  }

  if (delivery.dropoffProofHash && delivery.dropoffProofHash.length > 0) {
    qualityScore += 40;
  }

  if (manifest.routeDigest && manifest.routeDigest.length > 0) {
    qualityScore += 10;
  }

  const durationMinutes = (manifest.endTs - manifest.startTs) / 60;
  if (durationMinutes > 0 && durationMinutes < 120) {
    qualityScore += 10;
  }

  return { qualityScore: Math.min(qualityScore, 120), workUnits: 1 };
}

function computeQualityWorkUnits(manifest: ExecutionManifest): QualityWorkUnits {
  switch (manifest.serviceType) {
    case 'inspection':
      return computeInspection(manifest);
    case 'security_patrol':
      return computePatrol(manifest);
    case 'delivery':
      return computeDelivery(manifest);
    default:
      return { qualityScore: 100, workUnits: 1 };
  }
}

// ============================================================================
// Manifest Routes
// ============================================================================

export const manifestsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /manifests/:hash
   *
   * Retrieve stored manifest
   */
  fastify.get<{ Params: { hash: string } }>('/:hash', async (request, reply) => {
    const { hash } = request.params;

    const manifest = await retrieveManifest(hash);
    if (!manifest) {
      return reply.status(404).send({ error: 'Manifest not found', hash });
    }

    const storage = getStorage();

    return {
      manifest,
      hash,
      url: storage.getUrl(hash),
      serviceType: manifest.serviceType,
      serviceTypeHash: isValidServiceType(manifest.serviceType as ServiceType)
        ? SERVICE_TYPE_HASHES[manifest.serviceType as ServiceType]
        : undefined,
    };
  });

  /**
   * GET /manifests/:hash/verify
   *
   * Verify manifest hash and recompute values
   * Enhanced response with version fields per M4.2 spec
   */
  fastify.get<{ Params: { hash: string } }>('/:hash/verify', async (request, reply) => {
    const { hash } = request.params;

    const manifest = await retrieveManifest(hash);
    if (!manifest) {
      return reply.status(404).send({ error: 'Manifest not found', hash });
    }

    const storage = getStorage();

    // Recompute hash
    const recomputedHash = hashManifest(manifest);
    const hashMatch = recomputedHash === hash;

    // Recompute quality and work units
    const { qualityScore, workUnits } = computeQualityWorkUnits(manifest);

    // Extract version fields from manifest or use defaults
    const manifestWithVersions = manifest as ExecutionManifest & {
      manifestVersion?: string;
      schemaVersion?: string;
      serviceModuleVersion?: string;
    };

    return {
      // Core verification
      verified: hashMatch,
      hashMatch,
      storedHash: hash,
      recomputedHash,
      manifestUrl: storage.getUrl(hash),

      // Version fields (from manifest or defaults)
      manifestVersion: manifestWithVersions.manifestVersion || '1.0',
      schemaVersion: manifestWithVersions.schemaVersion || '2025-12-01',
      serviceModuleVersion:
        manifestWithVersions.serviceModuleVersion || getServiceModuleVersion(manifest.serviceType),

      // Service info
      serviceType: manifest.serviceType,
      serviceTypeHash: isValidServiceType(manifest.serviceType as ServiceType)
        ? SERVICE_TYPE_HASHES[manifest.serviceType as ServiceType]
        : undefined,

      // Computed values (authoritative)
      computedValues: {
        qualityScore,
        workUnits,
      },

      // Job info
      jobId: manifest.jobId,
      robotId: manifest.robotId,
      timestamps: {
        startTs: manifest.startTs,
        endTs: manifest.endTs,
        durationSeconds: manifest.endTs - manifest.startTs,
      },

      // Current API versions
      currentVersions: {
        manifestVersion: config.CURRENT_MANIFEST_VERSION,
        schemaVersion: config.CURRENT_SCHEMA_VERSION,
        serviceModuleVersion: getServiceModuleVersion(manifest.serviceType),
      },
    };
  });

  /**
   * POST /manifests/:hash/recompute
   *
   * Recompute quality/workUnits from manifest
   */
  fastify.post<{ Params: { hash: string } }>('/:hash/recompute', async (request, reply) => {
    const { hash } = request.params;

    const manifest = await retrieveManifest(hash);
    if (!manifest) {
      return reply.status(404).send({ error: 'Manifest not found', hash });
    }

    const { qualityScore, workUnits } = computeQualityWorkUnits(manifest);

    return {
      hash,
      serviceType: manifest.serviceType,
      qualityScore,
      workUnits,
      recomputedAt: new Date().toISOString(),
    };
  });

  /**
   * POST /manifests/verify-batch
   *
   * Verify multiple manifests
   */
  fastify.post<{ Body: { hashes: string[] } }>('/verify-batch', async (request, reply) => {
    const { hashes } = request.body;

    if (!hashes || !Array.isArray(hashes)) {
      return reply.status(400).send({ error: 'hashes array required' });
    }

    if (hashes.length > 100) {
      return reply.status(400).send({ error: 'Maximum 100 hashes per batch' });
    }

    const results = await Promise.all(
      hashes.map(async (hash) => {
        const manifest = await retrieveManifest(hash);
        if (!manifest) {
          return { hash, found: false, verified: false };
        }

        const recomputedHash = hashManifest(manifest);
        const hashMatch = recomputedHash === hash;
        const { qualityScore, workUnits } = computeQualityWorkUnits(manifest);

        // Extract version fields
        const manifestWithVersions = manifest as ExecutionManifest & {
          manifestVersion?: string;
          schemaVersion?: string;
          serviceModuleVersion?: string;
        };

        return {
          hash,
          found: true,
          verified: hashMatch,
          serviceType: manifest.serviceType,
          qualityScore,
          workUnits,
          versions: {
            manifestVersion: manifestWithVersions.manifestVersion || '1.0',
            schemaVersion: manifestWithVersions.schemaVersion || '2025-12-01',
            serviceModuleVersion:
              manifestWithVersions.serviceModuleVersion || getServiceModuleVersion(manifest.serviceType),
          },
        };
      })
    );

    const allVerified = results.every((r) => r.verified);
    const foundCount = results.filter((r) => r.found).length;

    return {
      totalRequested: hashes.length,
      found: foundCount,
      notFound: hashes.length - foundCount,
      allVerified,
      results,
    };
  });

  /**
   * GET /manifests/schema/current
   *
   * Get current schema and version info
   */
  fastify.get('/schema/current', async () => {
    return {
      currentVersions: {
        manifestVersion: config.CURRENT_MANIFEST_VERSION,
        schemaVersion: config.CURRENT_SCHEMA_VERSION,
      },
      acceptedSchemaVersions: config.VRWX_ACCEPT_SCHEMA_VERSIONS,
      serviceModuleVersions: {
        inspection: getServiceModuleVersion('inspection'),
        security_patrol: getServiceModuleVersion('security_patrol'),
        delivery: getServiceModuleVersion('delivery'),
      },
    };
  });
};
