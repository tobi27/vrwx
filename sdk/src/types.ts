// Service types supported by VRWX
export type ServiceType = 'inspection' | 'security_patrol' | 'delivery';

export interface JobSpec {
  serviceType: ServiceType;
  geoCell: string;
  timeWindow: {
    start: number;
    end: number;
  };
  qualityMin: number;
  deliverableManifestHash: string;
  serviceParams?: Record<string, unknown>;
}

// Artifact produced during execution
export interface ExecutionArtifact {
  type: string;
  sha256: string;
  bytes: number;
}

// Canonical execution manifest
export interface ExecutionManifest {
  // Version fields (M4.2)
  manifestVersion?: string; // e.g., "2.0"
  schemaVersion?: string; // e.g., "2025-12-15"
  serviceModuleVersion?: string; // e.g., "1.0"
  // Core fields
  jobId: number;
  robotId: string;
  controller: string;
  serviceType: ServiceType;
  startTs: number;
  endTs: number;
  routeDigest?: string;
  artifacts?: ExecutionArtifact[];
  // Service-specific fields
  inspection?: {
    coverageVisited: number;
    coverageTotal: number;
    anomaliesDetected?: number;
  };
  patrol?: {
    checkpointsRequired?: string[];
    checkpointsVisited: string[];
    dwellSeconds: number[];
    minDwellRequired?: number;
  };
  delivery?: {
    pickupProofHash: string;
    dropoffProofHash: string;
    pickupTs?: number;
    dropoffTs?: number;
  };
}

export interface Completion {
  jobSpecHash: string;
  datasetHash: string;
  coveredGeoCell: string;
  qualityScore: number;
  timestampsHash: string;
}

export interface CompletionClaim {
  jobId: bigint;
  jobSpecHash: string;
  completionHash: string;
  robotId: string;
  controller: string;
  deadline: bigint;
}

export interface WitnessClaim {
  jobId: bigint;
  completionHash: string;
  witness: string;
  issuedAt: bigint;
}

export enum JobStatus {
  CREATED = 0,
  FUNDED = 1,
  COMPLETED = 2,
  SETTLED = 3,
  DISPUTED = 4,
  REFUNDED = 5,
}

export enum Verdict {
  PENDING = 0,
  VALID = 1,
  FRAUD = 2,
  NON_DELIVERY = 3,
}

export interface Job {
  buyer: string;
  robotId: string;
  jobSpecHash: string;
  price: bigint;
  deadline: bigint;
  status: JobStatus;
  completionHash: string;
  tokenId: bigint;
  settleAfter: bigint;
}

export interface CreateJobParams {
  jobSpecHash: string;
  robotId: string;
  price: bigint;
  deadline: bigint;
}

export interface SubmitCompletionParams {
  jobId: bigint;
  completionHash: string;
  signature: string;
}

// V2 types with DePIN metrics
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

export interface SubmitCompletionV2Params {
  jobId: bigint;
  completionHash: string;
  qualityScore: number;
  workUnits: number;
  signature: string;
}

// Updated Job interface with DePIN fields
export interface JobV2 extends Job {
  qualityScore: number;
  workUnits: number;
}

// Staking types
export interface StakeData {
  staked: bigint;
  unlockRequestedAt: bigint;
  unlockAmount: bigint;
}

// Reputation types
export interface ReputationData {
  totalJobs: bigint;
  totalDisputes: number;
  totalSlashes: number;
  reliabilityScoreBps: number;
}

// Offer types
export interface Offer {
  operator: string;
  robotId: string;
  jobSpecHash: string;
  price: bigint;
  expiresAt: bigint;
  active: boolean;
}

export interface CreateOfferParams {
  robotId: string;
  jobSpecHash: string;
  price: bigint;
  duration: bigint;
}

// Reward preview
export interface RewardParams {
  robotId: string;
  controller: string;
  qualityScore: number;
  workUnits: number;
  jobPrice: bigint;
}

export interface QuoteResponse {
  estimatedReward: bigint;
  qualityMultiplierRange: { min: number; max: number };
  reliabilityMultiplier: number;
}

// V2 Multi-Service Types

// Extended Job with serviceTypeHash
export interface JobV2MultiService extends JobV2 {
  serviceTypeHash: string;
}

// V2 Offer with serviceType
export interface OfferV2 extends Offer {
  serviceTypeHash: string;
}

export interface CreateOfferV2Params {
  serviceTypeHash: string;
  robotId: string;
  jobSpecHash: string;
  price: bigint;
  deadline: bigint;
  minBond?: bigint;
}

export interface CreateJobV2Params {
  serviceTypeHash: string;
  jobSpecHash: string;
  robotId: string;
  price: bigint;
  deadline: bigint;
}

// Quote V2 with multi-service support
export interface QuoteV2Request {
  serviceType: ServiceType;
  serviceParams?: Record<string, unknown>;
  geoCell: string;
  timeWindow: { start: number; end: number };
  qualityMin: number;
  estimatedWorkUnits?: number;
}

export interface QuoteV2Response {
  jobSpec: JobSpec;
  jobSpecHash: string;
  serviceTypeHash: string;
  price: string;
  minBond: string;
  deadline: number;
  rationale: string;
  rewards: {
    estimatedReward: string;
    qualityMultiplierRange: { min: number; max: number };
    reliabilityMultiplier: number;
  };
}

// Service verification result
export interface VerificationResult {
  ok: boolean;
  reason?: string;
  qualityScore: number;
  workUnits: number;
}

// Service registry entry
export interface ServiceDefinition {
  id: ServiceType;
  label: string;
  description: string;
  requiredCapabilities: string[];
  baseRateUsd: number;
}
