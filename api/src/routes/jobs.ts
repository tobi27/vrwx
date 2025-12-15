import { FastifyPluginAsync } from 'fastify';
import { hashJobSpec, hashCompletion, type JobSpec, type Completion, JobStatus, Verdict } from '@vrwx/sdk';

interface CreateJobBody {
  jobSpec: JobSpec;
  robotId: string;
  price: string;
  deadline: number;
}

interface FundJobBody {
  // Buyer signature or token amount could go here
}

interface CompleteJobBody {
  completion: Completion;
  signature: string;
}

interface DisputeJobBody {
  reason: string;
}

// In-memory store for demo (replace with database in production)
const jobs = new Map<
  number,
  {
    id: number;
    buyer: string;
    robotId: string;
    jobSpec: JobSpec;
    jobSpecHash: string;
    price: string;
    deadline: number;
    status: JobStatus;
    completionHash?: string;
    completion?: Completion;
    tokenId?: string;
    settleAfter?: number;
    createdAt: string;
    updatedAt: string;
  }
>();

let jobCounter = 0;

export const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  // Create job
  fastify.post<{ Body: CreateJobBody }>('/', async (request, reply) => {
    const { jobSpec, robotId, price, deadline } = request.body;

    if (!jobSpec || !robotId || !price || !deadline) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const jobSpecHash = hashJobSpec(jobSpec);
    const id = ++jobCounter;

    const job = {
      id,
      buyer: request.headers['x-buyer-address'] as string || '0x0000000000000000000000000000000000000000',
      robotId,
      jobSpec,
      jobSpecHash,
      price,
      deadline,
      status: JobStatus.CREATED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    jobs.set(id, job);

    fastify.log.info(`Job ${id} created`);

    return reply.status(201).send({
      jobId: id,
      jobSpecHash,
      status: 'CREATED',
      message: 'Job created successfully. Call /jobs/:id/fund to fund it.',
    });
  });

  // Fund job
  fastify.post<{ Params: { id: string }; Body: FundJobBody }>('/:id/fund', async (request, reply) => {
    const jobId = parseInt(request.params.id);
    const job = jobs.get(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (job.status !== JobStatus.CREATED) {
      return reply.status(400).send({ error: 'Job cannot be funded in current status' });
    }

    job.status = JobStatus.FUNDED;
    job.updatedAt = new Date().toISOString();

    fastify.log.info(`Job ${jobId} funded`);

    return {
      jobId,
      status: 'FUNDED',
      message: 'Job funded. Robot can now submit completion.',
    };
  });

  // Submit completion
  fastify.post<{ Params: { id: string }; Body: CompleteJobBody }>('/:id/complete', async (request, reply) => {
    const jobId = parseInt(request.params.id);
    const { completion, signature } = request.body;
    const job = jobs.get(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (job.status !== JobStatus.FUNDED) {
      return reply.status(400).send({ error: 'Job must be funded before completion' });
    }

    if (Date.now() / 1000 > job.deadline) {
      return reply.status(400).send({ error: 'Deadline passed' });
    }

    // In production, verify signature on-chain
    if (!signature) {
      return reply.status(400).send({ error: 'Signature required' });
    }

    const completionHash = hashCompletion(completion);

    job.status = JobStatus.COMPLETED;
    job.completionHash = completionHash;
    job.completion = completion;
    job.settleAfter = Math.floor(Date.now() / 1000) + 86400; // 24h
    job.updatedAt = new Date().toISOString();

    fastify.log.info(`Job ${jobId} completed`);

    return {
      jobId,
      completionHash,
      status: 'COMPLETED',
      settleAfter: job.settleAfter,
      message: `Completion submitted. Can settle after ${new Date(job.settleAfter * 1000).toISOString()}`,
    };
  });

  // Settle job
  fastify.post<{ Params: { id: string } }>('/:id/settle', async (request, reply) => {
    const jobId = parseInt(request.params.id);
    const job = jobs.get(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (job.status !== JobStatus.COMPLETED) {
      return reply.status(400).send({ error: 'Job must be completed before settlement' });
    }

    if (job.settleAfter && Date.now() / 1000 < job.settleAfter) {
      return reply.status(400).send({
        error: 'Challenge window still active',
        settleAfter: job.settleAfter,
      });
    }

    // Calculate settlement
    const price = BigInt(job.price);
    const fee = (price * 250n) / 10000n; // 2.5%
    const payout = price - fee;

    // Generate token ID
    const tokenId = `0x${Buffer.from(
      job.jobSpecHash!.slice(2) + job.completionHash!.slice(2),
      'hex'
    ).toString('hex')}`;

    job.status = JobStatus.SETTLED;
    job.tokenId = tokenId;
    job.updatedAt = new Date().toISOString();

    fastify.log.info(`Job ${jobId} settled`);

    return {
      jobId,
      status: 'SETTLED',
      tokenId: job.tokenId,
      fee: fee.toString(),
      payout: payout.toString(),
      message: 'Job settled. Receipt minted.',
    };
  });

  // Get job
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const jobId = parseInt(request.params.id);
    const job = jobs.get(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return {
      jobId: job.id,
      buyer: job.buyer,
      robotId: job.robotId,
      jobSpecHash: job.jobSpecHash,
      price: job.price,
      deadline: job.deadline,
      status: JobStatus[job.status],
      completionHash: job.completionHash,
      tokenId: job.tokenId,
      settleAfter: job.settleAfter,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  });

  // Open dispute
  fastify.post<{ Params: { id: string }; Body: DisputeJobBody }>('/:id/dispute', async (request, reply) => {
    const jobId = parseInt(request.params.id);
    const { reason } = request.body;
    const job = jobs.get(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (job.status !== JobStatus.COMPLETED) {
      return reply.status(400).send({ error: 'Can only dispute completed jobs' });
    }

    if (job.settleAfter && Date.now() / 1000 >= job.settleAfter) {
      return reply.status(400).send({ error: 'Challenge window has passed' });
    }

    job.status = JobStatus.DISPUTED;
    job.updatedAt = new Date().toISOString();

    fastify.log.info(`Job ${jobId} disputed: ${reason}`);

    return {
      jobId,
      status: 'DISPUTED',
      reason,
      message: 'Dispute opened. Admin will review.',
    };
  });
};
