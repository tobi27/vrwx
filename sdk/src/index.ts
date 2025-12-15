import { keccak256, toUtf8Bytes, AbiCoder } from 'ethers';
import type { JobSpec, Completion } from './types.js';

export * from './types.js';
export * from './signing.js';
export * from './builders.js';

const abiCoder = new AbiCoder();

/**
 * Compute keccak256 hash of canonical JSON JobSpec
 */
export function hashJobSpec(spec: JobSpec): string {
  const canonical = JSON.stringify(spec, Object.keys(spec).sort());
  return keccak256(toUtf8Bytes(canonical));
}

/**
 * Compute keccak256 hash of Completion struct
 */
export function hashCompletion(completion: Completion): string {
  const encoded = abiCoder.encode(
    ['bytes32', 'bytes32', 'string', 'uint8', 'bytes32'],
    [
      completion.jobSpecHash,
      completion.datasetHash,
      completion.coveredGeoCell,
      completion.qualityScore,
      completion.timestampsHash,
    ]
  );
  return keccak256(encoded);
}

/**
 * Compute tokenId from jobSpecHash and completionHash
 * tokenId = keccak256(abi.encode(jobSpecHash, completionHash))
 */
export function computeTokenId(jobSpecHash: string, completionHash: string): bigint {
  const encoded = abiCoder.encode(['bytes32', 'bytes32'], [jobSpecHash, completionHash]);
  return BigInt(keccak256(encoded));
}

/**
 * Generate a unique robot ID from a string identifier
 */
export function generateRobotId(identifier: string): string {
  return keccak256(toUtf8Bytes(identifier));
}

/**
 * Constants matching the smart contract
 */
export const CONSTANTS = {
  TAU_BPS: 250n, // 2.5%
  CHALLENGE_WINDOW: 86400n, // 24 hours
  MIN_BOND_RATIO: 1000n, // 10%
} as const;

/**
 * DePIN constants matching the smart contracts
 */
export const DEPIN_CONSTANTS = {
  // Staking
  MIN_STAKE_VRWX: 1000n * 10n ** 18n, // 1000 VRWX
  UNLOCK_DELAY: 7n * 24n * 60n * 60n, // 7 days
  SLASH_PERCENT_BPS: 2500n, // 25%

  // Rewards
  BASE_REWARD: 100n * 10n ** 18n, // 100 VRWX
  MIN_QUALITY_MULT: 8000n, // 0.8x
  MAX_QUALITY_MULT: 12000n, // 1.2x
  MIN_RELIABILITY_MULT: 5000n, // 0.5x
  MAX_RELIABILITY_MULT: 15000n, // 1.5x

  // Reputation
  DISPUTE_PENALTY_BPS: 500n, // 5% per dispute
  SLASH_PENALTY_BPS: 1000n, // 10% per slash
  MAX_DISPUTE_PENALTY: 5000n, // 50% max from disputes
  MAX_SLASH_PENALTY: 5000n, // 50% max from slashes

  // Fees
  DEFAULT_LISTING_FEE_VRWX: 10n * 10n ** 18n, // 10 VRWX
} as const;

/**
 * Calculate minimum bond required for a job
 */
export function calculateMinBond(price: bigint): bigint {
  return (price * CONSTANTS.MIN_BOND_RATIO) / 10000n;
}

/**
 * Calculate fee and payout for a job
 */
export function calculateSettlement(price: bigint): { fee: bigint; payout: bigint } {
  const fee = (price * CONSTANTS.TAU_BPS) / 10000n;
  const payout = price - fee;
  return { fee, payout };
}

/**
 * Calculate quality multiplier from score (in BPS)
 * @param score Quality score (0-255, but 80-120 range used for multiplier)
 * @returns Multiplier in BPS (8000-12000, representing 0.8x-1.2x)
 */
export function calculateQualityMultiplier(score: number): bigint {
  if (score < 80) return DEPIN_CONSTANTS.MIN_QUALITY_MULT;
  if (score >= 120) return DEPIN_CONSTANTS.MAX_QUALITY_MULT;
  return DEPIN_CONSTANTS.MIN_QUALITY_MULT + BigInt(score - 80) * 100n;
}

/**
 * Calculate reliability multiplier from reliability BPS
 * @param reliabilityBps Reliability in BPS (0-10000)
 * @returns Multiplier in BPS (5000-15000, representing 0.5x-1.5x)
 */
export function calculateReliabilityMultiplier(reliabilityBps: number): bigint {
  const range = DEPIN_CONSTANTS.MAX_RELIABILITY_MULT - DEPIN_CONSTANTS.MIN_RELIABILITY_MULT;
  return DEPIN_CONSTANTS.MIN_RELIABILITY_MULT + (BigInt(reliabilityBps) * range) / 10000n;
}

/**
 * Estimate reward for a job completion
 * @param workUnits Number of work units
 * @param qualityScore Quality score (80-120)
 * @param reliabilityBps Robot reliability in BPS (0-10000, new robots = 10000)
 * @returns Estimated reward in wei
 */
export function estimateReward(workUnits: number, qualityScore: number, reliabilityBps: number = 10000): bigint {
  const qualityMult = calculateQualityMultiplier(qualityScore);
  const reliabilityMult = calculateReliabilityMultiplier(reliabilityBps);
  return (DEPIN_CONSTANTS.BASE_REWARD * BigInt(workUnits) * qualityMult * reliabilityMult) / (10000n * 10000n);
}

/**
 * Calculate reliability score from disputes and slashes
 * @param totalDisputes Total number of disputes
 * @param totalSlashes Total number of slashes
 * @returns Reliability in BPS (0-10000)
 */
export function calculateReliabilityScore(totalDisputes: number, totalSlashes: number): number {
  const disputePenalty = Math.min(5000, totalDisputes * 500);
  const slashPenalty = Math.min(5000, totalSlashes * 1000);
  const totalPenalty = disputePenalty + slashPenalty;
  return totalPenalty >= 10000 ? 0 : 10000 - totalPenalty;
}
