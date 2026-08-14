
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

CREATE INDEX IF NOT EXISTS idx_tour_requests_created_at ON tour_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tour_requests_status ON tour_requests(status);
CREATE INDEX IF NOT EXISTS idx_tour_requests_listing_key ON tour_requests(listing_key);




CREATE TABLE IF NOT EXISTS property_agent_inquiries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key         VARCHAR(255),
    listing_id          VARCHAR(255),
    property_address    TEXT,
    listing_price       NUMERIC(12,2),
    property_url        TEXT,
    listing_agent_name  VARCHAR(255),
    listing_agent_mls_id VARCHAR(255),
    name                VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(50),
    message             TEXT,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_agent_inquiries_created_at ON property_agent_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_agent_inquiries_status ON property_agent_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_property_agent_inquiries_listing_key ON property_agent_inquiries(listing_key);




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

CREATE INDEX IF NOT EXISTS idx_quick_questions_created_at ON quick_questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_questions_status ON quick_questions(status);
CREATE INDEX IF NOT EXISTS idx_quick_questions_listing_key ON quick_questions(listing_key);




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

CREATE INDEX IF NOT EXISTS idx_callback_requests_created_at ON callback_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_callback_requests_status ON callback_requests(status);
CREATE INDEX IF NOT EXISTS idx_callback_requests_listing_key ON callback_requests(listing_key);





CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tour_requests',
        'property_agent_inquiries',
        'quick_questions',
        'callback_requests'
    ]
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



SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('tour_requests', 'property_agent_inquiries', 'quick_questions', 'callback_requests')
ORDER BY table_name;
