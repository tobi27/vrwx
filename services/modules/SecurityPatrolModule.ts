/**
 * SecurityPatrolModule - Service module for security patrol jobs
 *
 * Quality Score Formula:
 * - Checkpoint component (70%): (checkpointsVisited.length / checkpointsRequired.length) * 70
 * - Dwell compliance component (30%): dwellComplianceRatio * 30
 *
 * Dwell compliance: % of checkpoints where dwellSeconds >= minDwellRequired
 *
 * Work Units Formula:
 * - workUnits = checkpointsVisited.length
 */

import { BaseServiceModule } from './IServiceModule';
import type { JobSpec, ExecutionManifest, ServiceType } from '../../sdk/src/types';

export class SecurityPatrolModule extends BaseServiceModule {
  id(): ServiceType {
    return 'security_patrol';
  }

  label(): string {
    return 'Security Patrol';
  }

  description(): string {
    return 'Security patrol service - robot visits checkpoints with minimum dwell time at each';
  }

  requiredCapabilities(): string[] {
    return ['navigation', 'localization', 'patrol_mode'];
  }

  baseRateUsd(): number {
    return 150; // $150 base rate per job
  }

  validateSpec(jobSpec: JobSpec): void {
    if (jobSpec.serviceType !== 'security_patrol') {
      throw new Error(`Invalid serviceType: expected 'security_patrol', got '${jobSpec.serviceType}'`);
    }
    if (!jobSpec.geoCell) {
      throw new Error('Missing required field: geoCell');
    }
    if (jobSpec.qualityMin < 0 || jobSpec.qualityMin > 100) {
      throw new Error(`Invalid qualityMin: must be 0-100, got ${jobSpec.qualityMin}`);
    }
  }

  validateManifest(manifest: ExecutionManifest): void {
    if (manifest.serviceType !== 'security_patrol') {
      throw new Error(`Invalid manifest serviceType: expected 'security_patrol', got '${manifest.serviceType}'`);
    }
    if (!manifest.patrol) {
      throw new Error('Missing required field: manifest.patrol');
    }
    if (!Array.isArray(manifest.patrol.checkpointsVisited)) {
      throw new Error('Missing required field: manifest.patrol.checkpointsVisited');
    }
    if (!Array.isArray(manifest.patrol.dwellSeconds)) {
      throw new Error('Missing required field: manifest.patrol.dwellSeconds');
    }
    if (manifest.patrol.checkpointsVisited.length !== manifest.patrol.dwellSeconds.length) {
      throw new Error('manifest.patrol.checkpointsVisited and dwellSeconds must have same length');
    }
  }

  buildManifest(
    inputEvents: unknown[],
    jobSpec: JobSpec,
    jobId: number,
    robotId: string,
    controller: string
  ): ExecutionManifest {
    let startTs = 0;
    let endTs = 0;
    const checkpointsVisited: string[] = [];
    const dwellSeconds: number[] = [];
    let checkpointsRequired: string[] | undefined;
    let minDwellRequired: number | undefined;
    let routeDigest: string | undefined;

    for (const event of inputEvents) {
      const e = event as Record<string, unknown>;

      if (e.type === 'checkpoint') {
        checkpointsVisited.push(String(e.checkpointId));
        dwellSeconds.push(Number(e.dwellSeconds) || 0);
      } else if (e.type === 'config') {
        if (Array.isArray(e.checkpointsRequired)) {
          checkpointsRequired = e.checkpointsRequired.map(String);
        }
        if (typeof e.minDwellRequired === 'number') {
          minDwellRequired = e.minDwellRequired;
        }
      } else if (e.type === 'start') {
        startTs = Number(e.timestamp) || 0;
      } else if (e.type === 'end') {
        endTs = Number(e.timestamp) || 0;
      } else if (e.type === 'route') {
        routeDigest = String(e.digest);
      }
    }

    // Use current time if not provided
    if (!startTs) startTs = Math.floor(Date.now() / 1000) - 600;
    if (!endTs) endTs = Math.floor(Date.now() / 1000);

    // Default checkpoints required from jobSpec.serviceParams if available
    if (!checkpointsRequired && jobSpec.serviceParams?.checkpoints) {
      checkpointsRequired = (jobSpec.serviceParams.checkpoints as string[]);
    }

    return {
      jobId,
      robotId,
      controller,
      serviceType: 'security_patrol',
      startTs,
      endTs,
      routeDigest,
      patrol: {
        checkpointsRequired,
        checkpointsVisited,
        dwellSeconds,
        minDwellRequired,
      },
    };
  }

  computeWorkUnits(manifest: ExecutionManifest, _jobSpec: JobSpec): number {
    const patrol = manifest.patrol;
    if (!patrol) return 0;

    return this.clampWorkUnits(patrol.checkpointsVisited.length);
  }

  computeQualityScore(manifest: ExecutionManifest, jobSpec: JobSpec): number {
    const patrol = manifest.patrol;
    if (!patrol) return 0;

    // Determine required checkpoints
    const required = patrol.checkpointsRequired
      || (jobSpec.serviceParams?.checkpoints as string[] | undefined)
      || patrol.checkpointsVisited; // If not specified, assume all visited were required

    const requiredCount = required.length;
    if (requiredCount === 0) return 100; // No checkpoints required = perfect score

    // Calculate checkpoint coverage (70%)
    const visitedSet = new Set(patrol.checkpointsVisited);
    const visitedRequired = required.filter(cp => visitedSet.has(cp)).length;
    const checkpointRatio = visitedRequired / requiredCount;
    const checkpointScore = checkpointRatio * 70;

    // Calculate dwell compliance (30%)
    const minDwell = patrol.minDwellRequired
      || (jobSpec.serviceParams?.minDwellSeconds as number | undefined)
      || 30; // Default 30 seconds

    let compliantCount = 0;
    for (let i = 0; i < patrol.checkpointsVisited.length; i++) {
      if (patrol.dwellSeconds[i] >= minDwell) {
        compliantCount++;
      }
    }
    const dwellRatio = patrol.checkpointsVisited.length > 0
      ? compliantCount / patrol.checkpointsVisited.length
      : 0;
    const dwellScore = dwellRatio * 30;

    return this.clampQuality(checkpointScore + dwellScore);
  }
}
