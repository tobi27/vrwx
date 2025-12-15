import { FastifyPluginAsync } from 'fastify';
import { hashJobSpec, type JobSpec, DEPIN_CONSTANTS } from '@vrwx/sdk';
import { SERVICE_TYPE_HASHES, ServiceType, isValidServiceType } from './services.js';

interface CreateOfferBody {
  robotId: string;
  jobSpec: JobSpec;
  price: string;
  duration: number; // seconds
  serviceType?: ServiceType; // V2: explicit service type
  minBond?: string; // V2: custom minimum bond
}

interface Offer {
  id: number;
  operator: string;
  robotId: string;
  jobSpecHash: string;
  jobSpec: JobSpec;
  price: string;
  expiresAt: number;
  active: boolean;
  createdAt: string;
  purchasedBy?: string;
  jobId?: number;
  serviceTypeHash?: string; // V2: for multi-service
}

// In-memory store (replace with database/blockchain in production)
const offers = new Map<number, Offer>();
let offerCounter = 0;

// Track operator stakes (in production, read from blockchain)
const operatorStakes = new Map<string, bigint>();

export const offersRoutes: FastifyPluginAsync = async (fastify) => {
  // Get active offers
  fastify.get('/', async (request, reply) => {
    const { geoCell, minQuality, maxPrice, serviceType, limit = '20' } = request.query as {
      geoCell?: string;
      minQuality?: string;
      maxPrice?: string;
      serviceType?: string; // V2: filter by service type
      limit?: string;
    };

    let activeOffers = Array.from(offers.values()).filter(
      (offer) => offer.active && offer.expiresAt > Math.floor(Date.now() / 1000)
    );

    // V2: Filter by serviceType
    if (serviceType) {
      activeOffers = activeOffers.filter((o) => o.jobSpec.serviceType === serviceType);
    }

    // Filter by geoCell
    if (geoCell) {
      activeOffers = activeOffers.filter((o) => o.jobSpec.geoCell === geoCell);
    }

    // Filter by minQuality
    if (minQuality) {
      const minQ = parseInt(minQuality);
      activeOffers = activeOffers.filter((o) => o.jobSpec.qualityMin >= minQ);
    }

    // Filter by maxPrice
    if (maxPrice) {
      const maxP = BigInt(maxPrice);
      activeOffers = activeOffers.filter((o) => BigInt(o.price) <= maxP);
    }

    // Limit results
    activeOffers = activeOffers.slice(0, parseInt(limit));

    return {
      count: activeOffers.length,
      offers: activeOffers.map((o) => ({
        id: o.id,
        operator: o.operator,
        robotId: o.robotId,
        jobSpecHash: o.jobSpecHash,
        serviceType: o.jobSpec.serviceType,
        serviceTypeHash: o.serviceTypeHash, // V2: include hash
        geoCell: o.jobSpec.geoCell,
        qualityMin: o.jobSpec.qualityMin,
        price: o.price,
        expiresAt: o.expiresAt,
      })),
    };
  });

  // Create offer
  fastify.post<{ Body: CreateOfferBody }>('/', async (request, reply) => {
    const { robotId, jobSpec, price, duration, serviceType, minBond } = request.body;
    const operator = (request.headers['x-operator-address'] as string) || '0x0000000000000000000000000000000000000000';

    if (!robotId || !jobSpec || !price || !duration) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    // Check stake (in production, verify on-chain)
    const stake = operatorStakes.get(operator.toLowerCase()) || 0n;
    if (stake < DEPIN_CONSTANTS.MIN_STAKE_VRWX) {
      return reply.status(403).send({
        error: 'Insufficient stake',
        required: DEPIN_CONSTANTS.MIN_STAKE_VRWX.toString(),
        current: stake.toString(),
        message: `Operator must stake at least ${Number(DEPIN_CONSTANTS.MIN_STAKE_VRWX) / 1e18} VRWX`,
      });
    }

    // V2: Determine service type hash
    const effectiveServiceType = serviceType || (jobSpec.serviceType as ServiceType) || 'inspection';
    const serviceTypeHash = isValidServiceType(effectiveServiceType)
      ? SERVICE_TYPE_HASHES[effectiveServiceType]
      : undefined;

    const jobSpecHash = hashJobSpec(jobSpec);
    const id = ++offerCounter;
    const now = Math.floor(Date.now() / 1000);

    const offer: Offer = {
      id,
      operator,
      robotId,
      jobSpecHash,
      jobSpec,
      price,
      expiresAt: now + duration,
      active: true,
      createdAt: new Date().toISOString(),
      serviceTypeHash, // V2: store service type hash
    };

    offers.set(id, offer);

    fastify.log.info(`Offer ${id} created by ${operator} (service: ${effectiveServiceType})`);

    return reply.status(201).send({
      offerId: id,
      jobSpecHash,
      serviceTypeHash, // V2: include in response
      expiresAt: offer.expiresAt,
      listingFeeBurned: DEPIN_CONSTANTS.DEFAULT_LISTING_FEE_VRWX.toString(),
      message: 'Offer created successfully',
    });
  });

  // Get single offer
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const offerId = parseInt(request.params.id);
    const offer = offers.get(offerId);

    if (!offer) {
      return reply.status(404).send({ error: 'Offer not found' });
    }

    return {
      id: offer.id,
      operator: offer.operator,
      robotId: offer.robotId,
      jobSpecHash: offer.jobSpecHash,
      serviceTypeHash: offer.serviceTypeHash, // V2
      jobSpec: offer.jobSpec,
      price: offer.price,
      expiresAt: offer.expiresAt,
      active: offer.active,
      purchasable: offer.active && offer.expiresAt > Math.floor(Date.now() / 1000),
      createdAt: offer.createdAt,
      purchasedBy: offer.purchasedBy,
      jobId: offer.jobId,
    };
  });

  // Buy offer
  fastify.post<{ Params: { id: string } }>('/:id/buy', async (request, reply) => {
    const offerId = parseInt(request.params.id);
    const buyer = (request.headers['x-buyer-address'] as string) || '0x0000000000000000000000000000000000000000';
    const offer = offers.get(offerId);

    if (!offer) {
      return reply.status(404).send({ error: 'Offer not found' });
    }

    if (!offer.active) {
      return reply.status(400).send({ error: 'Offer is not active' });
    }

    if (offer.expiresAt <= Math.floor(Date.now() / 1000)) {
      return reply.status(400).send({ error: 'Offer has expired' });
    }

    // Mark offer as purchased
    offer.active = false;
    offer.purchasedBy = buyer;

    // Create job (in production, this happens on-chain atomically)
    const jobId = Date.now(); // Simulated job ID
    offer.jobId = jobId;

    fastify.log.info(`Offer ${offerId} purchased by ${buyer}, job ${jobId} created`);

    return {
      offerId,
      jobId,
      buyer,
      price: offer.price,
      jobSpecHash: offer.jobSpecHash,
      serviceTypeHash: offer.serviceTypeHash, // V2
      robotId: offer.robotId,
      message: 'Offer purchased. Job created and funded.',
    };
  });

  // Cancel offer
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const offerId = parseInt(request.params.id);
    const operator = (request.headers['x-operator-address'] as string) || '';
    const offer = offers.get(offerId);

    if (!offer) {
      return reply.status(404).send({ error: 'Offer not found' });
    }

    if (offer.operator.toLowerCase() !== operator.toLowerCase()) {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    if (!offer.active) {
      return reply.status(400).send({ error: 'Offer is not active' });
    }

    offer.active = false;

    fastify.log.info(`Offer ${offerId} cancelled by ${operator}`);

    return {
      offerId,
      status: 'cancelled',
      message: 'Offer cancelled',
    };
  });

  // Register stake (for testing - in production, read from blockchain)
  fastify.post('/stake', async (request, reply) => {
    const { operator, amount } = request.body as { operator: string; amount: string };

    if (!operator || !amount) {
      return reply.status(400).send({ error: 'Missing operator or amount' });
    }

    const currentStake = operatorStakes.get(operator.toLowerCase()) || 0n;
    operatorStakes.set(operator.toLowerCase(), currentStake + BigInt(amount));

    return {
      operator,
      stake: operatorStakes.get(operator.toLowerCase())!.toString(),
      message: 'Stake registered',
    };
  });
};
