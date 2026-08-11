-- ================================================================
-- VASU REALTY - Production Platform Expansion (v10)
-- ================================================================
-- Phases:
--   1. Consumer Lead Capture & Conversion
--   2. Lead Attribution Engine
--   3. Saved Search Alerts (production)
--   4. MLS-Driven Social Feed
--   5. Feed Ranking Algorithm
--   6. Agent Growth System
--   7. Realtor CRM (pipelines, tasks, notes)
--   8. Transaction Management
--   9. AI Layer
--  10. Local Intelligence (HOA, flood zones, schools)
--  11. Performance Analytics
--  12. Monetization
-- ================================================================

-- ================================================================
-- PHASE 1 — Consumer Lead Capture & Conversion
-- ================================================================

-- 1a. property_inquiries — structured request info submissions
-- Table may already exist from earlier schema; extend it with new columns
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(50) DEFAULT 'email';
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS buyer_type VARCHAR(50);
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS financing_status VARCHAR(50);
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS timeline VARCHAR(100);
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'property_page';
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS campaign VARCHAR(255);
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS referring_post_id UUID;
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(200);
ALTER TABLE property_inquiries ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_property_inquiries_listing ON property_inquiries(listing_key);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_agent ON property_inquiries(agent_id);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_user ON property_inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_created ON property_inquiries(created_at DESC);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='property_inquiries' AND column_name='source') THEN CREATE INDEX IF NOT EXISTS idx_property_inquiries_source ON property_inquiries(source); END IF; END $$;

-- 1b. tour_schedules — professional tour scheduling (NEW table)
CREATE TABLE IF NOT EXISTS tour_schedules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL,
    agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50),
    tour_type         VARCHAR(50) NOT NULL DEFAULT 'in_person',
    tour_date         DATE NOT NULL,
    tour_time         TIME NOT NULL,
    timezone          VARCHAR(50) DEFAULT 'America/New_York',
    duration_minutes  INTEGER DEFAULT 30,
    guests_count      INTEGER DEFAULT 1,
    notes             TEXT,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_sent     BOOLEAN NOT NULL DEFAULT FALSE,
    rescheduled_from  UUID,
    cancelled_at      TIMESTAMPTZ,
    source            VARCHAR(100) DEFAULT 'property_page',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_schedules_agent ON tour_schedules(agent_id);
CREATE INDEX IF NOT EXISTS idx_tour_schedules_user ON tour_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_tour_schedules_listing ON tour_schedules(listing_key);
CREATE INDEX IF NOT EXISTS idx_tour_schedules_date ON tour_schedules(tour_date);
CREATE INDEX IF NOT EXISTS idx_tour_schedules_status ON tour_schedules(status);

-- 1c. offer_inquiries — structured offer submissions (NEW table)
CREATE TABLE IF NOT EXISTS offer_inquiries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL,
    agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50),
    desired_price     DECIMAL(14,2) NOT NULL,
    financing_type    VARCHAR(50) NOT NULL DEFAULT 'loan',
    down_payment      DECIMAL(14,2),
    down_payment_pct  DECIMAL(5,2),
    contingencies     TEXT[] DEFAULT '{}',
    inspection_needed BOOLEAN NOT NULL DEFAULT TRUE,
    closing_timeline  VARCHAR(100),
    pre_approved      BOOLEAN DEFAULT FALSE,
    lender_name       VARCHAR(255),
    message           TEXT,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_inquiries_listing ON offer_inquiries(listing_key);
CREATE INDEX IF NOT EXISTS idx_offer_inquiries_agent ON offer_inquiries(agent_id);
CREATE INDEX IF NOT EXISTS idx_offer_inquiries_user ON offer_inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_offer_inquiries_status ON offer_inquiries(status);

-- ================================================================
-- PHASE 2 — Lead Attribution Engine
-- ================================================================

-- 2a. lead_attribution — track all lead touchpoints (NEW table)
CREATE TABLE IF NOT EXISTS lead_attribution (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id           UUID NOT NULL REFERENCES agent_leads(id) ON DELETE CASCADE,
    touchpoint_type   VARCHAR(50) NOT NULL,
    source            VARCHAR(100) NOT NULL,
    source_detail     VARCHAR(500),
    listing_key       VARCHAR(255),
    agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id        VARCHAR(255),
    referrer_url      TEXT,
    campaign          VARCHAR(255),
    touch_order       INTEGER NOT NULL DEFAULT 1,
    is_first_touch    BOOLEAN NOT NULL DEFAULT FALSE,
    is_last_touch     BOOLEAN NOT NULL DEFAULT FALSE,
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_lead ON lead_attribution(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_source ON lead_attribution(source);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_touchpoint ON lead_attribution(touchpoint_type);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_first ON lead_attribution(is_first_touch);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_last ON lead_attribution(is_last_touch);

-- ================================================================
-- PHASE 7 — Transaction Management
-- ================================================================

-- 7a. transactions — closing workflow (NEW table)
CREATE TABLE IF NOT EXISTS transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id           UUID REFERENCES agent_leads(id) ON DELETE SET NULL,
    listing_key       VARCHAR(255),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    buyer_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    seller_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    transaction_type  VARCHAR(50) NOT NULL DEFAULT 'buy',
    offer_price       DECIMAL(14,2),
    accepted_price    DECIMAL(14,2),
    commission        DECIMAL(14,2),
    commission_pct    DECIMAL(5,2),
    status            VARCHAR(50) NOT NULL DEFAULT 'offer',
    earnest_money     DECIMAL(14,2),
    earnest_money_due DATE,
    inspection_date   DATE,
    inspection_passed BOOLEAN,
    appraisal_date    DATE,
    appraisal_value   DECIMAL(14,2),
    financing_type    VARCHAR(100),
    loan_amount       DECIMAL(14,2),
    loan_approved     BOOLEAN,
    title_company     VARCHAR(255),
    escrow_company    VARCHAR(255),
    closing_date      DATE,
    possession_date   DATE,
    closing_costs     DECIMAL(14,2),
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_agent ON transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_lead ON transactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_transactions_listing ON transactions(listing_key);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_closing ON transactions(closing_date);

-- 7b. transaction_milestones — milestone tracking (NEW table)
CREATE TABLE IF NOT EXISTS transaction_milestones (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id    UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    milestone_type    VARCHAR(100) NOT NULL,
    title             VARCHAR(500) NOT NULL,
    description       TEXT,
    due_date          DATE,
    completed_at      TIMESTAMPTZ,
    is_automated      BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_sent     BOOLEAN NOT NULL DEFAULT FALSE,
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_milestones_tx ON transaction_milestones(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_milestones_type ON transaction_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_transaction_milestones_due ON transaction_milestones(due_date);

-- 7c. transaction_documents — document uploads (NEW table)
CREATE TABLE IF NOT EXISTS transaction_documents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id    UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    document_type     VARCHAR(100) NOT NULL,
    title             VARCHAR(500) NOT NULL,
    file_url          TEXT NOT NULL,
    file_size         INTEGER,
    mime_type         VARCHAR(100),
    uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_documents_tx ON transaction_documents(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_documents_type ON transaction_documents(document_type);

-- ================================================================
-- PHASE 6 — Agent Growth System
-- ================================================================

-- 6a. suggested_agents — pre-computed agent recommendations (NEW table)
CREATE TABLE IF NOT EXISTS suggested_agents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    score             DECIMAL(5,2) NOT NULL DEFAULT 0,
    reason            VARCHAR(500),
    is_dismissed      BOOLEAN NOT NULL DEFAULT FALSE,
    clicked_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggested_agents_user ON suggested_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_suggested_agents_score ON suggested_agents(score DESC);

-- 6b. suggested_listings — pre-computed listing recommendations (NEW table)
CREATE TABLE IF NOT EXISTS suggested_listings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255) NOT NULL,
    score             DECIMAL(5,2) NOT NULL DEFAULT 0,
    reason            VARCHAR(500),
    is_dismissed      BOOLEAN NOT NULL DEFAULT FALSE,
    clicked_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggested_listings_user ON suggested_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_suggested_listings_score ON suggested_listings(score DESC);

-- ================================================================
-- PHASE 8 — AI Layer
-- ================================================================

-- 9a. ai_investment_scores — per-property investment analysis (NEW table)
CREATE TABLE IF NOT EXISTS ai_investment_scores (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL UNIQUE,
    investment_score  DECIMAL(5,2),
    appreciation_pot  DECIMAL(5,2),
    rental_yield_est  DECIMAL(5,2),
    cash_flow_est     DECIMAL(10,2),
    neighborhood_health DECIMAL(5,2),
    school_quality    DECIMAL(3,1),
    commute_value     DECIMAL(5,2),
    inventory_trend   VARCHAR(50),
    risk_level        VARCHAR(50),
    summary           TEXT,
    last_computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_investment_scores_listing ON ai_investment_scores(listing_key);
CREATE INDEX IF NOT EXISTS idx_ai_investment_scores_score ON ai_investment_scores(investment_score DESC);

-- 9b. ai_rental_estimates — rental estimates per property (NEW table)
CREATE TABLE IF NOT EXISTS ai_rental_estimates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL UNIQUE,
    estimated_rent    DECIMAL(10,2),
    rent_low          DECIMAL(10,2),
    rent_high         DECIMAL(10,2),
    rent_per_sqft     DECIMAL(5,2),
    cap_rate          DECIMAL(5,2),
    cash_on_cash      DECIMAL(5,2),
    confidence        DECIMAL(5,2),
    comparable_rentals JSONB DEFAULT '{}',
    last_computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_rental_estimates_listing ON ai_rental_estimates(listing_key);

-- ================================================================
-- PHASE 10 — Local Intelligence
-- ================================================================

-- 10a. local_intel — neighborhood-level intelligence data (NEW table)
CREATE TABLE IF NOT EXISTS local_intel (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_type     VARCHAR(50) NOT NULL DEFAULT 'neighborhood',
    location_id       UUID,
    location_name     VARCHAR(255) NOT NULL,
    hoa_info          JSONB DEFAULT '{}',
    flood_zone        VARCHAR(50),
    flood_risk        VARCHAR(50),
    school_boundaries JSONB DEFAULT '{}',
    subdivision       VARCHAR(255),
    builder_community VARCHAR(255),
    utility_providers JSONB DEFAULT '{}',
    zoning            VARCHAR(255),
    short_term_rental_allowed BOOLEAN,
    property_tax_rate DECIMAL(6,4),
    tax_history       JSONB DEFAULT '{}',
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(location_type, location_name)
);

CREATE INDEX IF NOT EXISTS idx_local_intel_location ON local_intel(location_type, location_name);
CREATE INDEX IF NOT EXISTS idx_local_intel_subdivision ON local_intel(subdivision);

-- 10b. local_intel_map — geospatial intel mapping (NEW table)
CREATE TABLE IF NOT EXISTS local_intel_map (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL,
    intel_type        VARCHAR(50) NOT NULL,
    intel_value       JSONB NOT NULL DEFAULT '{}',
    source            VARCHAR(100),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_intel_map_listing ON local_intel_map(listing_key);
CREATE INDEX IF NOT EXISTS idx_local_intel_map_type ON local_intel_map(intel_type);

-- ================================================================
-- PHASE 11 — Performance Analytics (enhanced)
-- ================================================================

-- 11a. analytics_daily — daily pre-aggregated analytics (NEW table)
CREATE TABLE IF NOT EXISTS analytics_daily (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date              DATE NOT NULL,
    agent_id          UUID REFERENCES agents(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255),
    event_type        VARCHAR(50) NOT NULL,
    count             INTEGER NOT NULL DEFAULT 0,
    unique_users      INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(date, agent_id, listing_key, event_type)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_agent ON analytics_daily(agent_id);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_listing ON analytics_daily(listing_key);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_event ON analytics_daily(event_type);

-- ================================================================
-- PHASE 12 — Monetization
-- ================================================================

-- 12a. featured_listings — promoted/featured listings (NEW table)
CREATE TABLE IF NOT EXISTS featured_listings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL UNIQUE,
    agent_id          UUID REFERENCES agents(id) ON DELETE CASCADE,
    plan_type         VARCHAR(50) NOT NULL DEFAULT 'basic',
    starts_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at           TIMESTAMPTZ,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    priority          INTEGER NOT NULL DEFAULT 0,
    impressions       INTEGER DEFAULT 0,
    clicks            INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_featured_listings_active ON featured_listings(is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_featured_listings_agent ON featured_listings(agent_id);

-- 12b. featured_agents — promoted agent profiles (NEW table)
CREATE TABLE IF NOT EXISTS featured_agents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    plan_type         VARCHAR(50) NOT NULL DEFAULT 'basic',
    starts_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at           TIMESTAMPTZ,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    priority          INTEGER NOT NULL DEFAULT 0,
    impressions       INTEGER DEFAULT 0,
    clicks            INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_featured_agents_active ON featured_agents(is_active, priority DESC);

-- 12c. subscription_plans — subscription tiers (NEW table)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(100) NOT NULL UNIQUE,
    plan_type         VARCHAR(50) NOT NULL DEFAULT 'agent',
    price_monthly     DECIMAL(10,2) NOT NULL,
    price_yearly      DECIMAL(10,2),
    features          JSONB DEFAULT '{}',
    limits            JSONB DEFAULT '{}',
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12d. agent_subscriptions — agent subscription assignments (NEW table)
CREATE TABLE IF NOT EXISTS agent_subscriptions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    plan_id           UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    billing_cycle     VARCHAR(50) NOT NULL DEFAULT 'monthly',
    status            VARCHAR(50) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ,
    canceled_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_agent ON agent_subscriptions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_status ON agent_subscriptions(status);

-- ================================================================
-- Extend existing tables
-- ================================================================

-- Extend agent_leads with pipeline fields
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS pipeline_type VARCHAR(50) DEFAULT 'buyer';
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) DEFAULT 'new';
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS pipeline_entered_at TIMESTAMPTZ;
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS attribution_source VARCHAR(100);
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS attribution_campaign VARCHAR(255);
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS attribution_first_touch VARCHAR(500);
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS attribution_last_touch VARCHAR(500);

-- Extend lead_tasks for enhanced CRM
ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS recurring_interval VARCHAR(50);
ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS calendar_event_id VARCHAR(255);

-- Extend lead_notes for rich content
ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}';
ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS call_log JSONB DEFAULT '{}';
ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS email_log JSONB DEFAULT '{}';

-- Extend saved_searches for enhanced alerts
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS alert_on_new BOOLEAN DEFAULT TRUE;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS alert_on_price_change BOOLEAN DEFAULT TRUE;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS alert_on_status_change BOOLEAN DEFAULT TRUE;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS alert_on_open_house BOOLEAN DEFAULT FALSE;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT FALSE;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT FALSE;

-- Extend analytics_events for richer attribution
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS campaign VARCHAR(255);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS source_detail VARCHAR(500);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS device_type VARCHAR(50);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,7);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS location_lng DECIMAL(10,7);

-- ================================================================
-- Enhanced feed ranking support
-- ================================================================

-- feed_scores — pre-computed feed ranking scores (NEW table)
CREATE TABLE IF NOT EXISTS feed_scores (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    score             DECIMAL(12,4) NOT NULL DEFAULT 0,
    recency_score     DECIMAL(5,2) DEFAULT 0,
    engagement_score  DECIMAL(5,2) DEFAULT 0,
    relevance_score   DECIMAL(5,2) DEFAULT 0,
    agent_score       DECIMAL(5,2) DEFAULT 0,
    signals           JSONB DEFAULT '{}',
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_scores_post ON feed_scores(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_scores_score ON feed_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_feed_scores_computed ON feed_scores(computed_at);

-- ================================================================
-- Triggers for updated_at
-- ================================================================
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'tour_schedules', 'offer_inquiries',
        'transactions', 'transaction_milestones',
        'featured_listings', 'featured_agents',
        'subscription_plans', 'agent_subscriptions',
        'local_intel'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        BEGIN
            EXECUTE format(
                'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
                t, t
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END LOOP;
END;
$$;
