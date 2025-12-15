import { Wallet, TypedDataDomain, TypedDataField, verifyTypedData } from 'ethers';
import type { CompletionClaim, CompletionClaimV2, WitnessClaim } from './types.js';

export const COMPLETION_CLAIM_TYPES: Record<string, TypedDataField[]> = {
  CompletionClaim: [
    { name: 'jobId', type: 'uint256' },
    { name: 'jobSpecHash', type: 'bytes32' },
    { name: 'completionHash', type: 'bytes32' },
    { name: 'robotId', type: 'bytes32' },
    { name: 'controller', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export const WITNESS_CLAIM_TYPES: Record<string, TypedDataField[]> = {
  WitnessClaim: [
    { name: 'jobId', type: 'uint256' },
    { name: 'completionHash', type: 'bytes32' },
    { name: 'witness', type: 'address' },
    { name: 'issuedAt', type: 'uint256' },
  ],
};

export const COMPLETION_CLAIM_V2_TYPES: Record<string, TypedDataField[]> = {
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

export function getDomain(chainId: bigint, verifyingContract: string): TypedDataDomain {
  return {
    name: 'VRWX',
    version: '1',
    chainId,
    verifyingContract,
  };
}

export async function signCompletionEIP712(
  claim: CompletionClaim,
  domain: TypedDataDomain,
  signer: Wallet
): Promise<string> {
  return signer.signTypedData(domain, COMPLETION_CLAIM_TYPES, claim);
}

export async function signWitnessEIP712(
  claim: WitnessClaim,
  domain: TypedDataDomain,
  signer: Wallet
): Promise<string> {
  return signer.signTypedData(domain, WITNESS_CLAIM_TYPES, claim);
}

export function verifyCompletionSignature(
  claim: CompletionClaim,
  signature: string,
  domain: TypedDataDomain
): string {
  return verifyTypedData(domain, COMPLETION_CLAIM_TYPES, claim, signature);
}

export function verifyWitnessSignature(
  claim: WitnessClaim,
  signature: string,
  domain: TypedDataDomain
): string {
  return verifyTypedData(domain, WITNESS_CLAIM_TYPES, claim, signature);
}

export async function signCompletionV2EIP712(
  claim: CompletionClaimV2,
  domain: TypedDataDomain,
  signer: Wallet
): Promise<string> {
  return signer.signTypedData(domain, COMPLETION_CLAIM_V2_TYPES, claim);
}

export function verifyCompletionV2Signature(
  claim: CompletionClaimV2,
  signature: string,
  domain: TypedDataDomain
): string {
  return verifyTypedData(domain, COMPLETION_CLAIM_V2_TYPES, claim, signature);
}
