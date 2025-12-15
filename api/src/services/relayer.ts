/**
 * Relayer Service
 *
 * Submits transactions to JobEscrow on behalf of controllers.
 * Controller signs EIP-712 envelope, API relays the tx.
 */

import { ethers, Wallet, Contract, Provider, TypedDataDomain, verifyTypedData } from 'ethers';
import { config } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export interface CompletionClaimV2 {
  jobId: bigint;
  jobSpecHash: string;
  completionHash: string;
  robotId: string;
  controller: string;
  deadline: bigint;
  qualityScore: number;
  workUnits: number;
}

export interface RelayResult {
  success: boolean;
  txHash?: string;
  receiptTokenId?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
}

export interface VerifyResult {
  valid: boolean;
  recoveredAddress?: string;
  expectedController?: string;
  error?: string;
}

// ============================================================================
// Contract ABIs (minimal)
// ============================================================================

const JOB_ESCROW_ABI = [
  'function submitCompletionV2(uint256 jobId, bytes32 completionHash, uint8 qualityScore, uint32 workUnits, bytes signature) external',
  'function getJob(uint256 jobId) view returns (tuple(address buyer, bytes32 robotId, bytes32 jobSpecHash, uint256 price, uint256 deadline, uint8 status, bytes32 completionHash, uint256 tokenId, uint256 settleAfter, uint8 qualityScore, uint32 workUnits))',
  'function jobs(uint256) view returns (address buyer, bytes32 robotId, bytes32 jobSpecHash, uint256 price, uint256 deadline, uint8 status, bytes32 completionHash, uint256 tokenId, uint256 settleAfter, uint8 qualityScore, uint32 workUnits)',
  'event CompletionSubmitted(uint256 indexed jobId, bytes32 completionHash)',
];

const IDENTITY_REGISTRY_ABI = [
  'function getController(bytes32 robotId) view returns (address)',
  'function isActive(bytes32 robotId) view returns (bool)',
  'function getRobot(bytes32 robotId) view returns (tuple(address controller, bytes pubkey, bytes32 metadataHash, bool active))',
];

// ============================================================================
// EIP-712 Types
// ============================================================================

const COMPLETION_CLAIM_V2_TYPES = {
  CompletionClaimV2: [
    { name: 'jobId', type: 'uint256' },
    { name: 'jobSpecHash', type: 'bytes32' },
    { name: 'completionHash', type: 'bytes32' },
    { name: 'robotId', type: 'bytes32' },
    { name: 'controller', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'qualityScore', type: 'uint8' },
    { name: 'workUnits', type: 'uint32' },
  ],
};

// ============================================================================
// Relayer State
// ============================================================================

let provider: Provider | null = null;
let relayerWallet: Wallet | null = null;
let jobEscrow: Contract | null = null;
let identityRegistry: Contract | null = null;

// ============================================================================
// Initialization
// ============================================================================

export function initRelayer(): void {
  if (config.RELAY_MODE !== 'relay') {
    console.log('[RELAYER] Skipping init - not in relay mode');
    return;
  }

  if (!config.RELAYER_PRIVATE_KEY) {
    throw new Error('[RELAYER] RELAYER_PRIVATE_KEY is required');
  }

  provider = new ethers.JsonRpcProvider(config.RPC_URL);
  relayerWallet = new Wallet(config.RELAYER_PRIVATE_KEY, provider);

  jobEscrow = new Contract(
    config.JOB_ESCROW_ADDRESS,
    JOB_ESCROW_ABI,
    relayerWallet
  );

  identityRegistry = new Contract(
    config.IDENTITY_REGISTRY_ADDRESS,
    IDENTITY_REGISTRY_ABI,
    provider
  );

  console.log(`[RELAYER] Initialized with address: ${relayerWallet.address}`);
  console.log(`[RELAYER] JobEscrow: ${config.JOB_ESCROW_ADDRESS}`);
  console.log(`[RELAYER] IdentityRegistry: ${config.IDENTITY_REGISTRY_ADDRESS}`);
}

export function getRelayerAddress(): string | null {
  return relayerWallet?.address || null;
}

// ============================================================================
// EIP-712 Domain
// ============================================================================

function getDomain(): TypedDataDomain {
  return {
    name: 'VRWX',
    version: '1',
    chainId: BigInt(config.DEFAULT_CHAIN_ID),
    verifyingContract: config.JOB_ESCROW_ADDRESS,
  };
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify controller signature against IdentityRegistry
 */
export async function verifyControllerSignature(
  claim: CompletionClaimV2,
  signature: string
): Promise<VerifyResult> {
  if (!identityRegistry) {
    return { valid: false, error: 'Relayer not initialized' };
  }

  try {
    // Get expected controller from IdentityRegistry
    const expectedController = await identityRegistry.getController(claim.robotId);

    if (expectedController === ethers.ZeroAddress) {
      return {
        valid: false,
        error: 'Robot not found in IdentityRegistry',
      };
    }

    // Check if robot is active
    const isActive = await identityRegistry.isActive(claim.robotId);
    if (!isActive) {
      return {
        valid: false,
        error: 'Robot is deactivated in IdentityRegistry',
      };
    }

    // Verify EIP-712 signature
    const domain = getDomain();
    const recoveredAddress = verifyTypedData(
      domain,
      COMPLETION_CLAIM_V2_TYPES,
      {
        jobId: claim.jobId,
        jobSpecHash: claim.jobSpecHash,
        completionHash: claim.completionHash,
        robotId: claim.robotId,
        controller: claim.controller,
        deadline: claim.deadline,
        qualityScore: claim.qualityScore,
        workUnits: claim.workUnits,
      },
      signature
    );

    // Check signature matches expected controller
    if (recoveredAddress.toLowerCase() !== expectedController.toLowerCase()) {
      return {
        valid: false,
        recoveredAddress,
        expectedController,
        error: `Signature from ${recoveredAddress} does not match controller ${expectedController}`,
      };
    }

    // Check claim controller matches
    if (claim.controller.toLowerCase() !== expectedController.toLowerCase()) {
      return {
        valid: false,
        error: `Claim controller ${claim.controller} does not match registry ${expectedController}`,
      };
    }

    return {
      valid: true,
      recoveredAddress,
      expectedController,
    };
  } catch (error) {
    const err = error as Error;
    return {
      valid: false,
      error: `Signature verification failed: ${err.message}`,
    };
  }
}

// ============================================================================
// Transaction Submission
// ============================================================================

/**
 * Submit completion via relayer
 */
export async function submitCompletionV2(
  jobId: bigint,
  completionHash: string,
  qualityScore: number,
  workUnits: number,
  signature: string
): Promise<RelayResult> {
  if (!jobEscrow || !relayerWallet) {
    return { success: false, error: 'Relayer not initialized' };
  }

  try {
    console.log(`[RELAYER] Submitting completion for job ${jobId}`);
    console.log(`  completionHash: ${completionHash}`);
    console.log(`  qualityScore: ${qualityScore}`);
    console.log(`  workUnits: ${workUnits}`);

    // Estimate gas
    const gasEstimate = await jobEscrow.submitCompletionV2.estimateGas(
      jobId,
      completionHash,
      qualityScore,
      workUnits,
      signature
    );

    const gasLimit = BigInt(Math.ceil(Number(gasEstimate) * config.GAS_LIMIT_MULTIPLIER));

    console.log(`[RELAYER] Gas estimate: ${gasEstimate}, limit: ${gasLimit}`);

    // Submit transaction
    const tx = await jobEscrow.submitCompletionV2(
      jobId,
      completionHash,
      qualityScore,
      workUnits,
      signature,
      {
        gasLimit,
        maxFeePerGas: ethers.parseUnits(String(config.MAX_FEE_PER_GAS_GWEI), 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits(String(config.MAX_PRIORITY_FEE_GWEI), 'gwei'),
      }
    );

    console.log(`[RELAYER] Tx submitted: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log(`[RELAYER] Tx confirmed in block ${receipt.blockNumber}`);

    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (error) {
    const err = error as Error;
    console.error(`[RELAYER] Tx failed: ${err.message}`);

    // Parse common errors
    if (err.message.includes('InvalidStatus')) {
      return { success: false, error: 'Job is not in FUNDED status' };
    }
    if (err.message.includes('DeadlinePassed')) {
      return { success: false, error: 'Job deadline has passed' };
    }
    if (err.message.includes('ClaimAlreadyUsed')) {
      return { success: false, error: 'Completion already submitted (anti-replay)' };
    }
    if (err.message.includes('InvalidSignature')) {
      return { success: false, error: 'Invalid controller signature' };
    }
    if (err.message.includes('RobotNotFound')) {
      return { success: false, error: 'Robot not found in IdentityRegistry' };
    }

    return { success: false, error: err.message };
  }
}

// ============================================================================
// Job Queries
// ============================================================================

export interface JobInfo {
  buyer: string;
  robotId: string;
  jobSpecHash: string;
  price: bigint;
  deadline: bigint;
  status: number;
  completionHash: string;
  tokenId: bigint;
  settleAfter: bigint;
  qualityScore: number;
  workUnits: number;
}

export async function getJob(jobId: bigint): Promise<JobInfo | null> {
  if (!jobEscrow) {
    return null;
  }

  try {
    const job = await jobEscrow.getJob(jobId);
    return {
      buyer: job.buyer,
      robotId: job.robotId,
      jobSpecHash: job.jobSpecHash,
      price: job.price,
      deadline: job.deadline,
      status: Number(job.status),
      completionHash: job.completionHash,
      tokenId: job.tokenId,
      settleAfter: job.settleAfter,
      qualityScore: Number(job.qualityScore),
      workUnits: Number(job.workUnits),
    };
  } catch {
    return null;
  }
}

export async function getControllerForRobot(robotId: string): Promise<string | null> {
  if (!identityRegistry) {
    return null;
  }

  try {
    const controller = await identityRegistry.getController(robotId);
    return controller === ethers.ZeroAddress ? null : controller;
  } catch {
    return null;
  }
}

/**
 * Register a robot on-chain via relayer
 * Used for auto-registration on first job completion
 */
export async function registerRobot(
  robotId: string,
  controllerAddress: string,
  pubkey: string = '0x'
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!relayerWallet || !identityRegistry) {
    return { success: false, error: 'Relayer not configured' };
  }

  try {
    // Check if already registered
    const existingController = await identityRegistry.getController(robotId);
    if (existingController !== ethers.ZeroAddress) {
      return { success: true, txHash: 'already-registered' };
    }

    // Submit registration tx
    const tx = await identityRegistry.registerRobot(
      robotId,
      controllerAddress,
      pubkey,
      {
        gasLimit: 200000,
        maxFeePerGas: ethers.parseUnits(String(config.MAX_FEE_PER_GAS_GWEI), 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits(String(config.MAX_PRIORITY_FEE_GWEI), 'gwei'),
      }
    );

    await tx.wait();

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// ============================================================================
// Build Claim for Signing
// ============================================================================

/**
 * Build a CompletionClaimV2 for client to sign
 */
export async function buildClaimForSigning(
  jobId: bigint,
  completionHash: string,
  qualityScore: number,
  workUnits: number
): Promise<{ claim: CompletionClaimV2; domain: TypedDataDomain; types: typeof COMPLETION_CLAIM_V2_TYPES } | null> {
  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  const controller = await getControllerForRobot(job.robotId);
  if (!controller) {
    return null;
  }

  const claim: CompletionClaimV2 = {
    jobId,
    jobSpecHash: job.jobSpecHash,
    completionHash,
    robotId: job.robotId,
    controller,
    deadline: job.deadline,
    qualityScore,
    workUnits,
  };

  return {
    claim,
    domain: getDomain(),
    types: COMPLETION_CLAIM_V2_TYPES,
  };
}
