#!/usr/bin/env tsx
/**
 * DLQ Replay Script
 *
 * Replays failed completion events from the Dead Letter Queue.
 *
 * Usage:
 *   pnpm dlq:replay           # Replay all due events
 *   pnpm dlq:replay --dry-run # Preview without executing
 *   pnpm dlq:replay --type=UPLOAD_FAIL # Replay specific type
 *   pnpm dlq:replay --id=123  # Replay specific event
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Setup paths for api module imports
const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, '../api'));

// Dynamic imports after chdir
const { initDatabase, closeDatabase, query, execute } = await import('../api/src/db/index.js');
const { getDueEvents, getDLQEvent, markRetrying, markResolved, getDLQStats, expireStuckEvents, type DLQEvent, type DLQEventType } = await import('../api/src/services/dlq.js');
const { config } = await import('../api/src/config.js');

// ============================================================================
// CLI Arguments
// ============================================================================

interface CLIArgs {
  dryRun: boolean;
  type?: DLQEventType;
  id?: number;
  limit: number;
  verbose: boolean;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    dryRun: false,
    limit: 100,
    verbose: false,
    help: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run' || arg === '-n') {
      args.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--type=')) {
      args.type = arg.split('=')[1] as DLQEventType;
    } else if (arg.startsWith('--id=')) {
      args.id = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--limit=')) {
      args.limit = parseInt(arg.split('=')[1]);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
DLQ Replay Script - Replay failed completion events

Usage:
  pnpm dlq:replay [options]

Options:
  --dry-run, -n     Preview without executing replay
  --type=TYPE       Only replay events of specific type
                    Types: HASH_MISMATCH, UPLOAD_FAIL, SCHEMA_FAIL, TX_FAIL, DISPUTE_FAIL
  --id=ID           Replay a specific event by ID
  --limit=N         Maximum events to replay (default: 100)
  --verbose, -v     Show detailed output
  --help, -h        Show this help message

Examples:
  pnpm dlq:replay                      # Replay all due events
  pnpm dlq:replay --dry-run            # Preview what would be replayed
  pnpm dlq:replay --type=UPLOAD_FAIL   # Replay only upload failures
  pnpm dlq:replay --id=42              # Replay specific event
`);
}

// ============================================================================
// Retry Logic
// ============================================================================

interface RetryResult {
  success: boolean;
  error?: string;
}

async function retryEvent(event: DLQEvent, dryRun: boolean): Promise<RetryResult> {
  const payload = JSON.parse(event.payload);

  if (dryRun) {
    console.log(`  [DRY RUN] Would retry event #${event.id} (${event.type})`);
    console.log(`    Job ID: ${event.job_id || 'N/A'}`);
    console.log(`    Service: ${event.service_type || 'N/A'}`);
    console.log(`    Manifest: ${event.manifest_hash || 'N/A'}`);
    return { success: true };
  }

  // Mark as retrying (updates retry count and next_retry_at)
  markRetrying(event.id);

  try {
    switch (event.type) {
      case 'UPLOAD_FAIL':
        // Re-attempt storage upload
        await retryStorageUpload(payload);
        break;

      case 'HASH_MISMATCH':
        // Hash mismatches usually require investigation
        console.log(`  [WARN] Hash mismatch events require manual investigation`);
        return { success: false, error: 'Requires manual investigation' };

      case 'TX_FAIL':
        // Re-attempt transaction
        await retryTransaction(payload);
        break;

      case 'VALIDATION_FAIL':
        // Validation failures are usually permanent
        console.log(`  [WARN] Validation failures are usually permanent`);
        return { success: false, error: 'Validation errors are permanent' };

      case 'SCHEMA_FAIL':
        // Schema failures are usually permanent
        console.log(`  [WARN] Schema failures are usually permanent`);
        return { success: false, error: 'Schema errors are permanent' };

      default:
        console.log(`  [WARN] Unknown event type: ${event.type}`);
        return { success: false, error: `Unknown event type: ${event.type}` };
    }

    // Mark as resolved
    markResolved(event.id, 'RETRIED', `Replayed at ${new Date().toISOString()}`);
    return { success: true };
  } catch (error) {
    const err = error as Error;
    console.log(`  [ERROR] Retry failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function retryStorageUpload(payload: unknown): Promise<void> {
  // Re-import storage module to attempt upload
  const { storeManifest } = await import('../api/src/storage/index.js');

  const { manifestHash, manifest } = payload as { manifestHash: string; manifest: unknown };

  if (!manifestHash || !manifest) {
    throw new Error('Missing manifestHash or manifest in payload');
  }

  console.log(`  Retrying storage upload for ${manifestHash}...`);
  await storeManifest(manifestHash, manifest);
  console.log(`  Storage upload successful`);
}

async function retryTransaction(payload: unknown): Promise<void> {
  // Transaction retry would need blockchain interaction
  // For now, just log - in production this would submit to chain
  console.log(`  [TODO] Transaction retry not yet implemented`);
  console.log(`  Payload:`, JSON.stringify(payload, null, 2).slice(0, 500));
  throw new Error('Transaction retry not implemented');
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

  console.log('=== DLQ Replay Script ===\n');

  // Initialize database
  initDatabase();

  try {
    // Show stats
    const stats = getDLQStats();
    console.log('Current DLQ Stats:');
    console.log(`  Total events: ${stats.total}`);
    console.log(`  Unresolved: ${stats.unresolved}`);
    console.log(`  Pending retry: ${stats.pendingRetry}`);
    console.log(`  Exceeded retries: ${stats.exceededRetries}`);
    if (Object.keys(stats.byType).length > 0) {
      console.log('  By type:');
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`    ${type}: ${count}`);
      }
    }
    console.log('');

    // Expire stuck events first
    const expired = expireStuckEvents();
    if (expired > 0) {
      console.log(`Expired ${expired} events that exceeded max retries\n`);
    }

    // Get events to replay
    let events: DLQEvent[];

    if (args.id) {
      // Replay specific event
      const event = getDLQEvent(args.id);
      if (!event) {
        console.log(`Event #${args.id} not found`);
        process.exit(1);
      }
      events = [event];
    } else if (args.type) {
      // Replay events of specific type
      events = getDueEvents(args.limit).filter((e) => e.type === args.type);
    } else {
      // Replay all due events
      events = getDueEvents(args.limit);
    }

    if (events.length === 0) {
      console.log('No events to replay');
      process.exit(0);
    }

    console.log(`Found ${events.length} event(s) to replay${args.dryRun ? ' (DRY RUN)' : ''}:\n`);

    let succeeded = 0;
    let failed = 0;

    for (const event of events) {
      console.log(`Event #${event.id}: ${event.type}`);
      if (args.verbose) {
        console.log(`  Reason: ${event.reason}`);
        console.log(`  Retry count: ${event.retry_count}`);
        console.log(`  Created: ${new Date(event.created_at).toISOString()}`);
      }

      const result = await retryEvent(event, args.dryRun);

      if (result.success) {
        succeeded++;
        console.log(`  [OK] Replay successful\n`);
      } else {
        failed++;
        console.log(`  [FAIL] ${result.error}\n`);
      }
    }

    console.log('=== Summary ===');
    console.log(`Processed: ${events.length}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);

    if (args.dryRun) {
      console.log('\n(Dry run - no changes made)');
    }
  } finally {
    closeDatabase();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
