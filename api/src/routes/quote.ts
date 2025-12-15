import { FastifyPluginAsync } from 'fastify';
import {
  hashJobSpec,
  type JobSpec,
  CONSTANTS,
  DEPIN_CONSTANTS,
  estimateReward,
  calculateReliabilityScore,
} from '@vrwx/sdk';
import { SERVICE_TYPE_HASHES, ServiceType, isValidServiceType, getServiceBaseRate } from './services.js';

interface QuoteRequest {
  jobSpec: JobSpec;
  serviceType?: ServiceType; // V2: explicit service type
  serviceParams?: object; // V2: service-specific params
  estimatedWorkUnits?: number;
  operatorDisputes?: number;
  operatorSlashes?: number;
}

interface QuoteResponse {
  jobSpecHash: string;
  serviceTypeHash?: string; // V2: for multi-service
  pricing: {
    suggestedPrice: string;
    minBond: string;
    protocolFee: string;
    operatorPayout: string;
  };
  rewards: {
    estimatedReward: string;
    qualityMultiplierRange: {
      min: number;
      max: number;
    };
    reliabilityMultiplier: number;
  };
  staking: {
    minStakeRequired: string;
    recommendedStake: string;
    slashRisk: string;
  };
  parameters: {
    workUnits: number;
    qualityMin: number;
    reliabilityBps: number;
    serviceType?: string;
  };
  rationale?: string; // V2: pricing explanation
}

export const quoteRoutes: FastifyPluginAsync = async (fastify) => {
  // Get quote for a job
  fastify.post<{ Body: QuoteRequest }>('/', async (request, reply) => {
    const {
      jobSpec,
      serviceType,
      serviceParams,
      estimatedWorkUnits = 5,
      operatorDisputes = 0,
      operatorSlashes = 0,
    } = request.body;

    if (!jobSpec) {
      return reply.status(400).send({ error: 'jobSpec is required' });
    }

    // Determine service type from request or jobSpec
    const effectiveServiceType = serviceType || (jobSpec.serviceType as ServiceType) || 'inspection';

    // Validate service type if provided
    if (serviceType && !isValidServiceType(serviceType)) {
      return reply.status(400).send({
        error: 'Invalid serviceType',
        validTypes: ['inspection', 'security_patrol', 'delivery'],
      });
    }

    const jobSpecHash = hashJobSpec(jobSpec);
    const serviceTypeHash = SERVICE_TYPE_HASHES[effectiveServiceType];

    // Calculate reliability
    const reliabilityBps = calculateReliabilityScore(operatorDisputes, operatorSlashes);

    // Pricing rule v1 (service-aware)
    // Base rate varies by service type
    const baseRateUsd = getServiceBaseRate(effectiveServiceType);
    const basePrice = BigInt(baseRateUsd) * BigInt(10 ** 18);
    const qualityFactor = 1 + (jobSpec.qualityMin - 80) * 0.01; // Higher quality = higher price
    const suggestedPrice = BigInt(Math.floor(Number(basePrice) * estimatedWorkUnits * qualityFactor));

    // Minimum bond (10% of price)
    const minBond = (suggestedPrice * CONSTANTS.MIN_BOND_RATIO) / 10000n;

    // Protocol fee (2.5%)
    const protocolFee = (suggestedPrice * CONSTANTS.TAU_BPS) / 10000n;
    const operatorPayout = suggestedPrice - protocolFee;

    // Reward estimate
    const estimatedRewardWei = estimateReward(estimatedWorkUnits, jobSpec.qualityMin, reliabilityBps);

    // Quality multiplier range (0.8x to 1.2x)
    const qualityMultMin = Number(DEPIN_CONSTANTS.MIN_QUALITY_MULT) / 10000;
    const qualityMultMax = Number(DEPIN_CONSTANTS.MAX_QUALITY_MULT) / 10000;

    // Reliability multiplier
    const reliabilityMult =
      Number(DEPIN_CONSTANTS.MIN_RELIABILITY_MULT) / 10000 +
      (reliabilityBps / 10000) *
        (Number(DEPIN_CONSTANTS.MAX_RELIABILITY_MULT - DEPIN_CONSTANTS.MIN_RELIABILITY_MULT) / 10000);

    // Staking recommendations
    const minStake = DEPIN_CONSTANTS.MIN_STAKE_VRWX;
    const recommendedStake = minStake * 2n; // 2x minimum for safety buffer
    const slashRisk = (minStake * DEPIN_CONSTANTS.SLASH_PERCENT_BPS) / 10000n;

    // Build rationale
    const rationale = `${effectiveServiceType} service: base rate $${baseRateUsd}/unit x ${estimatedWorkUnits} work units x ${qualityFactor.toFixed(2)} quality factor`;

    const response: QuoteResponse = {
      jobSpecHash,
      serviceTypeHash, // V2: include service type hash
      pricing: {
        suggestedPrice: suggestedPrice.toString(),
        minBond: minBond.toString(),
        protocolFee: protocolFee.toString(),
        operatorPayout: operatorPayout.toString(),
      },
      rewards: {
        estimatedReward: estimatedRewardWei.toString(),
        qualityMultiplierRange: {
          min: qualityMultMin,
          max: qualityMultMax,
        },
        reliabilityMultiplier: reliabilityMult,
      },
      staking: {
        minStakeRequired: minStake.toString(),
        recommendedStake: recommendedStake.toString(),
        slashRisk: slashRisk.toString(),
      },
      parameters: {
        workUnits: estimatedWorkUnits,
        qualityMin: jobSpec.qualityMin,
        reliabilityBps,
        serviceType: effectiveServiceType, // V2: include service type
      },
      rationale, // V2: pricing explanation
    };

    return response;
  });

  // Get pricing parameters
  fastify.get('/parameters', async () => {
    return {
      protocol: {
        feePercent: Number(CONSTANTS.TAU_BPS) / 100,
        challengeWindowSeconds: Number(CONSTANTS.CHALLENGE_WINDOW),
        minBondRatioPercent: Number(CONSTANTS.MIN_BOND_RATIO) / 100,
      },
      depin: {
        baseRewardVRWX: Number(DEPIN_CONSTANTS.BASE_REWARD) / 1e18,
        minStakeVRWX: Number(DEPIN_CONSTANTS.MIN_STAKE_VRWX) / 1e18,
        unlockDelayDays: Number(DEPIN_CONSTANTS.UNLOCK_DELAY) / 86400,
        slashPercent: Number(DEPIN_CONSTANTS.SLASH_PERCENT_BPS) / 100,
        listingFeeVRWX: Number(DEPIN_CONSTANTS.DEFAULT_LISTING_FEE_VRWX) / 1e18,
      },
      multipliers: {
        quality: {
          min: Number(DEPIN_CONSTANTS.MIN_QUALITY_MULT) / 10000,
          max: Number(DEPIN_CONSTANTS.MAX_QUALITY_MULT) / 10000,
        },
        reliability: {
          min: Number(DEPIN_CONSTANTS.MIN_RELIABILITY_MULT) / 10000,
          max: Number(DEPIN_CONSTANTS.MAX_RELIABILITY_MULT) / 10000,
        },
      },
      penalties: {
        disputePercent: Number(DEPIN_CONSTANTS.DISPUTE_PENALTY_BPS) / 100,
        slashPercent: Number(DEPIN_CONSTANTS.SLASH_PENALTY_BPS) / 100,
        maxDisputePenaltyPercent: Number(DEPIN_CONSTANTS.MAX_DISPUTE_PENALTY) / 100,
        maxSlashPenaltyPercent: Number(DEPIN_CONSTANTS.MAX_SLASH_PENALTY) / 100,
      },
    };
  });
};
