/**
 * Stripe Payment Routes
 * M4.7: Card payment integration via Stripe Checkout
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { config } from '../config.js';
import { execute, queryOne } from '../db/index.js';
import { randomBytes } from 'crypto';

// Initialize Stripe
const stripe = new Stripe(config.STRIPE_SECRET_KEY);

// Service prices (in cents)
const SERVICE_PRICES: Record<string, { base: number; label: string }> = {
  inspection: { base: 10000, label: 'Facility Inspection' }, // $100
  security_patrol: { base: 15000, label: 'Security Patrol' }, // $150
  delivery: { base: 20000, label: 'Autonomous Delivery' }, // $200
};

// Quality multipliers
const QUALITY_MULT: Record<string, number> = {
  standard: 1.0,
  premium: 1.15,
  elite: 1.30,
};

// Subscription Plans (M4.7)
const SUBSCRIPTION_PLANS: Record<string, {
  name: string;
  priceMonthly: number; // in cents
  robots: number;
  completionsPerMonth: number;
  features: string[];
}> = {
  launch: {
    name: 'Launch',
    priceMonthly: 0, // Free
    robots: 3,
    completionsPerMonth: 5000,
    features: ['1 tenant', 'Webhook + Feed + Verify', 'Relay included'],
  },
  fleet: {
    name: 'Fleet',
    priceMonthly: 49900, // $499
    robots: 25,
    completionsPerMonth: 100000,
    features: ['Priority relayer', 'Email support', 'Basic exports'],
  },
  network: {
    name: 'Network',
    priceMonthly: 499900, // $4,999
    robots: 250,
    completionsPerMonth: 1000000,
    features: ['Dedicated relayer', 'SLA guarantee', 'Compliance exports'],
  },
};

interface CreateCheckoutBody {
  serviceType: string;
  units: number;
  qualityTier: 'standard' | 'premium' | 'elite';
  location?: string;
  email?: string;
}

interface PaymentRecord {
  [key: string]: unknown;
  id: string;
  stripe_session_id: string;
  service_type: string;
  units: number;
  quality_tier: string;
  amount_cents: number;
  status: string;
  email: string | null;
  location: string | null;
  created_at: number;
  completed_at: number | null;
}

export default async function stripeRoutes(fastify: FastifyInstance) {
  /**
   * POST /v1/payments/checkout
   * Create a Stripe Checkout session for service payment
   */
  fastify.post<{ Body: CreateCheckoutBody }>(
    '/checkout',
    async (request: FastifyRequest<{ Body: CreateCheckoutBody }>, reply: FastifyReply) => {
      const { serviceType, units, qualityTier, location, email } = request.body;

      // Validate service type
      const service = SERVICE_PRICES[serviceType];
      if (!service) {
        return reply.status(400).send({
          error: 'Invalid service type',
          validTypes: Object.keys(SERVICE_PRICES),
        });
      }

      // Validate quality tier
      const qMult = QUALITY_MULT[qualityTier];
      if (!qMult) {
        return reply.status(400).send({
          error: 'Invalid quality tier',
          validTiers: Object.keys(QUALITY_MULT),
        });
      }

      // Calculate amount
      const subtotal = service.base * units;
      const qualityAdj = Math.round(subtotal * (qMult - 1));
      const grossTotal = subtotal + qualityAdj;
      const platformFee = Math.round(grossTotal * 0.025); // 2.5%
      const totalAmount = grossTotal; // Customer pays gross, we take fee

      // Create payment record
      const paymentId = randomBytes(16).toString('hex');
      const now = Date.now();

      try {
        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `${service.label} - ${qualityTier.toUpperCase()}`,
                  description: `${units} unit(s) × $${(service.base / 100).toFixed(2)}/unit`,
                  metadata: {
                    serviceType,
                    units: units.toString(),
                    qualityTier,
                  },
                },
                unit_amount: totalAmount,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${config.FRONTEND_URL}/#/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${config.FRONTEND_URL}/#/quote`,
          customer_email: email,
          metadata: {
            paymentId,
            serviceType,
            units: units.toString(),
            qualityTier,
            location: location || '',
          },
        });

        // Store payment record
        execute(
          `INSERT INTO payments (id, stripe_session_id, service_type, units, quality_tier, amount_cents, status, email, location, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [paymentId, session.id, serviceType, units, qualityTier, totalAmount, 'pending', email || null, location || null, now]
        );

        return {
          checkoutUrl: session.url,
          sessionId: session.id,
          paymentId,
          amount: {
            subtotal: subtotal / 100,
            qualityAdj: qualityAdj / 100,
            grossTotal: grossTotal / 100,
            platformFee: platformFee / 100,
            total: totalAmount / 100,
          },
        };
      } catch (err: any) {
        console.error('[STRIPE] Checkout session creation failed:', err);
        return reply.status(500).send({
          error: 'Payment session creation failed',
          message: err.message,
        });
      }
    }
  );

  /**
   * GET /v1/payments/session/:sessionId
   * Check payment status by session ID
   */
  fastify.get<{ Params: { sessionId: string } }>(
    '/session/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const payment = queryOne<PaymentRecord>(
          'SELECT * FROM payments WHERE stripe_session_id = ?',
          [sessionId]
        );

        return {
          status: session.payment_status,
          amountTotal: session.amount_total ? session.amount_total / 100 : null,
          customerEmail: session.customer_email,
          payment: payment ? {
            id: payment.id,
            serviceType: payment.service_type,
            units: payment.units,
            qualityTier: payment.quality_tier,
            status: payment.status,
          } : null,
        };
      } catch (err: any) {
        return reply.status(404).send({
          error: 'Session not found',
          message: err.message,
        });
      }
    }
  );

  /**
   * POST /v1/payments/webhook
   * Stripe webhook handler for payment events
   */
  fastify.post(
    '/webhook',
    {
      config: {
        rawBody: true, // Need raw body for signature verification
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['stripe-signature'] as string;
      const rawBody = (request as any).rawBody;

      // If no webhook secret configured, skip signature verification (dev mode)
      let event: Stripe.Event;

      if (config.STRIPE_WEBHOOK_SECRET && sig) {
        try {
          event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET);
        } catch (err: any) {
          console.error('[STRIPE] Webhook signature verification failed:', err.message);
          return reply.status(400).send({ error: 'Invalid signature' });
        }
      } else {
        // Dev mode - parse without verification
        event = JSON.parse(rawBody || JSON.stringify(request.body));
      }

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const paymentId = session.metadata?.paymentId;

          if (paymentId) {
            execute(
              'UPDATE payments SET status = ?, completed_at = ? WHERE id = ?',
              ['completed', Date.now(), paymentId]
            );
            console.log(`[STRIPE] Payment ${paymentId} completed`);
          }
          break;
        }

        case 'checkout.session.expired': {
          const session = event.data.object as Stripe.Checkout.Session;
          const paymentId = session.metadata?.paymentId;

          if (paymentId) {
            execute(
              'UPDATE payments SET status = ? WHERE id = ?',
              ['expired', paymentId]
            );
            console.log(`[STRIPE] Payment ${paymentId} expired`);
          }
          break;
        }

        // Subscription events
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const tenantId = subscription.metadata?.tenantId;
          const plan = subscription.metadata?.plan || 'fleet';
          const planData = SUBSCRIPTION_PLANS[plan];

          if (tenantId && planData) {
            execute(
              `UPDATE tenants SET
                plan = ?,
                stripe_customer_id = ?,
                stripe_subscription_id = ?,
                plan_robots_limit = ?,
                plan_completions_limit = ?,
                plan_updated_at = ?
               WHERE id = ?`,
              [plan, customerId, subscription.id, planData.robots, planData.completionsPerMonth, Date.now(), tenantId]
            );
            console.log(`[STRIPE] Tenant ${tenantId} subscribed to ${plan} plan`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const tenantId = subscription.metadata?.tenantId;

          if (tenantId) {
            // Downgrade to launch plan
            const launchPlan = SUBSCRIPTION_PLANS['launch'];
            execute(
              `UPDATE tenants SET
                plan = 'launch',
                stripe_subscription_id = NULL,
                plan_robots_limit = ?,
                plan_completions_limit = ?,
                plan_updated_at = ?
               WHERE id = ?`,
              [launchPlan.robots, launchPlan.completionsPerMonth, Date.now(), tenantId]
            );
            console.log(`[STRIPE] Tenant ${tenantId} subscription cancelled, downgraded to launch`);
          }
          break;
        }

        default:
          console.log(`[STRIPE] Unhandled event type: ${event.type}`);
      }

      return { received: true };
    }
  );

  /**
   * GET /v1/payments/:paymentId
   * Get payment details by ID
   */
  fastify.get<{ Params: { paymentId: string } }>(
    '/:paymentId',
    async (request: FastifyRequest<{ Params: { paymentId: string } }>, reply: FastifyReply) => {
      const { paymentId } = request.params;

      const payment = queryOne<PaymentRecord>(
        'SELECT * FROM payments WHERE id = ?',
        [paymentId]
      );

      if (!payment) {
        return reply.status(404).send({ error: 'Payment not found' });
      }

      return {
        id: payment.id,
        serviceType: payment.service_type,
        units: payment.units,
        qualityTier: payment.quality_tier,
        amount: payment.amount_cents / 100,
        status: payment.status,
        email: payment.email,
        location: payment.location,
        createdAt: payment.created_at,
        completedAt: payment.completed_at,
      };
    }
  );

  /**
   * GET /v1/payments/plans
   * List available subscription plans
   */
  fastify.get('/plans', async () => {
    return {
      plans: Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
        id,
        name: plan.name,
        priceMonthly: plan.priceMonthly / 100,
        robots: plan.robots,
        completionsPerMonth: plan.completionsPerMonth,
        features: plan.features,
      })),
    };
  });

  /**
   * POST /v1/payments/subscribe
   * Create a Stripe Checkout session for subscription
   */
  fastify.post<{ Body: { plan: string; tenantId?: string; email?: string } }>(
    '/subscribe',
    async (request: FastifyRequest<{ Body: { plan: string; tenantId?: string; email?: string } }>, reply: FastifyReply) => {
      const { plan, tenantId, email } = request.body;

      // Validate plan
      const planData = SUBSCRIPTION_PLANS[plan];
      if (!planData) {
        return reply.status(400).send({
          error: 'Invalid plan',
          validPlans: Object.keys(SUBSCRIPTION_PLANS),
        });
      }

      // Launch is free - no checkout needed
      if (plan === 'launch') {
        return {
          plan: 'launch',
          status: 'active',
          message: 'Launch plan is free. Connect your fleet to get started.',
          connectUrl: '/connect',
        };
      }

      try {
        // Create Stripe Checkout Session for subscription
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `VRWX ${planData.name} Plan`,
                  description: `Up to ${planData.robots} robots, ${(planData.completionsPerMonth / 1000)}k completions/mo`,
                },
                unit_amount: planData.priceMonthly,
                recurring: {
                  interval: 'month',
                },
              },
              quantity: 1,
            },
          ],
          mode: 'subscription',
          success_url: `${config.FRONTEND_URL}/#/payment/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
          cancel_url: `${config.FRONTEND_URL}/#/`,
          customer_email: email,
          metadata: {
            plan,
            tenantId: tenantId || '',
          },
        });

        return {
          checkoutUrl: session.url,
          sessionId: session.id,
          plan,
        };
      } catch (err: any) {
        console.error('[STRIPE] Subscription session creation failed:', err);
        return reply.status(500).send({
          error: 'Subscription session creation failed',
          message: err.message,
        });
      }
    }
  );

  /**
   * GET /v1/payments/subscription/:tenantId
   * Get subscription status for a tenant
   */
  fastify.get<{ Params: { tenantId: string } }>(
    '/subscription/:tenantId',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const { tenantId } = request.params;

      // Check tenant subscription status from DB
      const tenant = queryOne<{ plan: string; stripe_customer_id: string | null; stripe_subscription_id: string | null }>(
        'SELECT plan, stripe_customer_id, stripe_subscription_id FROM tenants WHERE id = ?',
        [tenantId]
      );

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const planData = SUBSCRIPTION_PLANS[tenant.plan || 'launch'];

      return {
        tenantId,
        plan: tenant.plan || 'launch',
        planDetails: planData ? {
          name: planData.name,
          robots: planData.robots,
          completionsPerMonth: planData.completionsPerMonth,
        } : null,
        hasStripeSubscription: !!tenant.stripe_subscription_id,
      };
    }
  );
}
