/**
 * DeliveryModule - Service module for delivery jobs
 *
 * Quality Score Formula:
 * - Pickup proof (40%): pickupProofHash present ? 40 : 0
 * - Dropoff proof (40%): dropoffProofHash present ? 40 : 0
 * - Route digest (10%): routeDigest present ? 10 : 0
 * - Timing (10%): on-time delivery bonus
 *
 * Work Units Formula:
 * - workUnits = 1 (single delivery)
 */

import { BaseServiceModule } from './IServiceModule';
import type { JobSpec, ExecutionManifest, ServiceType } from '../../sdk/src/types';

export class DeliveryModule extends BaseServiceModule {
  id(): ServiceType {
    return 'delivery';
  }

  label(): string {
    return 'Delivery';
  }

  description(): string {
    return 'Package delivery service - robot picks up and delivers items with proof of completion';
  }

  requiredCapabilities(): string[] {
    return ['navigation', 'localization', 'cargo_hold', 'proof_capture'];
  }

  baseRateUsd(): number {
    return 200; // $200 base rate per job
  }

  validateSpec(jobSpec: JobSpec): void {
    if (jobSpec.serviceType !== 'delivery') {
      throw new Error(`Invalid serviceType: expected 'delivery', got '${jobSpec.serviceType}'`);
    }
    if (!jobSpec.geoCell) {
      throw new Error('Missing required field: geoCell');
    }
    if (jobSpec.qualityMin < 0 || jobSpec.qualityMin > 100) {
      throw new Error(`Invalid qualityMin: must be 0-100, got ${jobSpec.qualityMin}`);
    }
  }

  validateManifest(manifest: ExecutionManifest): void {
    if (manifest.serviceType !== 'delivery') {
      throw new Error(`Invalid manifest serviceType: expected 'delivery', got '${manifest.serviceType}'`);
    }
    if (!manifest.delivery) {
      throw new Error('Missing required field: manifest.delivery');
    }
    if (!manifest.delivery.pickupProofHash) {
      throw new Error('Missing required field: manifest.delivery.pickupProofHash');
    }
    if (!manifest.delivery.dropoffProofHash) {
      throw new Error('Missing required field: manifest.delivery.dropoffProofHash');
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
    let pickupProofHash = '';
    let dropoffProofHash = '';
    let pickupTs: number | undefined;
    let dropoffTs: number | undefined;
    let routeDigest: string | undefined;

    for (const event of inputEvents) {
      const e = event as Record<string, unknown>;

      if (e.type === 'pickup') {
        pickupProofHash = String(e.proofHash || '');
        pickupTs = Number(e.timestamp) || undefined;
        if (!startTs && pickupTs) startTs = pickupTs;
      } else if (e.type === 'dropoff') {
        dropoffProofHash = String(e.proofHash || '');
        dropoffTs = Number(e.timestamp) || undefined;
        if (dropoffTs) endTs = dropoffTs;
      } else if (e.type === 'start') {
        startTs = Number(e.timestamp) || 0;
      } else if (e.type === 'end') {
        endTs = Number(e.timestamp) || 0;
      } else if (e.type === 'route') {
        routeDigest = String(e.digest);
      }
    }

    // Use current time if not provided
    if (!startTs) startTs = Math.floor(Date.now() / 1000) - 900;
    if (!endTs) endTs = Math.floor(Date.now() / 1000);

    return {
      jobId,
      robotId,
      controller,
      serviceType: 'delivery',
      startTs,
      endTs,
      routeDigest,
      delivery: {
        pickupProofHash,
        dropoffProofHash,
        pickupTs,
        dropoffTs,
      },
    };
  }

  computeWorkUnits(_manifest: ExecutionManifest, _jobSpec: JobSpec): number {
    // Single delivery = 1 work unit
    return 1;
  }

  computeQualityScore(manifest: ExecutionManifest, jobSpec: JobSpec): number {
    const delivery = manifest.delivery;
    if (!delivery) return 0;

    let score = 0;

    // Pickup proof (40%)
    if (delivery.pickupProofHash && delivery.pickupProofHash.length > 0) {
      score += 40;
    }

    // Dropoff proof (40%)
    if (delivery.dropoffProofHash && delivery.dropoffProofHash.length > 0) {
      score += 40;
    }

    // Route digest (10%)
    if (manifest.routeDigest && manifest.routeDigest.length > 0) {
      score += 10;
    }

    // Timing bonus (10%) - delivered within time window
    if (delivery.dropoffTs && jobSpec.timeWindow) {
      const { start, end } = jobSpec.timeWindow;
      if (delivery.dropoffTs >= start && delivery.dropoffTs <= end) {
        score += 10;
      }
    } else if (manifest.endTs && jobSpec.timeWindow) {
      // Fallback to endTs
      const { start, end } = jobSpec.timeWindow;
      if (manifest.endTs >= start && manifest.endTs <= end) {
        score += 10;
      }
    }

    return this.clampQuality(score);
  }
}
