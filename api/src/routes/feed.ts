/**
 * Feed Routes
 * M4.5: Plug-and-Play Backend
 *
 * Live feed endpoint for job completions
 */

import { FastifyPluginAsync } from 'fastify';
import { query, queryOne } from '../db/index.js';
import { getTenant } from '../middleware/auth.js';

// ============================================================================
// Types
// ============================================================================

interface JobCompletionRecord {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  robot_id: string;
  job_id: number;
  service_type: string;
  manifest_hash: string;
  tx_hash: string | null;
  receipt_id: string | null;
  status: string;
  hash_match: number | null;
  quality_score: number | null;
  work_units: number | null;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// Routes
// ============================================================================

export const feedRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /v1/feed
   *
   * Get live feed of job completions for a tenant
   * Public endpoint - tenant ID required as query param
   */
  fastify.get<{
    Querystring: { tenant?: string; limit?: string; offset?: string };
  }>('/', async (request, reply) => {
    const { tenant: tenantId, limit: limitStr, offset: offsetStr } = request.query;

    if (!tenantId) {
      return reply.status(400).send({
        error: 'tenant query parameter required',
        code: 'MISSING_TENANT',
        example: '/v1/feed?tenant=<tenant_id>',
      });
    }

    // Verify tenant exists
    const tenant = getTenant(tenantId);
    if (!tenant) {
      return reply.status(404).send({
        error: 'Tenant not found',
        code: 'NOT_FOUND',
      });
    }

    // Parse pagination
    const limit = Math.min(parseInt(limitStr || '50'), 100);
    const offset = parseInt(offsetStr || '0');

    // Get job completions
    const jobs = query<JobCompletionRecord>(
      `SELECT * FROM job_completions
       WHERE tenant_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );

    // Get total count
    const countResult = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM job_completions WHERE tenant_id = ?',
      [tenantId]
    );

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
      jobs: jobs.map(j => ({
        jobId: j.job_id,
        robotId: j.robot_id,
        serviceType: j.service_type,
        manifestHash: j.manifest_hash,
        txHash: j.tx_hash,
        receiptId: j.receipt_id,
        status: j.status,
        hashMatch: j.hash_match === 1,
        qualityScore: j.quality_score,
        workUnits: j.work_units,
        timestamp: j.created_at,
        explorerUrl: j.tx_hash ? `https://basescan.org/tx/${j.tx_hash}` : null,
      })),
      pagination: {
        limit,
        offset,
        total: countResult?.count || 0,
        hasMore: offset + jobs.length < (countResult?.count || 0),
      },
    };
  });

  /**
   * GET /v1/feed/stats
   *
   * Get aggregate stats for a tenant
   */
  fastify.get<{
    Querystring: { tenant?: string };
  }>('/stats', async (request, reply) => {
    const { tenant: tenantId } = request.query;

    if (!tenantId) {
      return reply.status(400).send({
        error: 'tenant query parameter required',
        code: 'MISSING_TENANT',
      });
    }

    // Verify tenant exists
    const tenant = getTenant(tenantId);
    if (!tenant) {
      return reply.status(404).send({
        error: 'Tenant not found',
        code: 'NOT_FOUND',
      });
    }

    // Get stats
    const stats = queryOne<{
      total_jobs: number;
      completed_jobs: number;
      pending_jobs: number;
      failed_jobs: number;
      total_quality: number;
      total_work_units: number;
    }>(
      `SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
        SUM(quality_score) as total_quality,
        SUM(work_units) as total_work_units
       FROM job_completions
       WHERE tenant_id = ?`,
      [tenantId]
    );

    // Get service type breakdown
    const serviceBreakdown = query<{ service_type: string; count: number }>(
      `SELECT service_type, COUNT(*) as count
       FROM job_completions
       WHERE tenant_id = ?
       GROUP BY service_type`,
      [tenantId]
    );

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
      stats: {
        totalJobs: stats?.total_jobs || 0,
        completedJobs: stats?.completed_jobs || 0,
        pendingJobs: stats?.pending_jobs || 0,
        failedJobs: stats?.failed_jobs || 0,
        averageQuality: stats?.total_jobs ? Math.round((stats.total_quality || 0) / stats.total_jobs) : 0,
        totalWorkUnits: stats?.total_work_units || 0,
      },
      byServiceType: Object.fromEntries(
        serviceBreakdown.map(s => [s.service_type, s.count])
      ),
    };
  });
};
