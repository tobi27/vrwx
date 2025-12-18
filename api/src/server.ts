import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { jobsRoutes } from './routes/jobs.js';
import { offersRoutes } from './routes/offers.js';
import { quoteRoutes } from './routes/quote.js';
import { metricsRoutes } from './routes/metrics.js';
import { servicesRoutes } from './routes/services.js';
import { webhookRoutes } from './routes/webhook.js';
import { manifestsRoutes } from './routes/manifests.js';
import { onboardRoutes } from './routes/onboard.js';
import { connectRoutes } from './routes/connect.js';
import { feedRoutes } from './routes/feed.js';
import stripeRoutes from './routes/stripe.js';
import { config, validateConfig } from './config.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { IdempotencyConflictError } from './middleware/idempotency.js';
import { apiKeyAuth } from './middleware/auth.js';
import { initRelayer, getRelayerAddress } from './services/relayer.js';

// ES module dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate configuration
validateConfig();

// Initialize database (runs migrations)
initDatabase();

// Initialize relayer (if in relay mode)
initRelayer();

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// CORS - allow all origins for API access
app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Idempotency-Key'],
  credentials: true,
});

// Static files for landing page
app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
  decorateReply: false,
});

// API Key auth hook for protected routes
app.addHook('preHandler', apiKeyAuth);

// Health check
app.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    strictMode: config.VRWX_STRICT_PROOF,
    storageRequired: config.VRWX_STORAGE_REQUIRED,
    schemaVersion: config.CURRENT_SCHEMA_VERSION,
    relayMode: config.RELAY_MODE,
    relayerAddress: getRelayerAddress(),
    chainId: config.DEFAULT_CHAIN_ID,
  };
});

// Register routes
app.register(jobsRoutes, { prefix: '/jobs' });
app.register(offersRoutes, { prefix: '/offers' });
app.register(quoteRoutes, { prefix: '/quote' });
app.register(metricsRoutes, { prefix: '/metrics' });
app.register(servicesRoutes, { prefix: '/services' });
app.register(webhookRoutes, { prefix: '/connectors/webhook' });
app.register(manifestsRoutes, { prefix: '/manifests' });
app.register(onboardRoutes, { prefix: '/v1' });
app.register(connectRoutes, { prefix: '/connect' });
app.register(feedRoutes, { prefix: '/v1/feed' });
app.register(stripeRoutes, { prefix: '/v1/payments' });

// Error handler
app.setErrorHandler((error, request, reply) => {
  if (error instanceof IdempotencyConflictError) {
    return reply.status(202).send({
      status: 'pending',
      message: error.message,
      retryAfterMs: error.retryAfterMs,
    });
  }

  app.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: error.name,
    message: error.message,
    statusCode: error.statusCode || 500,
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n[SERVER] Shutting down...');
  await app.close();
  closeDatabase();
  console.log('[SERVER] Goodbye!');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
const start = async () => {
  try {
    const port = config.PORT;
    await app.listen({ port, host: '0.0.0.0' });
    console.log('\n===============================================================');
    console.log('  VRWX API v0.5.0 (M4.5) running on http://localhost:' + port);
    console.log('===============================================================');
    console.log('  Strict Mode: ' + (config.VRWX_STRICT_PROOF ? 'ENABLED' : 'disabled'));
    console.log('  Storage Required: ' + (config.VRWX_STORAGE_REQUIRED ? 'ENABLED' : 'disabled'));
    console.log('  Schema Version: ' + config.CURRENT_SCHEMA_VERSION);
    console.log('  Relay Mode: ' + config.RELAY_MODE.toUpperCase());
    if (config.RELAY_MODE === 'relay') {
      console.log('  Relayer: ' + (getRelayerAddress() || 'NOT CONFIGURED'));
    }
    console.log('  Chain ID: ' + config.DEFAULT_CHAIN_ID + ' (Base Mainnet)');
    console.log('  Landing: http://localhost:' + port + '/');
    console.log('  Connect: GET /connect/:token');
    console.log('  Feed: GET /v1/feed?tenant=<id>');
    console.log('===============================================================\n');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
