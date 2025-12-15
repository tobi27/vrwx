/**
 * VRWX Database Module
 * Uses better-sqlite3 with WAL mode for production reliability
 *
 * Features:
 * - WAL mode for concurrent reads
 * - busy_timeout for lock handling
 * - Auto-migration on startup
 * - Transaction support
 * - Abstraction layer for future Postgres migration
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config.js';

// Database instance (singleton)
let db: Database.Database | null = null;

/**
 * Initialize the database connection
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dbDir = path.dirname(config.DATABASE_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create database connection
  db = new Database(config.DATABASE_PATH);

  // Configure for production reliability
  db.pragma('journal_mode = WAL'); // Write-Ahead Logging
  db.pragma('busy_timeout = 5000'); // 5 second timeout on locks
  db.pragma('synchronous = NORMAL'); // Balance safety/performance
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('foreign_keys = ON');

  console.log(`[DB] Connected to ${config.DATABASE_PATH}`);
  console.log('[DB] WAL mode enabled');

  // Run migrations
  runMigrations(db);

  // Purge expired connect_tokens on startup
  purgeExpiredTokens(db);

  return db;
}

/**
 * Get the database instance
 */
export function getDb(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Connection closed');
  }
}

/**
 * Run all pending migrations
 */
function runMigrations(database: Database.Database): void {
  // Create migrations tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  // Get applied migrations
  const applied = new Set(
    database
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name)
  );

  // Find migration files
  const migrationsDir = path.join(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
    'migrations'
  );

  if (!fs.existsSync(migrationsDir)) {
    console.log('[DB] No migrations directory found');
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Apply pending migrations
  let migrationsApplied = 0;
  for (const file of migrationFiles) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    database.transaction(() => {
      // Execute migration
      database.exec(sql);

      // Record migration
      database
        .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
        .run(file, Date.now());
    })();

    console.log(`[DB] Applied migration: ${file}`);
    migrationsApplied++;
  }

  if (migrationsApplied === 0) {
    console.log('[DB] All migrations up to date');
  } else {
    console.log(`[DB] Applied ${migrationsApplied} migration(s)`);
  }
}

// ============================================================================
// Database Abstraction Layer (for future Postgres migration)
// ============================================================================

export interface DbRow {
  [key: string]: unknown;
}

/**
 * Execute a query and return all rows
 */
export function query<T extends DbRow>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

/**
 * Execute a query and return first row
 */
export function queryOne<T extends DbRow>(
  sql: string,
  params: unknown[] = []
): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

/**
 * Execute an insert/update/delete and return changes info
 */
export function execute(
  sql: string,
  params: unknown[] = []
): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}

/**
 * Run multiple statements in a transaction
 */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/**
 * Check if a row exists
 */
export function exists(sql: string, params: unknown[] = []): boolean {
  const row = getDb().prepare(sql).get(...params);
  return row !== undefined;
}

// ============================================================================
// Maintenance Functions
// ============================================================================

/**
 * Purge expired connect_tokens
 * Called on startup and can be called periodically
 */
function purgeExpiredTokens(database: Database.Database): void {
  try {
    const now = Date.now();
    const result = database
      .prepare('DELETE FROM connect_tokens WHERE expires_at < ?')
      .run(now);

    if (result.changes > 0) {
      console.log(`[DB] Purged ${result.changes} expired connect token(s)`);
    }
  } catch (error) {
    // Table might not exist yet (first run before migrations)
    console.log('[DB] Skipping token purge (table may not exist yet)');
  }
}

/**
 * Export for periodic cleanup (e.g., cron job)
 */
export function purgeExpired(): { tokens: number } {
  const database = getDb();
  const now = Date.now();

  const tokenResult = database
    .prepare('DELETE FROM connect_tokens WHERE expires_at < ?')
    .run(now);

  return { tokens: tokenResult.changes };
}
