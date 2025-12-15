#!/usr/bin/env tsx
/**
 * VRWX Conformance Test Suite CLI
 *
 * Tests API endpoints against expected outputs using fixture data.
 *
 * Usage:
 *   pnpm conformance:run --service=inspection --dry-run
 *   pnpm conformance:run --service=all --dry-run
 *   pnpm conformance:run --service=all --real-run --chain=base-sepolia
 */

import { runConformanceTests, type ConformanceOptions } from './runner.js';
import { printReport } from './report.js';

// ============================================================================
// CLI Arguments
// ============================================================================

interface CLIArgs {
  baseUrl: string;
  service: 'inspection' | 'security_patrol' | 'delivery' | 'all';
  dryRun: boolean;
  realRun: boolean;
  chain: string;
  verbose: boolean;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    baseUrl: process.env.VRWX_API_URL || 'http://localhost:3000',
    service: 'all',
    dryRun: true, // Default to dry-run per user requirements
    realRun: false,
    chain: 'base-sepolia',
    verbose: false,
    help: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run' || arg === '-n') {
      args.dryRun = true;
      args.realRun = false;
    } else if (arg === '--real-run') {
      args.realRun = true;
      args.dryRun = false;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--baseUrl=')) {
      args.baseUrl = arg.split('=')[1];
    } else if (arg.startsWith('--service=')) {
      args.service = arg.split('=')[1] as CLIArgs['service'];
    } else if (arg.startsWith('--chain=')) {
      args.chain = arg.split('=')[1];
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
VRWX Conformance Test Suite

Validates API endpoints against expected fixture outputs.

Usage:
  pnpm conformance:run [options]

Options:
  --baseUrl=URL      API base URL (default: http://localhost:3000)
  --service=SERVICE  Service to test: inspection, security_patrol, delivery, all
  --dry-run, -n      Run in dry-run mode (default) - no chain transactions
  --real-run         Run with actual chain transactions (requires --chain)
  --chain=CHAIN      Chain for real-run: base-sepolia only (default: base-sepolia)
  --verbose, -v      Show detailed output
  --help, -h         Show this help message

Examples:
  pnpm conformance:run --service=inspection --dry-run
  pnpm conformance:run --service=all --dry-run
  pnpm conformance:run --service=delivery --real-run --chain=base-sepolia

Test Flow:
  1. Load fixture (jobSpec + eventBundle)
  2. POST /connectors/webhook/complete?dryRun=1
  3. Verify response.manifestHash matches expected
  4. Verify response.computedValues match expected
  5. GET /manifests/:hash/verify
  6. Assert hashMatch=true
  7. (real-run only) Submit tx + verify receipt minted
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log('=== VRWX Conformance Test Suite ===\n');

  // Validate real-run requirements
  if (args.realRun) {
    if (args.chain !== 'base-sepolia') {
      console.error('ERROR: Real-run only supports base-sepolia chain');
      console.error('This is a safety measure to prevent accidental mainnet transactions.');
      process.exit(1);
    }
    console.log('MODE: Real-run (transactions will be submitted to base-sepolia)');
  } else {
    console.log('MODE: Dry-run (no transactions will be submitted)');
  }

  console.log(`API: ${args.baseUrl}`);
  console.log(`Service(s): ${args.service}`);
  console.log('');

  const options: ConformanceOptions = {
    baseUrl: args.baseUrl,
    dryRun: !args.realRun,
    chain: args.chain,
    verbose: args.verbose,
  };

  // Determine which services to test
  const services: Array<'inspection' | 'security_patrol' | 'delivery'> =
    args.service === 'all'
      ? ['inspection', 'security_patrol', 'delivery']
      : [args.service as 'inspection' | 'security_patrol' | 'delivery'];

  // Run tests
  const results = await runConformanceTests(services, options);

  // Print report
  printReport(results);

  // Exit with appropriate code
  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
