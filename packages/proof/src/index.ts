/**
 * @vrwx/proof - Proof verification package
 *
 * Provides:
 * - Canonical manifest serialization
 * - Manifest hashing
 * - Deterministic quality/workUnits recomputation
 * - Verification utilities
 */

import type { ExecutionManifest, JobSpec, ServiceType, VerificationResult } from '../../../sdk/src/types';
import { getModule, isServiceTypeSupported, getServiceTypeHash } from '../../../services/modules';

// Re-export utilities
export { canonicalizeManifest, canonicalizeObject } from './canonicalize';
export { hashManifest, hashObject, hashString, hashServiceType } from './hash';

/**
 * Recompute quality score and work units from manifest
 *
 * This is the AUTHORITATIVE computation used to verify completions.
 * The result must match what the client claims.
 *
 * @param manifest - The execution manifest
 * @param jobSpec - The job specification
 * @returns Computed quality score and work units
 */
export function recomputeQualityWorkUnits(
  manifest: ExecutionManifest,
  jobSpec: JobSpec
): { qualityScore: number; workUnits: number } {
  const serviceType = manifest.serviceType;

  if (!isServiceTypeSupported(serviceType)) {
    throw new Error(`Unsupported service type: ${serviceType}`);
  }

  const module = getModule(serviceType);

  return {
    qualityScore: module.computeQualityScore(manifest, jobSpec),
    workUnits: module.computeWorkUnits(manifest, jobSpec),
  };
}

/**
 * Verify that claimed quality/workUnits match recomputed values
 *
 * @param manifest - The execution manifest
 * @param jobSpec - The job specification
 * @param claimedQuality - Quality score claimed by client
 * @param claimedWorkUnits - Work units claimed by client
 * @returns Verification result
 */
export function verifyScores(
  manifest: ExecutionManifest,
  jobSpec: JobSpec,
  claimedQuality: number,
  claimedWorkUnits: number
): VerificationResult {
  try {
    const recomputed = recomputeQualityWorkUnits(manifest, jobSpec);

    if (claimedQuality !== recomputed.qualityScore) {
      return {
        ok: false,
        reason: `Quality mismatch: claimed ${claimedQuality}, computed ${recomputed.qualityScore}`,
        qualityScore: recomputed.qualityScore,
        workUnits: recomputed.workUnits,
      };
    }

    if (claimedWorkUnits !== recomputed.workUnits) {
      return {
        ok: false,
        reason: `WorkUnits mismatch: claimed ${claimedWorkUnits}, computed ${recomputed.workUnits}`,
        qualityScore: recomputed.qualityScore,
        workUnits: recomputed.workUnits,
      };
    }

    // Check minimum quality requirement
    if (recomputed.qualityScore < jobSpec.qualityMin) {
      return {
        ok: false,
        reason: `Quality ${recomputed.qualityScore} below minimum ${jobSpec.qualityMin}`,
        qualityScore: recomputed.qualityScore,
        workUnits: recomputed.workUnits,
      };
    }

    return {
      ok: true,
      qualityScore: recomputed.qualityScore,
      workUnits: recomputed.workUnits,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      qualityScore: 0,
      workUnits: 0,
    };
  }
}

/**
 * Full verification of a completion
 *
 * @param manifest - The execution manifest
 * @param jobSpec - The job specification
 * @returns Verification result with computed scores
 */
export function verifyCompletion(
  manifest: ExecutionManifest,
  jobSpec: JobSpec
): VerificationResult {
  const serviceType = manifest.serviceType;

  if (!isServiceTypeSupported(serviceType)) {
    return {
      ok: false,
      reason: `Unsupported service type: ${serviceType}`,
      qualityScore: 0,
      workUnits: 0,
    };
  }

  const module = getModule(serviceType);
  return module.verifyCompletion(manifest, jobSpec);
}

/**
 * Assert that manifest hash and scores are deterministic
 *
 * Useful for testing: verifies that hashing the same manifest twice
 * produces the same hash, and recomputation produces same scores.
 *
 * @param manifest - The execution manifest
 * @param jobSpec - The job specification
 * @throws Error if determinism check fails
 */
export function assertDeterministic(
  manifest: ExecutionManifest,
  jobSpec: JobSpec
): void {
  const { hashManifest } = require('./hash');

  // Hash twice
  const hash1 = hashManifest(manifest);
  const hash2 = hashManifest(manifest);

  if (hash1 !== hash2) {
    throw new Error(`Non-deterministic hash: ${hash1} !== ${hash2}`);
  }

  // Compute scores twice
  const scores1 = recomputeQualityWorkUnits(manifest, jobSpec);
  const scores2 = recomputeQualityWorkUnits(manifest, jobSpec);

  if (scores1.qualityScore !== scores2.qualityScore) {
    throw new Error(
      `Non-deterministic quality: ${scores1.qualityScore} !== ${scores2.qualityScore}`
    );
  }

  if (scores1.workUnits !== scores2.workUnits) {
    throw new Error(
      `Non-deterministic workUnits: ${scores1.workUnits} !== ${scores2.workUnits}`
    );
  }
}

/**
 * Build proof data for on-chain submission
 *
 * @param manifest - The execution manifest
 * @param jobSpec - The job specification
 * @returns Proof data including hashes and computed scores
 */
export function buildProofData(
  manifest: ExecutionManifest,
  jobSpec: JobSpec
): {
  manifestHash: string;
  serviceTypeHash: string;
  qualityScore: number;
  workUnits: number;
  canonicalManifest: string;
} {
  const { hashManifest } = require('./hash');
  const { canonicalizeManifest } = require('./canonicalize');

  const computed = recomputeQualityWorkUnits(manifest, jobSpec);

  return {
    manifestHash: hashManifest(manifest),
    serviceTypeHash: getServiceTypeHash(manifest.serviceType),
    qualityScore: computed.qualityScore,
    workUnits: computed.workUnits,
    canonicalManifest: canonicalizeManifest(manifest),
  };
}
