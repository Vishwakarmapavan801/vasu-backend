-- ================================================================
-- VASU REALTY - Agent Dashboard Schema Migration (v7)
-- ================================================================
-- Run: node src/db/run-migration-v7.js
-- Adds tables for agent listing management, analytics, review responses
-- ================================================================

-- ================================================================
-- 1. agent_listing_meta - Local metadata linked to MLS listings
-- Each row links an MLS listing (by ListingKey/ListingId) to an agent
-- with local-only data (notes, local status, custom pricing, etc.)
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_listing_meta (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255) NOT NULL,
    listing_id        VARCHAR(255),
    mls_status        VARCHAR(100),
    local_status      VARCHAR(50) DEFAULT 'active',
    local_price       NUMERIC(12,2),
    notes             TEXT,
    featured          BOOLEAN NOT NULL DEFAULT FALSE,
    open_house_date   TIMESTAMPTZ,
    open_house_start  VARCHAR(50),
    open_house_end    VARCHAR(50),
    custom_title      VARCHAR(500),
    custom_description TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, listing_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_listing_meta_agent_id ON agent_listing_meta(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_listing_meta_listing_key ON agent_listing_meta(listing_key);
CREATE INDEX IF NOT EXISTS idx_agent_listing_meta_local_status ON agent_listing_meta(local_status);
CREATE INDEX IF NOT EXISTS idx_agent_listing_meta_featured ON agent_listing_meta(featured);

-- ================================================================
-- 2. agent_listing_views - Per-listing view tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_listing_views (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255) NOT NULL,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address        VARCHAR(45),
    viewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_listing_views_agent_id ON agent_listing_views(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_listing_views_listing_key ON agent_listing_views(listing_key);
CREATE INDEX IF NOT EXISTS idx_agent_listing_views_viewed_at ON agent_listing_views(viewed_at DESC);

-- ================================================================
-- 3. agent_listing_inquiries - Inquiries on agent listings
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_listing_inquiries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255) NOT NULL,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50),
    message           TEXT,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_listing_inquiries_agent_id ON agent_listing_inquiries(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_listing_inquiries_listing_key ON agent_listing_inquiries(listing_key);
CREATE INDEX IF NOT EXISTS idx_agent_listing_inquiries_status ON agent_listing_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_agent_listing_inquiries_created_at ON agent_listing_inquiries(created_at DESC);

-- ================================================================
-- 4. agent_review_responses - Agent responses to reviews
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_review_responses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id         UUID NOT NULL REFERENCES agent_reviews(id) ON DELETE CASCADE,
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    response          TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(review_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_review_responses_review_id ON agent_review_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_agent_review_responses_agent_id ON agent_review_responses(agent_id);

-- ================================================================
-- 5. agent_activity_log - Agent activity tracking for dashboard
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_activity_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    activity_type     VARCHAR(100) NOT NULL,
    description       TEXT,
    listing_key       VARCHAR(255),
    metadata          JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_log_agent_id ON agent_activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_log_type ON agent_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_agent_activity_log_created_at ON agent_activity_log(created_at DESC);

-- ================================================================
-- Triggers for updated_at
-- ================================================================
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'agent_listing_meta',
        'agent_listing_inquiries',
        'agent_review_responses'
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

-- ================================================================
-- Add cover_photo_url to agents table
-- ================================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

-- ================================================================
-- Verify tables
-- ================================================================
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'agent_listing_meta',
    'agent_listing_views',
    'agent_listing_inquiries',
    'agent_review_responses',
    'agent_activity_log'
)
ORDER BY table_name;
