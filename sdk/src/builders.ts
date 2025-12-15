import { Interface, TransactionRequest } from 'ethers';
import type { CreateJobParams, SubmitCompletionParams } from './types.js';

const JOB_ESCROW_ABI = [
  'function createJob(bytes32 jobSpecHash, bytes32 robotId, uint256 price, uint256 deadline) returns (uint256)',
  'function fund(uint256 jobId)',
  'function submitCompletion(uint256 jobId, bytes32 completionHash, bytes signature)',
  'function settle(uint256 jobId)',
  'function getJob(uint256 jobId) view returns (tuple(address buyer, bytes32 robotId, bytes32 jobSpecHash, uint256 price, uint256 deadline, uint8 status, bytes32 completionHash, uint256 tokenId, uint256 settleAfter))',
];

const BOND_MANAGER_ABI = [
  'function deposit(bytes32 robotId, uint256 amount)',
  'function withdraw(bytes32 robotId, uint256 amount)',
  'function bonded(bytes32 robotId) view returns (uint256)',
  'function available(bytes32 robotId) view returns (uint256)',
];

const IDENTITY_REGISTRY_ABI = [
  'function registerRobot(bytes32 robotId, address controller, bytes pubkey)',
  'function getController(bytes32 robotId) view returns (address)',
  'function isActive(bytes32 robotId) view returns (bool)',
];

const DISPUTE_MANAGER_ABI = [
  'function openDispute(uint256 jobId, bytes32 reasonHash)',
  'function resolve(uint256 jobId, uint8 verdict)',
  'function getDispute(uint256 jobId) view returns (tuple(uint256 jobId, address challenger, bytes32 reasonHash, uint8 verdict, uint256 createdAt))',
];

export const escrowInterface = new Interface(JOB_ESCROW_ABI);
export const bondInterface = new Interface(BOND_MANAGER_ABI);
export const identityInterface = new Interface(IDENTITY_REGISTRY_ABI);
export const disputeInterface = new Interface(DISPUTE_MANAGER_ABI);

export function createJobTx(to: string, params: CreateJobParams): TransactionRequest {
  return {
    to,
    data: escrowInterface.encodeFunctionData('createJob', [
      params.jobSpecHash,
      params.robotId,
      params.price,
      params.deadline,
    ]),
  };
}

export function fundJobTx(to: string, jobId: bigint): TransactionRequest {
  return {
    to,
    data: escrowInterface.encodeFunctionData('fund', [jobId]),
  };
}

export function submitCompletionTx(to: string, params: SubmitCompletionParams): TransactionRequest {
  return {
    to,
    data: escrowInterface.encodeFunctionData('submitCompletion', [
      params.jobId,
      params.completionHash,
      params.signature,
    ]),
  };
}

export function settleTx(to: string, jobId: bigint): TransactionRequest {
  return {
    to,
    data: escrowInterface.encodeFunctionData('settle', [jobId]),
  };
}

export function depositBondTx(to: string, robotId: string, amount: bigint): TransactionRequest {
  return {
    to,
    data: bondInterface.encodeFunctionData('deposit', [robotId, amount]),
  };
}

export function registerRobotTx(
  to: string,
  robotId: string,
  controller: string,
  pubkey: string = '0x'
): TransactionRequest {
  return {
    to,
    data: identityInterface.encodeFunctionData('registerRobot', [robotId, controller, pubkey]),
  };
}

export function openDisputeTx(to: string, jobId: bigint, reasonHash: string): TransactionRequest {
  return {
    to,
    data: disputeInterface.encodeFunctionData('openDispute', [jobId, reasonHash]),
  };
}
