/**
 * InspectionModule - Service module for inspection jobs
 *
 * Quality Score Formula:
 * - Coverage component (80%): (coverageVisited / coverageTotal) * 80
 * - Artifacts component (20%): artifacts.length > 0 ? 20 : 0
 *
 * Work Units Formula:
 * - workUnits = coverageVisited + artifacts.length
 */

import { BaseServiceModule } from './IServiceModule';
import type { JobSpec, ExecutionManifest, ServiceType } from '../../sdk/src/types';

export class InspectionModule extends BaseServiceModule {
  id(): ServiceType {
    return 'inspection';
  }

  label(): string {
    return 'Inspection';
  }

  description(): string {
    return 'Facility inspection service - robot visits coverage points and captures artifacts (images, scans, reports)';
  }

  requiredCapabilities(): string[] {
    return ['navigation', 'camera', 'localization'];
  }

  baseRateUsd(): number {
    return 100; // $100 base rate per job
  }

  validateSpec(jobSpec: JobSpec): void {
    if (jobSpec.serviceType !== 'inspection') {
      throw new Error(`Invalid serviceType: expected 'inspection', got '${jobSpec.serviceType}'`);
    }
    if (!jobSpec.geoCell) {
      throw new Error('Missing required field: geoCell');
    }
    if (jobSpec.qualityMin < 0 || jobSpec.qualityMin > 100) {
      throw new Error(`Invalid qualityMin: must be 0-100, got ${jobSpec.qualityMin}`);
    }
  }

  validateManifest(manifest: ExecutionManifest): void {
    if (manifest.serviceType !== 'inspection') {
      throw new Error(`Invalid manifest serviceType: expected 'inspection', got '${manifest.serviceType}'`);
    }
    if (!manifest.inspection) {
      throw new Error('Missing required field: manifest.inspection');
    }
    if (typeof manifest.inspection.coverageVisited !== 'number') {
      throw new Error('Missing required field: manifest.inspection.coverageVisited');
    }
    if (typeof manifest.inspection.coverageTotal !== 'number' || manifest.inspection.coverageTotal < 1) {
      throw new Error('Invalid manifest.inspection.coverageTotal: must be >= 1');
    }
    if (manifest.inspection.coverageVisited > manifest.inspection.coverageTotal) {
      throw new Error('Invalid manifest: coverageVisited cannot exceed coverageTotal');
    }
  }

  buildManifest(
    inputEvents: unknown[],
    jobSpec: JobSpec,
    jobId: number,
    robotId: string,
    controller: string
  ): ExecutionManifest {
    // Extract data from input events
    let coverageVisited = 0;
    let coverageTotal = 10; // Default
    let startTs = 0;
    let endTs = 0;
    const artifacts: { type: string; sha256: string; bytes: number }[] = [];
    let routeDigest: string | undefined;
    let anomaliesDetected = 0;

    for (const event of inputEvents) {
      const e = event as Record<string, unknown>;

      if (e.type === 'coverage') {
        coverageVisited = Number(e.visited) || 0;
        coverageTotal = Number(e.total) || 10;
      } else if (e.type === 'artifact') {
        artifacts.push({
          type: String(e.artifactType || 'image'),
          sha256: String(e.sha256 || ''),
          bytes: Number(e.bytes) || 0,
        });
      } else if (e.type === 'start') {
        startTs = Number(e.timestamp) || 0;
      } else if (e.type === 'end') {
        endTs = Number(e.timestamp) || 0;
      } else if (e.type === 'route') {
        routeDigest = String(e.digest);
      } else if (e.type === 'anomaly') {
        anomaliesDetected++;
      }
    }

    // Use current time if not provided
    if (!startTs) startTs = Math.floor(Date.now() / 1000) - 300;
    if (!endTs) endTs = Math.floor(Date.now() / 1000);

    return {
      jobId,
      robotId,
      controller,
      serviceType: 'inspection',
      startTs,
      endTs,
      routeDigest,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      inspection: {
        coverageVisited,
        coverageTotal,
        anomaliesDetected: anomaliesDetected > 0 ? anomaliesDetected : undefined,
      },
    };
  }

  computeWorkUnits(manifest: ExecutionManifest, _jobSpec: JobSpec): number {
    const inspection = manifest.inspection;
    if (!inspection) return 0;

    const coverageUnits = inspection.coverageVisited || 0;
    const artifactUnits = (manifest.artifacts?.length || 0);

    return this.clampWorkUnits(coverageUnits + artifactUnits);
  }

  computeQualityScore(manifest: ExecutionManifest, _jobSpec: JobSpec): number {
    const inspection = manifest.inspection;
    if (!inspection) return 0;

    // Coverage component: 80% of score
    const coverageRatio = inspection.coverageTotal > 0
      ? inspection.coverageVisited / inspection.coverageTotal
      : 0;
    const coverageScore = coverageRatio * 80;

    // Artifacts component: 20% of score if any artifacts present
    const artifactScore = (manifest.artifacts?.length || 0) > 0 ? 20 : 0;

    return this.clampQuality(coverageScore + artifactScore);
  }
}
