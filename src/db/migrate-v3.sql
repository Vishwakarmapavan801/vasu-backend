-- ================================================================
-- VASU REALTY - v3 Schema Migration
-- Agent Profiles, Reviews, Property History, Recently Viewed, Comparisons
-- ================================================================
-- Run: node src/db/run-migration-v3.js
-- ================================================================

-- ================================================================
-- 1. agent_profiles - Extended agent profile data
-- Complements MLS member data with additional profile information
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mls_member_id   VARCHAR(255) UNIQUE,          -- Maps to MLS MemberMlsId
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(50),
    photo_url       TEXT,
    role            VARCHAR(255),                  -- e.g. "Listing Agent", "Buyer's Agent"
    brokerage       VARCHAR(255),
    brokerage_mls_id VARCHAR(255),
    license_number  VARCHAR(100),
    experience_years INTEGER,
    about           TEXT,
    certifications  TEXT[],                        -- Array of certification names
    languages       TEXT[],                        -- Array of languages spoken
    areas_served    TEXT[],                        -- Array of areas/cities
    response_time   VARCHAR(100),                  -- e.g. "Within 24 hours"
    response_rate   NUMERIC(5,2),                  -- e.g. 98.50
    social_links    JSONB DEFAULT '{}'::jsonb,     -- {linkedin, facebook, twitter, instagram, youtube}
    office_name     VARCHAR(255),
    office_address  TEXT,
    office_phone    VARCHAR(50),
    office_email    VARCHAR(255),
    office_hours    JSONB DEFAULT '{}'::jsonb,     -- {monday: "9-5", tuesday: "9-5", ...}
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    status          VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_mls_member_id ON agent_profiles(mls_member_id);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_user_id ON agent_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_name ON agent_profiles(name);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_brokerage ON agent_profiles(brokerage);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_is_active ON agent_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_areas_served ON agent_profiles USING GIN(areas_served);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_certifications ON agent_profiles USING GIN(certifications);

-- ================================================================
-- 2. agent_reviews - Client reviews and ratings for agents
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewer_name   VARCHAR(255) NOT NULL,
    reviewer_email  VARCHAR(255),
    rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title           VARCHAR(255),
    review          TEXT NOT NULL,
    verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
    is_approved     BOOLEAN NOT NULL DEFAULT FALSE,
    helpful_count   INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_reviews_agent_id ON agent_reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_rating ON agent_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_status ON agent_reviews(status);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_is_approved ON agent_reviews(is_approved);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_created_at ON agent_reviews(created_at DESC);

-- ================================================================
-- 3. property_history - Track listing changes over time
-- ================================================================
CREATE TABLE IF NOT EXISTS property_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key     VARCHAR(255) NOT NULL,
    listing_id      VARCHAR(255),
    event_type      VARCHAR(50) NOT NULL,          -- price_change, status_change, listed, sold, expired
    previous_value  VARCHAR(255),
    new_value       VARCHAR(255),
    change_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description     TEXT,
    source          VARCHAR(50) DEFAULT 'mls',      -- mls, system, agent
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_history_listing_key ON property_history(listing_key);
CREATE INDEX IF NOT EXISTS idx_property_history_listing_id ON property_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_property_history_event_type ON property_history(event_type);
CREATE INDEX IF NOT EXISTS idx_property_history_change_date ON property_history(change_date DESC);

-- ================================================================
-- 4. recently_viewed - Track user's property viewing history
-- ================================================================
CREATE TABLE IF NOT EXISTS recently_viewed (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_key     VARCHAR(255) NOT NULL,
    listing_id      VARCHAR(255),
    property_data   JSONB,                        -- Cached property snapshot
    viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, listing_key)
);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_id ON recently_viewed(user_id);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_listing_key ON recently_viewed(listing_key);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_viewed_at ON recently_viewed(viewed_at DESC);

-- ================================================================
-- 5. property_comparisons - User's property comparison lists
-- ================================================================
CREATE TABLE IF NOT EXISTS property_comparisons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) DEFAULT 'My Comparison',
    listings        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of {listingKey, listingId, snapshot}
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_comparisons_user_id ON property_comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_property_comparisons_created_at ON property_comparisons(created_at DESC);

-- ================================================================
-- Triggers for updated_at columns
-- ================================================================
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'agent_profiles',
        'agent_reviews',
        'property_comparisons'
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
-- Verify tables
-- ================================================================
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'agent_profiles',
    'agent_reviews',
    'property_history',
    'recently_viewed',
    'property_comparisons'
)
ORDER BY table_name;
