/**
 * Hashing utilities for ExecutionManifest
 *
 * Uses keccak256 for Ethereum compatibility.
 */

import { keccak256, toUtf8Bytes } from 'ethers';
import { canonicalizeManifest, canonicalizeObject } from './canonicalize';
import type { ExecutionManifest } from '../../../sdk/src/types';

/**
 * Hash an ExecutionManifest using keccak256
 *
 * @param manifest - The execution manifest
 * @returns keccak256 hash as hex string with 0x prefix
 */
export function hashManifest(manifest: ExecutionManifest): string {
  const canonical = canonicalizeManifest(manifest);
  return keccak256(toUtf8Bytes(canonical));
}

/**
 * Hash any object using keccak256
 *
 * @param obj - Object to hash
 * @returns keccak256 hash as hex string with 0x prefix
 */
export function hashObject(obj: unknown): string {
  const canonical = canonicalizeObject(obj);
  return keccak256(toUtf8Bytes(canonical));
}

/**
 * Hash a string using keccak256
 *
 * @param str - String to hash
 * @returns keccak256 hash as hex string with 0x prefix
 */
export function hashString(str: string): string {
  return keccak256(toUtf8Bytes(str));
}

/**
 * Compute the service type hash
 *
 * @param serviceType - Service type string
 * @returns keccak256 hash of the service type
 */
export function hashServiceType(serviceType: string): string {
  return keccak256(toUtf8Bytes(serviceType));
}
