import { FastifyPluginAsync } from 'fastify';
import type { ServiceType } from './services.js';
import { getDLQStats, getDLQMetrics } from '../services/dlq.js';
import { getIdempotencyStats } from '../middleware/idempotency.js';

// ============================================================================
// Types
// ============================================================================

// Per-service metrics structure
interface ServiceMetrics {
  gmv: string;
  offersActive: number;
  offersFilled: number;
  fillRate: number;
  avgPriceUsd: number;
  disputes: number;
  disputeRate: number;
  slashesStable: string;
  slashesVRWX: string;
  rewardsMinted: string;
  vrwxBurned: string;
}

// Per-connector metrics
interface ConnectorMetrics {
  completionsTotal: number;
  completionsAccepted: number;
  completionsRejected: number;
  latencyP50Ms: number;
  latencyP99Ms: number;
}

// In-memory metrics (in production, aggregate from blockchain events)
interface Metrics {
  jobs: {
    total: number;
    byStatus: {
      created: number;
      funded: number;
      completed: number;
      settled: number;
      disputed: number;
      refunded: number;
    };
  };
  offers: {
    total: number;
    active: number;
    purchased: number;
    cancelled: number;
    expired: number;
  };
  vrwx: {
    totalSupply: string;
    minted: string;
    burned: string;
    staked: string;
  };
  volume: {
    gmv: string; // Gross Merchandise Volume
    fees: string;
    rewards: string;
  };
  disputes: {
    total: number;
    byVerdict: {
      fraud: number;
      nonDelivery: number;
      valid: number;
      pending: number;
    };
  };
  fillRate: number; // Percentage of offers that get purchased
  // V2: Per-service breakdown
  byService: Record<ServiceType, ServiceMetrics>;
  // V3: Per-connector breakdown (M4.2)
  byConnector: Record<string, ConnectorMetrics>;
  // V3: Transaction metrics
  tx: {
    broadcastTotal: number;
    successTotal: number;
    failTotal: number;
  };
}

// Default service metrics
const defaultServiceMetrics = (): ServiceMetrics => ({
  gmv: '0',
  offersActive: 0,
  offersFilled: 0,
  fillRate: 0,
  avgPriceUsd: 0,
  disputes: 0,
  disputeRate: 0,
  slashesStable: '0',
  slashesVRWX: '0',
  rewardsMinted: '0',
  vrwxBurned: '0',
});

const defaultConnectorMetrics = (): ConnectorMetrics => ({
  completionsTotal: 0,
  completionsAccepted: 0,
  completionsRejected: 0,
  latencyP50Ms: 0,
  latencyP99Ms: 0,
});

// Simulated metrics
const metrics: Metrics = {
  jobs: {
    total: 0,
    byStatus: {
      created: 0,
      funded: 0,
      completed: 0,
      settled: 0,
      disputed: 0,
      refunded: 0,
    },
  },
  offers: {
    total: 0,
    active: 0,
    purchased: 0,
    cancelled: 0,
    expired: 0,
  },
  vrwx: {
    totalSupply: '0',
    minted: '0',
    burned: '0',
    staked: '0',
  },
  volume: {
    gmv: '0',
    fees: '0',
    rewards: '0',
  },
  disputes: {
    total: 0,
    byVerdict: {
      fraud: 0,
      nonDelivery: 0,
      valid: 0,
      pending: 0,
    },
  },
  fillRate: 0,
  // V2: Per-service breakdown
  byService: {
    inspection: defaultServiceMetrics(),
    security_patrol: defaultServiceMetrics(),
    delivery: defaultServiceMetrics(),
  },
  // V3: Per-connector breakdown
  byConnector: {
    webhook: defaultConnectorMetrics(),
    rmf: defaultConnectorMetrics(),
  },
  // V3: Transaction metrics
  tx: {
    broadcastTotal: 0,
    successTotal: 0,
    failTotal: 0,
  },
};

// ============================================================================
// Metric Helpers
// ============================================================================

export function incrementCompletionAccepted(connector: string, service: string): void {
  if (!metrics.byConnector[connector]) {
    metrics.byConnector[connector] = defaultConnectorMetrics();
  }
  metrics.byConnector[connector].completionsTotal++;
  metrics.byConnector[connector].completionsAccepted++;
}

export function incrementCompletionRejected(connector: string, service: string, reason: string): void {
  if (!metrics.byConnector[connector]) {
    metrics.byConnector[connector] = defaultConnectorMetrics();
  }
  metrics.byConnector[connector].completionsTotal++;
  metrics.byConnector[connector].completionsRejected++;
}

export function incrementTxBroadcast(): void {
  metrics.tx.broadcastTotal++;
}

export function incrementTxSuccess(): void {
  metrics.tx.successTotal++;
}

export function incrementTxFail(): void {
  metrics.tx.failTotal++;
}

// ============================================================================
// Routes
// ============================================================================

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all metrics (JSON)
  fastify.get('/', async () => {
    // Get DLQ and idempotency stats from DB
    let dlqStats = null;
    let idempotencyStats = null;

    try {
      dlqStats = getDLQStats();
    } catch {
      // DB may not be initialized in tests
    }

    try {
      idempotencyStats = getIdempotencyStats();
    } catch {
      // DB may not be initialized in tests
    }

    return {
      timestamp: new Date().toISOString(),
      ...metrics,
      dlq: dlqStats,
      idempotency: idempotencyStats,
    };
  });

  // Get Prometheus-format metrics
  fastify.get('/prometheus', async (request, reply) => {
    // Get DLQ and idempotency stats
    let dlqStats = null;
    let dlqMetrics = null;
    let idempotencyStats = null;

    try {
      dlqStats = getDLQStats();
      dlqMetrics = getDLQMetrics();
    } catch {
      // DB may not be initialized
    }

    try {
      idempotencyStats = getIdempotencyStats();
    } catch {
      // DB may not be initialized
    }

    const lines = [
      '# HELP vrwx_jobs_total Total number of jobs by status',
      '# TYPE vrwx_jobs_total counter',
      `vrwx_jobs_total{status="created"} ${metrics.jobs.byStatus.created}`,
      `vrwx_jobs_total{status="funded"} ${metrics.jobs.byStatus.funded}`,
      `vrwx_jobs_total{status="completed"} ${metrics.jobs.byStatus.completed}`,
      `vrwx_jobs_total{status="settled"} ${metrics.jobs.byStatus.settled}`,
      `vrwx_jobs_total{status="disputed"} ${metrics.jobs.byStatus.disputed}`,
      `vrwx_jobs_total{status="refunded"} ${metrics.jobs.byStatus.refunded}`,
      '',
      '# HELP vrwx_offers_total Total number of offers by status',
      '# TYPE vrwx_offers_total counter',
      `vrwx_offers_total{status="active"} ${metrics.offers.active}`,
      `vrwx_offers_total{status="purchased"} ${metrics.offers.purchased}`,
      `vrwx_offers_total{status="cancelled"} ${metrics.offers.cancelled}`,
      `vrwx_offers_total{status="expired"} ${metrics.offers.expired}`,
      '',
      '# HELP vrwx_token_supply Current VRWX token supply',
      '# TYPE vrwx_token_supply gauge',
      `vrwx_token_supply ${Number(BigInt(metrics.vrwx.totalSupply)) / 1e18}`,
      '',
      '# HELP vrwx_minted_total Total VRWX minted',
      '# TYPE vrwx_minted_total counter',
      `vrwx_minted_total ${Number(BigInt(metrics.vrwx.minted)) / 1e18}`,
      '',
      '# HELP vrwx_burned_total Total VRWX burned',
      '# TYPE vrwx_burned_total counter',
      `vrwx_burned_total ${Number(BigInt(metrics.vrwx.burned)) / 1e18}`,
      '',
      '# HELP vrwx_staked_total Total VRWX staked',
      '# TYPE vrwx_staked_total gauge',
      `vrwx_staked_total ${Number(BigInt(metrics.vrwx.staked)) / 1e18}`,
      '',
      '# HELP vrwx_gmv_total Gross merchandise volume in stablecoins',
      '# TYPE vrwx_gmv_total counter',
      `vrwx_gmv_total ${Number(BigInt(metrics.volume.gmv)) / 1e18}`,
      '',
      '# HELP vrwx_disputes_total Total disputes by verdict',
      '# TYPE vrwx_disputes_total counter',
      `vrwx_disputes_total{verdict="fraud"} ${metrics.disputes.byVerdict.fraud}`,
      `vrwx_disputes_total{verdict="non_delivery"} ${metrics.disputes.byVerdict.nonDelivery}`,
      `vrwx_disputes_total{verdict="valid"} ${metrics.disputes.byVerdict.valid}`,
      `vrwx_disputes_total{verdict="pending"} ${metrics.disputes.byVerdict.pending}`,
      '',
      '# HELP vrwx_fill_rate Offer fill rate percentage',
      '# TYPE vrwx_fill_rate gauge',
      `vrwx_fill_rate ${metrics.fillRate}`,
    ];

    // Per-service metrics
    const serviceTypes = ['inspection', 'security_patrol', 'delivery'] as const;

    lines.push('');
    lines.push('# HELP vrwx_service_gmv GMV by service type');
    lines.push('# TYPE vrwx_service_gmv counter');
    for (const service of serviceTypes) {
      const svc = metrics.byService[service];
      lines.push(`vrwx_service_gmv{service="${service}"} ${Number(BigInt(svc.gmv || '0')) / 1e18}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_offers_active Active offers by service');
    lines.push('# TYPE vrwx_service_offers_active gauge');
    for (const service of serviceTypes) {
      lines.push(`vrwx_service_offers_active{service="${service}"} ${metrics.byService[service].offersActive}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_offers_filled Filled offers by service');
    lines.push('# TYPE vrwx_service_offers_filled counter');
    for (const service of serviceTypes) {
      lines.push(`vrwx_service_offers_filled{service="${service}"} ${metrics.byService[service].offersFilled}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_fill_rate Fill rate by service');
    lines.push('# TYPE vrwx_service_fill_rate gauge');
    for (const service of serviceTypes) {
      lines.push(`vrwx_service_fill_rate{service="${service}"} ${metrics.byService[service].fillRate}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_disputes Total disputes by service');
    lines.push('# TYPE vrwx_service_disputes counter');
    for (const service of serviceTypes) {
      lines.push(`vrwx_service_disputes{service="${service}"} ${metrics.byService[service].disputes}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_dispute_rate Dispute rate by service');
    lines.push('# TYPE vrwx_service_dispute_rate gauge');
    for (const service of serviceTypes) {
      lines.push(`vrwx_service_dispute_rate{service="${service}"} ${metrics.byService[service].disputeRate}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_rewards_minted VRWX rewards minted by service');
    lines.push('# TYPE vrwx_service_rewards_minted counter');
    for (const service of serviceTypes) {
      const svc = metrics.byService[service];
      lines.push(`vrwx_service_rewards_minted{service="${service}"} ${Number(BigInt(svc.rewardsMinted || '0')) / 1e18}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_slashes_vrwx VRWX slashed by service');
    lines.push('# TYPE vrwx_service_slashes_vrwx counter');
    for (const service of serviceTypes) {
      const svc = metrics.byService[service];
      lines.push(`vrwx_service_slashes_vrwx{service="${service}"} ${Number(BigInt(svc.slashesVRWX || '0')) / 1e18}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_slashes_stable Stable slashed by service');
    lines.push('# TYPE vrwx_service_slashes_stable counter');
    for (const service of serviceTypes) {
      const svc = metrics.byService[service];
      lines.push(`vrwx_service_slashes_stable{service="${service}"} ${Number(BigInt(svc.slashesStable || '0')) / 1e18}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_service_vrwx_burned VRWX burned (listing fees) by service');
    lines.push('# TYPE vrwx_service_vrwx_burned counter');
    for (const service of serviceTypes) {
      const svc = metrics.byService[service];
      lines.push(`vrwx_service_vrwx_burned{service="${service}"} ${Number(BigInt(svc.vrwxBurned || '0')) / 1e18}`);
    }

    // =========================================
    // M4.2: Per-connector metrics
    // =========================================

    lines.push('');
    lines.push('# HELP vrwx_completion_requests_total Total completion requests by connector');
    lines.push('# TYPE vrwx_completion_requests_total counter');
    for (const [connector, cm] of Object.entries(metrics.byConnector)) {
      lines.push(`vrwx_completion_requests_total{connector="${connector}"} ${cm.completionsTotal}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_completion_accepted_total Accepted completions by connector');
    lines.push('# TYPE vrwx_completion_accepted_total counter');
    for (const [connector, cm] of Object.entries(metrics.byConnector)) {
      lines.push(`vrwx_completion_accepted_total{connector="${connector}"} ${cm.completionsAccepted}`);
    }

    lines.push('');
    lines.push('# HELP vrwx_completion_rejected_total Rejected completions by connector');
    lines.push('# TYPE vrwx_completion_rejected_total counter');
    for (const [connector, cm] of Object.entries(metrics.byConnector)) {
      lines.push(`vrwx_completion_rejected_total{connector="${connector}"} ${cm.completionsRejected}`);
    }

    // =========================================
    // M4.2: DLQ metrics
    // =========================================

    lines.push('');
    lines.push('# HELP vrwx_dlq_events_total Total DLQ events by type');
    lines.push('# TYPE vrwx_dlq_events_total counter');

    if (dlqMetrics) {
      for (const [type, count] of Object.entries(dlqMetrics.enqueued)) {
        lines.push(`vrwx_dlq_events_total{type="${type}"} ${count}`);
      }
    }

    lines.push('');
    lines.push('# HELP vrwx_dlq_unresolved Unresolved DLQ events');
    lines.push('# TYPE vrwx_dlq_unresolved gauge');
    lines.push(`vrwx_dlq_unresolved ${dlqStats?.unresolved || 0}`);

    lines.push('');
    lines.push('# HELP vrwx_dlq_pending_retry DLQ events pending retry');
    lines.push('# TYPE vrwx_dlq_pending_retry gauge');
    lines.push(`vrwx_dlq_pending_retry ${dlqStats?.pendingRetry || 0}`);

    lines.push('');
    lines.push('# HELP vrwx_dlq_exceeded_retries DLQ events that exceeded max retries');
    lines.push('# TYPE vrwx_dlq_exceeded_retries gauge');
    lines.push(`vrwx_dlq_exceeded_retries ${dlqStats?.exceededRetries || 0}`);

    // =========================================
    // M4.2: Idempotency metrics
    // =========================================

    lines.push('');
    lines.push('# HELP vrwx_idempotency_total Total idempotency records');
    lines.push('# TYPE vrwx_idempotency_total gauge');
    lines.push(`vrwx_idempotency_total ${idempotencyStats?.total || 0}`);

    lines.push('');
    lines.push('# HELP vrwx_idempotency_pending Pending idempotency records');
    lines.push('# TYPE vrwx_idempotency_pending gauge');
    lines.push(`vrwx_idempotency_pending ${idempotencyStats?.pending || 0}`);

    lines.push('');
    lines.push('# HELP vrwx_idempotency_completed Completed idempotency records');
    lines.push('# TYPE vrwx_idempotency_completed gauge');
    lines.push(`vrwx_idempotency_completed ${idempotencyStats?.completed || 0}`);

    lines.push('');
    lines.push('# HELP vrwx_idempotency_failed Failed idempotency records');
    lines.push('# TYPE vrwx_idempotency_failed gauge');
    lines.push(`vrwx_idempotency_failed ${idempotencyStats?.failed || 0}`);

    // =========================================
    // M4.2: Transaction metrics
    // =========================================

    lines.push('');
    lines.push('# HELP vrwx_tx_broadcast_total Total transactions broadcast');
    lines.push('# TYPE vrwx_tx_broadcast_total counter');
    lines.push(`vrwx_tx_broadcast_total ${metrics.tx.broadcastTotal}`);

    lines.push('');
    lines.push('# HELP vrwx_tx_success_total Successful transactions');
    lines.push('# TYPE vrwx_tx_success_total counter');
    lines.push(`vrwx_tx_success_total ${metrics.tx.successTotal}`);

    lines.push('');
    lines.push('# HELP vrwx_tx_fail_total Failed transactions');
    lines.push('# TYPE vrwx_tx_fail_total counter');
    lines.push(`vrwx_tx_fail_total ${metrics.tx.failTotal}`);

    reply.type('text/plain').send(lines.join('\n'));
  });

  // Update metrics (internal endpoint for testing)
  fastify.post('/update', async (request, reply) => {
    const updates = request.body as Partial<Metrics>;

    if (updates.jobs) {
      Object.assign(metrics.jobs, updates.jobs);
    }
    if (updates.offers) {
      Object.assign(metrics.offers, updates.offers);
    }
    if (updates.vrwx) {
      Object.assign(metrics.vrwx, updates.vrwx);
    }
    if (updates.volume) {
      Object.assign(metrics.volume, updates.volume);
    }
    if (updates.disputes) {
      Object.assign(metrics.disputes, updates.disputes);
    }
    if (updates.fillRate !== undefined) {
      metrics.fillRate = updates.fillRate;
    }

    return { status: 'updated', metrics };
  });

  // Increment job count
  fastify.post('/jobs/:status', async (request, reply) => {
    const { status } = request.params as { status: string };
    const validStatuses = ['created', 'funded', 'completed', 'settled', 'disputed', 'refunded'];

    if (!validStatuses.includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' });
    }

    metrics.jobs.total++;
    metrics.jobs.byStatus[status as keyof typeof metrics.jobs.byStatus]++;

    return { status: 'incremented', current: metrics.jobs.byStatus };
  });

  // DLQ stats endpoint
  fastify.get('/dlq', async () => {
    try {
      return getDLQStats();
    } catch {
      return { error: 'DLQ not available (database not initialized)' };
    }
  });

  // Idempotency stats endpoint
  fastify.get('/idempotency', async () => {
    try {
      return getIdempotencyStats();
    } catch {
      return { error: 'Idempotency not available (database not initialized)' };
    }
  });
};
