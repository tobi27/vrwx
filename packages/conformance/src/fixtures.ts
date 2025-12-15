/**
 * Fixture loading utilities
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

// ============================================================================
// Types
// ============================================================================

export interface JobSpecFixture {
  serviceType: string;
  jobId: number;
  robotId: string;
  controller: string;
  eventBundle: unknown[];
  artifacts?: Array<{ type: string; sha256: string; bytes: number }>;
  inspection?: { coverageVisited: number; coverageTotal: number };
  patrol?: { checkpointsVisited: string[]; dwellSeconds: number[]; expectedCheckpoints?: string[] };
  delivery?: { pickupProofHash: string; dropoffProofHash: string };
  startTs?: number;
  endTs?: number;
}

export interface ExpectedFixture {
  expectedHash: string;
  expectedQuality: number;
  expectedWorkUnits: number;
  schemaVersion: string;
  manifestVersion: string;
}

export interface ServiceFixture {
  jobSpec: JobSpecFixture;
  expected: ExpectedFixture;
}

// ============================================================================
// Fixture Loading
// ============================================================================

export function loadFixture(serviceType: string): ServiceFixture {
  const serviceDir = join(FIXTURES_DIR, serviceType);

  if (!existsSync(serviceDir)) {
    throw new Error(`Fixture directory not found: ${serviceDir}`);
  }

  const jobSpecPath = join(serviceDir, 'jobSpec.json');
  const expectedPath = join(serviceDir, 'expected.json');

  if (!existsSync(jobSpecPath)) {
    throw new Error(`jobSpec.json not found for ${serviceType}`);
  }

  if (!existsSync(expectedPath)) {
    throw new Error(`expected.json not found for ${serviceType}`);
  }

  const jobSpec = JSON.parse(readFileSync(jobSpecPath, 'utf-8')) as JobSpecFixture;
  const expected = JSON.parse(readFileSync(expectedPath, 'utf-8')) as ExpectedFixture;

  return { jobSpec, expected };
}

export function fixtureExists(serviceType: string): boolean {
  const serviceDir = join(FIXTURES_DIR, serviceType);
  return existsSync(serviceDir) && existsSync(join(serviceDir, 'jobSpec.json'));
}

export function listAvailableFixtures(): string[] {
  const services = ['inspection', 'security_patrol', 'delivery'];
  return services.filter(fixtureExists);
}
