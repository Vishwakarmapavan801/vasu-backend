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
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    'ai_contact_requests'
)
ORDER BY table_name;
