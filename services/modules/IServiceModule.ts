/**
 * IServiceModule - Interface for VRWX service modules
 *
 * Service modules provide:
 * - Deterministic quality score computation
 * - Deterministic work units computation
 * - Manifest validation
 * - Completion verification
 *
 * All computations MUST be deterministic given the same input.
 */

import type { JobSpec, ExecutionManifest, ServiceType, VerificationResult } from '../../sdk/src/types';

export interface IServiceModule {
  /**
   * Get the service type ID
   */
  id(): ServiceType;

  /**
   * Get human-readable label
   */
  label(): string;

  /**
   * Get service description
   */
  description(): string;

  /**
   * Get required robot capabilities for this service
   */
  requiredCapabilities(): string[];

  /**
   * Get base rate in USD for pricing
   */
  baseRateUsd(): number;

  /**
   * Validate a JobSpec for this service
   * @throws Error if validation fails
   */
  validateSpec(jobSpec: JobSpec): void;

  /**
   * Validate an ExecutionManifest for this service
   * @throws Error if validation fails
   */
  validateManifest(manifest: ExecutionManifest): void;

  /**
   * Build an ExecutionManifest from raw input events
   * @param inputEvents - Raw events from robot/external system
   * @param jobSpec - The job specification
   * @param jobId - The job ID
   * @param robotId - Robot identifier
   * @param controller - Controller address
   * @returns Canonical ExecutionManifest
   */
  buildManifest(
    inputEvents: unknown[],
    jobSpec: JobSpec,
    jobId: number,
    robotId: string,
    controller: string
  ): ExecutionManifest;

  /**
   * Compute work units from manifest (DETERMINISTIC)
   * @param manifest - The execution manifest
   * @param jobSpec - The job specification
   * @returns Work units (integer >= 0)
   */
  computeWorkUnits(manifest: ExecutionManifest, jobSpec: JobSpec): number;

  /**
   * Compute quality score from manifest (DETERMINISTIC)
   * @param manifest - The execution manifest
   * @param jobSpec - The job specification
   * @returns Quality score (integer 0-100)
   */
  computeQualityScore(manifest: ExecutionManifest, jobSpec: JobSpec): number;

  /**
   * Verify a completion claim against manifest and spec
   * Returns computed quality/workUnits for comparison
   */
  verifyCompletion(manifest: ExecutionManifest, jobSpec: JobSpec): VerificationResult;
}

/**
 * Base class with common utility methods
 */
export abstract class BaseServiceModule implements IServiceModule {
  abstract id(): ServiceType;
  abstract label(): string;
  abstract description(): string;
  abstract requiredCapabilities(): string[];
  abstract baseRateUsd(): number;
  abstract validateSpec(jobSpec: JobSpec): void;
  abstract validateManifest(manifest: ExecutionManifest): void;
  abstract buildManifest(
    inputEvents: unknown[],
    jobSpec: JobSpec,
    jobId: number,
    robotId: string,
    controller: string
  ): ExecutionManifest;
  abstract computeWorkUnits(manifest: ExecutionManifest, jobSpec: JobSpec): number;
  abstract computeQualityScore(manifest: ExecutionManifest, jobSpec: JobSpec): number;

  /**
   * Default verification implementation
   */
  verifyCompletion(manifest: ExecutionManifest, jobSpec: JobSpec): VerificationResult {
    try {
      // Validate inputs
      this.validateSpec(jobSpec);
      this.validateManifest(manifest);

      // Compute scores
      const qualityScore = this.computeQualityScore(manifest, jobSpec);
      const workUnits = this.computeWorkUnits(manifest, jobSpec);

      // Check minimum quality
      if (qualityScore < jobSpec.qualityMin) {
        return {
          ok: false,
          reason: `Quality score ${qualityScore} below minimum ${jobSpec.qualityMin}`,
          qualityScore,
          workUnits,
        };
      }

      return {
        ok: true,
        qualityScore,
        workUnits,
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
   * Helper to clamp quality score to 0-100
   */
  protected clampQuality(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Helper to ensure work units is non-negative integer
   */
  protected clampWorkUnits(units: number): number {
    return Math.max(0, Math.round(units));
  }
}
