/**
 * Canonical JSON serialization for ExecutionManifest
 *
 * Ensures deterministic output regardless of property order.
 * Uses recursive key sorting for nested objects.
 */

import type { ExecutionManifest } from '../../../sdk/src/types';

/**
 * Recursively sort object keys for deterministic JSON output
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return obj;
}

/**
 * Canonicalize an ExecutionManifest to a deterministic JSON string
 *
 * - Keys are sorted alphabetically at all levels
 * - No whitespace in output
 * - Undefined values are omitted
 * - Numbers are serialized without scientific notation for reasonable ranges
 *
 * @param manifest - The execution manifest to canonicalize
 * @returns Canonical JSON string
 */
export function canonicalizeManifest(manifest: ExecutionManifest): string {
  // Remove undefined values and sort keys
  const cleaned = JSON.parse(JSON.stringify(manifest));
  const sorted = sortKeys(cleaned);
  return JSON.stringify(sorted);
}

/**
 * Canonicalize any object to a deterministic JSON string
 */
export function canonicalizeObject(obj: unknown): string {
  const cleaned = JSON.parse(JSON.stringify(obj));
  const sorted = sortKeys(cleaned);
  return JSON.stringify(sorted);
}
