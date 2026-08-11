-- ================================================================
-- VASU REALTY - PostgreSQL Schema Migration
-- ================================================================
-- Run: node src/db/run-migration.js
-- ================================================================

-- Note: Using gen_random_uuid() which is built-in to PostgreSQL 13+
-- If on older PostgreSQL, run: CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Or use: CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; and uuid_generate_v4()

-- ================================================================
-- 1. contact_requests - Contact us form submissions
-- ================================================================
CREATE TABLE IF NOT EXISTS contact_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    subject         VARCHAR(255),
    message         TEXT NOT NULL,
    inquiry_type    VARCHAR(100),
    source          VARCHAR(255),
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns for existing databases that already have the table
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS inquiry_type VARCHAR(100);
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS source VARCHAR(255);
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500);

CREATE INDEX idx_contact_requests_created_at ON contact_requests(created_at DESC);
CREATE INDEX idx_contact_requests_status ON contact_requests(status);

-- ================================================================
-- 2. tour_requests - Schedule a tour / property inquiry sidebar
-- ================================================================
CREATE TABLE IF NOT EXISTS tour_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id       VARCHAR(255),
    listing_key       VARCHAR(255),
    property_address  TEXT,
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50),
    message           TEXT,
    preferred_date    DATE,
    preferred_time    VARCHAR(50),
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tour_requests_created_at ON tour_requests(created_at DESC);
CREATE INDEX idx_tour_requests_status ON tour_requests(status);

-- ================================================================
-- 3. property_inquiries - General property inquiry
-- ================================================================
CREATE TABLE IF NOT EXISTS property_inquiries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     VARCHAR(255),
    listing_key     VARCHAR(255),
    property_address TEXT,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    message         TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_inquiries_created_at ON property_inquiries(created_at DESC);

-- ================================================================
-- 4. home_valuations - Free home valuation / sell page form
-- ================================================================
CREATE TABLE IF NOT EXISTS home_valuations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50) NOT NULL,
    property_address  VARCHAR(500) NOT NULL,
    message           TEXT,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_home_valuations_created_at ON home_valuations(created_at DESC);
CREATE INDEX idx_home_valuations_status ON home_valuations(status);

-- ================================================================
-- 5. newsletter_subscribers - Newsletter email signups
-- ================================================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_newsletter_subscribers_email ON newsletter_subscribers(email);

-- ================================================================
-- 6. career_applications - Job applications with resume
-- ================================================================
CREATE TABLE IF NOT EXISTS career_applications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name         VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50) NOT NULL,
    position          VARCHAR(255) NOT NULL,
    experience        VARCHAR(50),
    cover_letter      TEXT,
    linkedin_profile  VARCHAR(500),
    portfolio_url     VARCHAR(500),
    resume_filename   VARCHAR(255),
    resume_data       TEXT,          -- base64 encoded file content
    resume_content_type VARCHAR(100),
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- SDR-specific fields (optional)
    saas_experience           TEXT,
    salary_expectations       TEXT,
    trial_period              TEXT,
    available_to_start        TEXT,
    ai_product_confidence     TEXT,
    weekly_calls              TEXT,
    upwork_freelancer         TEXT,
    preferred_interview_times TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_career_applications_created_at ON career_applications(created_at DESC);
CREATE INDEX idx_career_applications_status ON career_applications(status);
CREATE INDEX idx_career_applications_position ON career_applications(position);

-- ================================================================
-- 7. onboarding_requests - Employee onboarding
-- ================================================================
CREATE TABLE IF NOT EXISTS onboarding_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    address         TEXT,
    govt_id_type    VARCHAR(100),
    attachments     JSONB DEFAULT '[]'::jsonb,  -- Array of {content, filename, type, disposition}
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_requests_created_at ON onboarding_requests(created_at DESC);

-- ================================================================
-- 8. mortgage_pre_approvals - Mortgage pre-approval applications
-- ================================================================
CREATE TABLE IF NOT EXISTS mortgage_pre_approvals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(50) NOT NULL,
    property_price      NUMERIC(12,2) NOT NULL,
    down_payment        NUMERIC(12,2) NOT NULL,
    annual_income       NUMERIC(12,2) NOT NULL,
    employment_status   VARCHAR(100) NOT NULL,
    credit_score        INTEGER,
    preferred_loan_term INTEGER DEFAULT 30,
    notes               TEXT,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgage_pre_approvals_created_at ON mortgage_pre_approvals(created_at DESC);
CREATE INDEX idx_mortgage_pre_approvals_status ON mortgage_pre_approvals(status);
CREATE INDEX idx_mortgage_pre_approvals_email ON mortgage_pre_approvals(email);

-- ================================================================
-- 9. seller_requests - Seller inquiry / Join Our Firm
-- ================================================================
CREATE TABLE IF NOT EXISTS seller_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    property_address TEXT,
    message         TEXT,
    role            VARCHAR(100),     -- For JoinOurFirm: Agent, Broker, etc.
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seller_requests_created_at ON seller_requests(created_at DESC);
CREATE INDEX idx_seller_requests_status ON seller_requests(status);

-- ================================================================
-- 10. ai_demo_requests - AI Demo call requests
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_demo_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    company_name      VARCHAR(255) NOT NULL,
    industry          VARCHAR(100) NOT NULL,
    find_us           VARCHAR(100) NOT NULL,
    whatsapp_number   VARCHAR(50) NOT NULL,
    phone_number      VARCHAR(50) NOT NULL,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_demo_requests_created_at ON ai_demo_requests(created_at DESC);

-- ================================================================
-- 11. ai_contact_requests - AI Contact us form
-- ================================================================

-- ================================================================
-- 12. buyer_agent_requests - Dedicated buyer agent contact
-- ================================================================
CREATE TABLE IF NOT EXISTS buyer_agent_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50) NOT NULL,
    preferred_location VARCHAR(255),
    budget_min      NUMERIC(12,2),
    budget_max      NUMERIC(12,2),
    property_type   VARCHAR(100),
    bedrooms        INTEGER,
    bathrooms       INTEGER,
    timeline        VARCHAR(100),
    additional_requirements TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buyer_agent_requests_created_at ON buyer_agent_requests(created_at DESC);
CREATE INDEX idx_buyer_agent_requests_status ON buyer_agent_requests(status);

-- ================================================================
-- 13. property_agent_inquiries - Contact Agent from specific property
-- ================================================================
CREATE TABLE IF NOT EXISTS property_agent_inquiries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255),
    listing_id        VARCHAR(255),
    property_address  TEXT,
    listing_price     NUMERIC(12,2),
    property_url      TEXT,
    listing_agent_name VARCHAR(255),
    listing_agent_mls_id VARCHAR(255),
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50),
    message           TEXT,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_agent_inquiries_created_at ON property_agent_inquiries(created_at DESC);
CREATE INDEX idx_property_agent_inquiries_status ON property_agent_inquiries(status);
CREATE INDEX idx_property_agent_inquiries_listing_key ON property_agent_inquiries(listing_key);

-- ================================================================
-- 11. ai_contact_requests - AI Contact us form
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_contact_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_automation    VARCHAR(50),
    industry_type       VARCHAR(100),
    yearly_revenue      VARCHAR(50),
    country             VARCHAR(100),
    transformative_for  VARCHAR(100),
    monthly_usage       VARCHAR(50),
    whatsapp_no         VARCHAR(50),
    website_link        VARCHAR(500),
    consent             BOOLEAN DEFAULT FALSE,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_contact_requests_created_at ON ai_contact_requests(created_at DESC);

-- ================================================================
-- Auto-update updated_at trigger
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'contact_requests',
        'tour_requests',
        'property_inquiries',
        'home_valuations',
        'newsletter_subscribers',
        'career_applications',
        'onboarding_requests',
        'mortgage_pre_approvals',
        'seller_requests',
        'ai_demo_requests',
        'ai_contact_requests'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format(
            'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
            t, t
        );
    END LOOP;
END;
$$;

-- ================================================================
-- 14. callback_requests - Agent callback requests
-- ================================================================
CREATE TABLE IF NOT EXISTS callback_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    phone             VARCHAR(50) NOT NULL,
    preferred_time    VARCHAR(50),
    property_address  TEXT,
    listing_key       VARCHAR(255),
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_callback_requests_created_at ON callback_requests(created_at DESC);
CREATE INDEX idx_callback_requests_status ON callback_requests(status);

-- ================================================================
-- 15. quick_questions - Property-specific quick questions
-- ================================================================
CREATE TABLE IF NOT EXISTS quick_questions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(50),
    message           TEXT NOT NULL,
    property_address  TEXT,
    listing_key       VARCHAR(255),
    listing_id        VARCHAR(255),
    listing_price     NUMERIC(12,2),
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quick_questions_created_at ON quick_questions(created_at DESC);
CREATE INDEX idx_quick_questions_status ON quick_questions(status);

-- ================================================================
-- 12. users - Registered user accounts for authentication
-- ================================================================
CREATE TABLE IF NOT EXISTS users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   VARCHAR(255) NOT NULL UNIQUE,
    password_hash           VARCHAR(255),
    name                    VARCHAR(255) NOT NULL,
    phone                   VARCHAR(50),
    email_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    google_id               VARCHAR(255),
    reset_token             VARCHAR(255),
    reset_token_expires_at  TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- ================================================================
-- 13. favorites - User saved/favorited properties
-- ================================================================
CREATE TABLE IF NOT EXISTS favorites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_key     VARCHAR(255) NOT NULL,
    property_data   JSONB,  -- Cached property snapshot for fast display
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent duplicate favorites
    UNIQUE(user_id, listing_key)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_listing_key ON favorites(listing_key);
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at DESC);

-- Add users and favorites to the trigger update list
DO $$
BEGIN
    -- Users trigger
    BEGIN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    -- Favorites trigger (no updated_at needed, but keep for consistency)
    BEGIN
        CREATE TRIGGER update_favorites_updated_at BEFORE UPDATE ON favorites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END;
$$;

-- ================================================================
-- Verify all tables were created
-- ================================================================
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'contact_requests',
    'tour_requests',
    'property_inquiries',
    'home_valuations',
    'newsletter_subscribers',
    'career_applications',
    'onboarding_requests',
    'mortgage_pre_approvals',
    'seller_requests',
    'ai_demo_requests',
    'ai_contact_requests',
    'users',
    'favorites'
)
ORDER BY table_name;
