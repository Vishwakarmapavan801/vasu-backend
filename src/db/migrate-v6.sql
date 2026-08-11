-- ================================================================
-- VASU REALTY - Agent Module Schema Migration (v6)
-- ================================================================
-- Run: node src/db/run-migration-v6.js
-- Creates the complete agent module tables.
-- ================================================================

-- ================================================================
-- 1. agents - Core agent profiles
-- ================================================================
CREATE TABLE IF NOT EXISTS agents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    full_name           VARCHAR(255) NOT NULL,
    profile_photo_url   TEXT,
    designation         VARCHAR(255),
    company_name        VARCHAR(255),
    license_number      VARCHAR(100),
    phone               VARCHAR(50),
    whatsapp            VARCHAR(50),
    email               VARCHAR(255) NOT NULL,
    office_address      TEXT,
    city                VARCHAR(100),
    state               VARCHAR(100),
    country             VARCHAR(100) DEFAULT 'US',
    zip_code            VARCHAR(20),
    experience_years    INTEGER DEFAULT 0,
    bio                 TEXT,
    languages           TEXT[] DEFAULT ARRAY['English'],
    specialties         TEXT[] DEFAULT '{}',
    areas_served        TEXT[] DEFAULT '{}',
    website             VARCHAR(500),
    instagram           VARCHAR(500),
    facebook            VARCHAR(500),
    linkedin            VARCHAR(500),
    response_time_minutes INTEGER,
    response_rate       DECIMAL(5,2),
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_email ON agents(email);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_city ON agents(city);
CREATE INDEX IF NOT EXISTS idx_agents_state ON agents(state);
CREATE INDEX IF NOT EXISTS idx_agents_is_verified ON agents(is_verified);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC);

-- ================================================================
-- 2. agent_reviews - Reviews for agents
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_reviews (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id             UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
    property_id          VARCHAR(255),
    rating               INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text          TEXT NOT NULL,
    verified_transaction BOOLEAN NOT NULL DEFAULT FALSE,
    status               VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_reviews_agent_id ON agent_reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_user_id ON agent_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_rating ON agent_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_status ON agent_reviews(status);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_created_at ON agent_reviews(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_reviews_unique ON agent_reviews(agent_id, user_id, property_id) WHERE user_id IS NOT NULL;

-- ================================================================
-- 3. agent_tour_requests - Tour scheduling
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_tour_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    property_id       VARCHAR(255),
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50),
    preferred_date    DATE NOT NULL,
    preferred_time    VARCHAR(50) NOT NULL,
    message           TEXT,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tour_requests_agent_id ON agent_tour_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tour_requests_user_id ON agent_tour_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_tour_requests_status ON agent_tour_requests(status);
CREATE INDEX IF NOT EXISTS idx_agent_tour_requests_date ON agent_tour_requests(preferred_date);
CREATE INDEX IF NOT EXISTS idx_agent_tour_requests_created_at ON agent_tour_requests(created_at DESC);

-- ================================================================
-- 4. agent_posts - Agent posts/articles
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    property_id       VARCHAR(255),
    title             VARCHAR(500) NOT NULL,
    content           TEXT NOT NULL,
    media_urls        TEXT[] DEFAULT '{}',
    post_type         VARCHAR(50) NOT NULL DEFAULT 'article',
    visibility        VARCHAR(50) NOT NULL DEFAULT 'published',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_posts_agent_id ON agent_posts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_posts_post_type ON agent_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_agent_posts_visibility ON agent_posts(visibility);
CREATE INDEX IF NOT EXISTS idx_agent_posts_created_at ON agent_posts(created_at DESC);

-- ================================================================
-- 5. agent_followers - Agent followers
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_followers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_followers_agent_id ON agent_followers(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_followers_user_id ON agent_followers(user_id);

-- ================================================================
-- 6. agent_profile_views - Profile view tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_profile_views (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address        VARCHAR(45),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_profile_views_agent_id ON agent_profile_views(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_profile_views_user_id ON agent_profile_views(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_profile_views_created_at ON agent_profile_views(created_at DESC);

-- ================================================================
-- 7. agent_saved_posts - User saved/favorited posts
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_saved_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_saved_posts_post_id ON agent_saved_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_agent_saved_posts_user_id ON agent_saved_posts(user_id);

-- ================================================================
-- 8. agent_notifications - Agent-specific notifications
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    type              VARCHAR(100) NOT NULL,
    title             VARCHAR(500) NOT NULL,
    message           TEXT,
    link              TEXT,
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_agent_id ON agent_notifications(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_is_read ON agent_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_created_at ON agent_notifications(created_at DESC);

-- ================================================================
-- Triggers for updated_at
-- ================================================================
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'agents',
        'agent_reviews',
        'agent_tour_requests',
        'agent_posts'
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
