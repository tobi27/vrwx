-- M4.7: Tenant subscription plans
ALTER TABLE tenants ADD COLUMN plan TEXT DEFAULT 'launch';
ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN plan_robots_limit INTEGER DEFAULT 3;
ALTER TABLE tenants ADD COLUMN plan_completions_limit INTEGER DEFAULT 5000;
ALTER TABLE tenants ADD COLUMN completions_this_month INTEGER DEFAULT 0;
ALTER TABLE tenants ADD COLUMN plan_updated_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants(stripe_customer_id);
