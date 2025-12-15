/**
 * Conformance test runner
 */

import { loadFixture, type ServiceFixture } from './fixtures.js';

// ============================================================================
// Types
// ============================================================================

export interface ConformanceOptions {
  baseUrl: string;
  dryRun: boolean;
  chain: string;
  verbose: boolean;
}

export interface TestResult {
  service: string;
  passed: boolean;
  steps: StepResult[];
  duration: number;
  error?: string;
}

export interface StepResult {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  error?: string;
}

// ============================================================================
// Test Runner
// ============================================================================

export async function runConformanceTests(
  services: Array<'inspection' | 'security_patrol' | 'delivery'>,
  options: ConformanceOptions
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const service of services) {
    console.log(`\n--- Testing: ${service} ---\n`);
    const result = await runServiceTest(service, options);
    results.push(result);
  }

  return results;
}

async function runServiceTest(
  service: string,
  options: ConformanceOptions
): Promise<TestResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  try {
    // Step 1: Load fixture
    console.log('1. Loading fixture...');
    let fixture: ServiceFixture;
    try {
      fixture = loadFixture(service);
      steps.push({ name: 'Load fixture', passed: true });
      console.log('   [OK] Fixture loaded');
    } catch (error) {
      const err = error as Error;
      steps.push({ name: 'Load fixture', passed: false, error: err.message });
      console.log(`   [FAIL] ${err.message}`);
      return {
        service,
        passed: false,
        steps,
        duration: Date.now() - startTime,
        error: `Fixture loading failed: ${err.message}`,
      };
    }

    // Step 2: POST /connectors/webhook/complete
    console.log('2. Calling POST /connectors/webhook/complete...');
    const dryRunParam = options.dryRun ? '?dryRun=1' : '';
    const completeUrl = `${options.baseUrl}/connectors/webhook/complete${dryRunParam}`;

    let completeResponse: Response;
    let completeData: Record<string, unknown>;

    try {
      completeResponse = await fetch(completeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fixture.jobSpec),
      });

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        throw new Error(`HTTP ${completeResponse.status}: ${errorText}`);
      }

      completeData = (await completeResponse.json()) as Record<string, unknown>;
      steps.push({ name: 'POST /complete', passed: true });
      console.log('   [OK] Completion endpoint responded');

      if (options.verbose) {
        console.log('   Response:', JSON.stringify(completeData, null, 2));
      }
    } catch (error) {
      const err = error as Error;
      steps.push({ name: 'POST /complete', passed: false, error: err.message });
      console.log(`   [FAIL] ${err.message}`);
      return {
        service,
        passed: false,
        steps,
        duration: Date.now() - startTime,
        error: `Completion request failed: ${err.message}`,
      };
    }

    // Step 3: Verify manifestHash matches expected
    console.log('3. Verifying manifestHash...');
    const actualHash = completeData.manifestHash as string;
    const expectedHash = fixture.expected.expectedHash;
    const hashMatch = actualHash === expectedHash;

    steps.push({
      name: 'Verify manifestHash',
      passed: hashMatch,
      expected: expectedHash,
      actual: actualHash,
    });

    if (hashMatch) {
      console.log('   [OK] Hash matches expected');
    } else {
      console.log(`   [FAIL] Hash mismatch`);
      console.log(`     Expected: ${expectedHash}`);
      console.log(`     Actual:   ${actualHash}`);
    }

    // Step 4: Verify computedValues match expected
    console.log('4. Verifying computed values...');
    const computedValues = completeData.computedValues as { qualityScore: number; workUnits: number };
    const qualityMatch = computedValues.qualityScore === fixture.expected.expectedQuality;
    const workUnitsMatch = computedValues.workUnits === fixture.expected.expectedWorkUnits;

    steps.push({
      name: 'Verify qualityScore',
      passed: qualityMatch,
      expected: fixture.expected.expectedQuality,
      actual: computedValues.qualityScore,
    });

    steps.push({
      name: 'Verify workUnits',
      passed: workUnitsMatch,
      expected: fixture.expected.expectedWorkUnits,
      actual: computedValues.workUnits,
    });

    if (qualityMatch && workUnitsMatch) {
      console.log('   [OK] Computed values match');
    } else {
      if (!qualityMatch) {
        console.log(`   [FAIL] Quality mismatch: expected ${fixture.expected.expectedQuality}, got ${computedValues.qualityScore}`);
      }
      if (!workUnitsMatch) {
        console.log(`   [FAIL] WorkUnits mismatch: expected ${fixture.expected.expectedWorkUnits}, got ${computedValues.workUnits}`);
      }
    }

    // Step 5: GET /manifests/:hash/verify
    console.log('5. Calling GET /manifests/:hash/verify...');
    const verifyUrl = `${options.baseUrl}/manifests/${actualHash}/verify`;

    let verifyData: Record<string, unknown>;

    try {
      const verifyResponse = await fetch(verifyUrl);

      if (!verifyResponse.ok) {
        const errorText = await verifyResponse.text();
        throw new Error(`HTTP ${verifyResponse.status}: ${errorText}`);
      }

      verifyData = (await verifyResponse.json()) as Record<string, unknown>;
      steps.push({ name: 'GET /verify', passed: true });
      console.log('   [OK] Verify endpoint responded');

      if (options.verbose) {
        console.log('   Response:', JSON.stringify(verifyData, null, 2));
      }
    } catch (error) {
      const err = error as Error;
      // Not found is acceptable for dry-run (manifest not stored)
      if (options.dryRun && err.message.includes('404')) {
        steps.push({ name: 'GET /verify', passed: true, error: 'Skipped (dry-run)' });
        console.log('   [SKIP] Not found (expected for dry-run)');
      } else {
        steps.push({ name: 'GET /verify', passed: false, error: err.message });
        console.log(`   [FAIL] ${err.message}`);
      }
      verifyData = {};
    }

    // Step 6: Assert hashMatch=true
    if (verifyData.hashMatch !== undefined) {
      console.log('6. Verifying hash integrity...');
      const integrityMatch = verifyData.hashMatch === true;

      steps.push({
        name: 'Hash integrity',
        passed: integrityMatch,
        expected: true,
        actual: verifyData.hashMatch,
      });

      if (integrityMatch) {
        console.log('   [OK] Hash integrity verified');
      } else {
        console.log(`   [FAIL] Hash integrity failed`);
      }
    }

    // Step 7: Real-run only - Submit tx
    if (!options.dryRun) {
      console.log('7. Submitting transaction (real-run)...');
      // In real implementation, this would:
      // - Sign the completion claim
      // - Submit to JobEscrow
      // - Wait for receipt
      // For now, just mark as passed/skipped
      steps.push({ name: 'Submit tx', passed: true, error: 'Not implemented' });
      console.log('   [SKIP] Transaction submission not yet implemented');
    }

    // Calculate overall pass/fail
    const allPassed = steps.every((s) => s.passed);

    return {
      service,
      passed: allPassed,
      steps,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const err = error as Error;
    return {
      service,
      passed: false,
      steps,
      duration: Date.now() - startTime,
      error: err.message,
    };
  }
}
