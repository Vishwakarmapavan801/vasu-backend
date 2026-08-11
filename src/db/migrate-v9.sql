-- ================================================================
-- VASU REALTY - Platform Enhancement Migration (v9)
-- ================================================================
-- Adds: neighborhood stats, ZIP market stats, schools, commute,
-- nearby places, agent CRM (leads, pipeline, tasks), property
-- comparison, mortgage requests, AI features, analytics events,
-- listing metadata, feed events, MLS sync tracking, open houses,
-- agent verification, search alerts
-- ================================================================

-- ================================================================
-- 0. Create agent_posts if not exists (needed by v8 social + v9)
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
    caption           TEXT,
    hashtags          TEXT[] DEFAULT '{}',
    location          VARCHAR(500),
    location_lat      DECIMAL(10,7),
    location_lng      DECIMAL(10,7),
    is_reel           BOOLEAN NOT NULL DEFAULT FALSE,
    is_story          BOOLEAN NOT NULL DEFAULT FALSE,
    allows_comments   BOOLEAN NOT NULL DEFAULT TRUE,
    allows_saves      BOOLEAN NOT NULL DEFAULT TRUE,
    mentions          UUID[] DEFAULT '{}',
    tagged_agents     UUID[] DEFAULT '{}',
    listing_key       VARCHAR(255),
    listing_id        VARCHAR(255),
    like_count        INTEGER NOT NULL DEFAULT 0,
    comment_count     INTEGER NOT NULL DEFAULT 0,
    save_count        INTEGER NOT NULL DEFAULT 0,
    share_count       INTEGER NOT NULL DEFAULT 0,
    view_count        INTEGER NOT NULL DEFAULT 0,
    feed_event_type   VARCHAR(50),
    market_update_data JSONB DEFAULT '{}',
    neighborhood_spotlight_data JSONB DEFAULT '{}',
    investment_data   JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_posts_agent_id ON agent_posts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_posts_post_type ON agent_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_agent_posts_visibility ON agent_posts(visibility);
CREATE INDEX IF NOT EXISTS idx_agent_posts_created_at ON agent_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_posts_hashtags ON agent_posts USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS idx_agent_posts_is_reel ON agent_posts(is_reel);
CREATE INDEX IF NOT EXISTS idx_agent_posts_is_story ON agent_posts(is_story);
CREATE INDEX IF NOT EXISTS idx_agent_posts_listing_key ON agent_posts(listing_key);
CREATE INDEX IF NOT EXISTS idx_agent_posts_feed_event_type ON agent_posts(feed_event_type);
-- Skip GIN index on caption - use LIKE/ILIKE with pg_trgm if needed later

-- Also create social tables (v8) if not exists
CREATE TABLE IF NOT EXISTS social_post_media (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    media_url         TEXT NOT NULL,
    media_type        VARCHAR(50) NOT NULL DEFAULT 'image',
    thumbnail_url     TEXT,
    width             INTEGER,
    height            INTEGER,
    duration          INTEGER,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_post_media_post_id ON social_post_media(post_id);

CREATE TABLE IF NOT EXISTS social_hashtags (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag               VARCHAR(100) NOT NULL UNIQUE,
    post_count        INTEGER NOT NULL DEFAULT 0,
    last_used_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_hashtags_tag ON social_hashtags(tag);

CREATE TABLE IF NOT EXISTS social_likes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_likes_post_id ON social_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_user_id ON social_likes(user_id);

CREATE TABLE IF NOT EXISTS social_comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id         UUID REFERENCES social_comments(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    mentions          UUID[] DEFAULT '{}',
    like_count        INTEGER NOT NULL DEFAULT 0,
    reply_count       INTEGER NOT NULL DEFAULT 0,
    is_edited         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_comments_post_id ON social_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_user_id ON social_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_parent_id ON social_comments(parent_id);

CREATE TABLE IF NOT EXISTS social_saves (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_saves_post_id ON social_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_social_saves_user_id ON social_saves(user_id);

CREATE TABLE IF NOT EXISTS social_follows (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_type    VARCHAR(20) NOT NULL DEFAULT 'agent',
    following_id      UUID NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(follower_id, following_type, following_id)
);

CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows(follower_id);

CREATE TABLE IF NOT EXISTS social_notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    type              VARCHAR(50) NOT NULL,
    post_id           UUID REFERENCES agent_posts(id) ON DELETE CASCADE,
    comment_id        UUID REFERENCES social_comments(id) ON DELETE CASCADE,
    message           TEXT,
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_notifications_user ON social_notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS social_stories (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    media_url         TEXT NOT NULL,
    media_type        VARCHAR(50) NOT NULL DEFAULT 'image',
    thumbnail_url     TEXT,
    caption           TEXT,
    view_count        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_social_stories_agent ON social_stories(agent_id);
CREATE INDEX IF NOT EXISTS idx_social_stories_expires ON social_stories(expires_at);

CREATE TABLE IF NOT EXISTS social_story_views (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id          UUID NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_story_views_story ON social_story_views(story_id);

CREATE TABLE IF NOT EXISTS social_post_listings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255),
    listing_id        VARCHAR(255),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_post_listings_post ON social_post_listings(post_id);

-- ================================================================
-- 0b. Extend agents table with MLS identifier & verification
-- ================================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mls_member_id VARCHAR(255);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mls_license_number VARCHAR(100);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) NOT NULL DEFAULT 'unverified';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS video_intro_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS brokerage_mls_id VARCHAR(255);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS service_areas TEXT[] DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_listings_sold INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_listings_active INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agents_mls_member_id ON agents(mls_member_id);
CREATE INDEX IF NOT EXISTS idx_agents_verification_status ON agents(verification_status);
CREATE INDEX IF NOT EXISTS idx_agents_average_rating ON agents(average_rating DESC);

-- ================================================================
-- 1. search_alerts - Real notifications for listing changes
-- ================================================================
CREATE TABLE IF NOT EXISTS search_alerts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_search_id   UUID REFERENCES saved_searches(id) ON DELETE CASCADE,
    alert_type        VARCHAR(50) NOT NULL DEFAULT 'new_listing',
    title             VARCHAR(255) NOT NULL,
    filters           JSONB NOT NULL DEFAULT '{}',
    frequency         VARCHAR(50) NOT NULL DEFAULT 'realtime',
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_alerts_user_id ON search_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_search_alerts_active ON search_alerts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_search_alerts_type ON search_alerts(alert_type);

-- ================================================================
-- 2. alert_history - Triggered alert log
-- ================================================================
CREATE TABLE IF NOT EXISTS alert_history (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id          UUID NOT NULL REFERENCES search_alerts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_key       VARCHAR(255),
    alert_type        VARCHAR(50) NOT NULL,
    message           TEXT,
    was_notified      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_alert_id ON alert_history(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_user_id ON alert_history(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_created_at ON alert_history(created_at DESC);

-- ================================================================
-- 3. neighborhood_stats - Pre-computed neighborhood market data
-- ================================================================
CREATE TABLE IF NOT EXISTS neighborhood_stats (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city              VARCHAR(100) NOT NULL,
    neighborhood      VARCHAR(200) NOT NULL,
    state             VARCHAR(100) NOT NULL DEFAULT 'NC',
    county            VARCHAR(100),
    median_home_price DECIMAL(14,2),
    median_rent       DECIMAL(10,2),
    price_per_sqft    DECIMAL(10,2),
    inventory_count   INTEGER DEFAULT 0,
    days_on_market    DECIMAL(8,2),
    sold_count_30d    INTEGER DEFAULT 0,
    new_listings_7d   INTEGER DEFAULT 0,
    price_change_30d  DECIMAL(5,2),
    avg_listing_price DECIMAL(14,2),
    avg_sold_price    DECIMAL(14,2),
    sale_to_list_ratio DECIMAL(5,3),
    school_rating     DECIMAL(3,1),
    walk_score        INTEGER,
    transit_score     INTEGER,
    latitude          DECIMAL(10,7),
    longitude         DECIMAL(10,7),
    bounding_box      JSONB,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(city, neighborhood, state)
);

CREATE INDEX IF NOT EXISTS idx_neighborhood_stats_city ON neighborhood_stats(city);
CREATE INDEX IF NOT EXISTS idx_neighborhood_stats_neighborhood ON neighborhood_stats(neighborhood);
CREATE INDEX IF NOT EXISTS idx_neighborhood_stats_state ON neighborhood_stats(state);
CREATE INDEX IF NOT EXISTS idx_neighborhood_stats_county ON neighborhood_stats(county);
CREATE INDEX IF NOT EXISTS idx_neighborhood_stats_median_price ON neighborhood_stats(median_home_price DESC);
CREATE INDEX IF NOT EXISTS idx_neighborhood_stats_last_updated ON neighborhood_stats(last_updated DESC);

-- ================================================================
-- 4. zip_market_stats - ZIP code level market data
-- ================================================================
CREATE TABLE IF NOT EXISTS zip_market_stats (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zip_code          VARCHAR(10) NOT NULL UNIQUE,
    city              VARCHAR(100) NOT NULL,
    state             VARCHAR(100) NOT NULL DEFAULT 'NC',
    county            VARCHAR(100),
    median_home_price DECIMAL(14,2),
    median_rent       DECIMAL(10,2),
    price_per_sqft    DECIMAL(10,2),
    inventory_count   INTEGER DEFAULT 0,
    days_on_market    DECIMAL(8,2),
    sold_count_30d    INTEGER DEFAULT 0,
    new_listings_7d   INTEGER DEFAULT 0,
    price_change_30d  DECIMAL(5,2),
    population        INTEGER,
    median_household_income INTEGER,
    owner_occupied_pct DECIMAL(5,2),
    avg_school_rating DECIMAL(3,1),
    latitude          DECIMAL(10,7),
    longitude         DECIMAL(10,7),
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zip_market_stats_zip ON zip_market_stats(zip_code);
CREATE INDEX IF NOT EXISTS idx_zip_market_stats_city ON zip_market_stats(city);
CREATE INDEX IF NOT EXISTS idx_zip_market_stats_state ON zip_market_stats(state);
CREATE INDEX IF NOT EXISTS idx_zip_market_stats_county ON zip_market_stats(county);

-- ================================================================
-- 5. school_districts - School information
-- ================================================================
CREATE TABLE IF NOT EXISTS school_districts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    district          VARCHAR(255),
    type              VARCHAR(50) NOT NULL DEFAULT 'public',
    level             VARCHAR(50) NOT NULL,
    rating            DECIMAL(3,1),
    grade_range       VARCHAR(20),
    enrollment        INTEGER,
    student_teacher_ratio DECIMAL(5,1),
    address           TEXT,
    city              VARCHAR(100),
    state             VARCHAR(100) NOT NULL DEFAULT 'NC',
    zip_code          VARCHAR(10),
    phone             VARCHAR(50),
    website           VARCHAR(500),
    latitude          DECIMAL(10,7),
    longitude         DECIMAL(10,7),
    great_schools_id  VARCHAR(100),
    nces_id           VARCHAR(100),
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_districts_name ON school_districts(name);
CREATE INDEX IF NOT EXISTS idx_school_districts_city ON school_districts(city);
CREATE INDEX IF NOT EXISTS idx_school_districts_state ON school_districts(state);
CREATE INDEX IF NOT EXISTS idx_school_districts_rating ON school_districts(rating DESC);
CREATE INDEX IF NOT EXISTS idx_school_districts_type ON school_districts(type, level);

-- ================================================================
-- 6. neighborhood_schools - Bridge: neighborhoods to schools
-- ================================================================
CREATE TABLE IF NOT EXISTS neighborhood_schools (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    neighborhood_id   UUID REFERENCES neighborhood_stats(id) ON DELETE CASCADE,
    school_id         UUID NOT NULL REFERENCES school_districts(id) ON DELETE CASCADE,
    distance_miles    DECIMAL(6,2),
    is_zoned          BOOLEAN DEFAULT FALSE,
    UNIQUE(neighborhood_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_neighborhood_schools_neighborhood ON neighborhood_schools(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_neighborhood_schools_school ON neighborhood_schools(school_id);

-- ================================================================
-- 7. commute_data - Commute time estimates
-- ================================================================
CREATE TABLE IF NOT EXISTS commute_data (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_type       VARCHAR(50) NOT NULL DEFAULT 'neighborhood',
    origin_id         UUID,
    origin_name       VARCHAR(255),
    destination       VARCHAR(255) NOT NULL,
    destination_type  VARCHAR(50) NOT NULL DEFAULT 'landmark',
    driving_minutes   INTEGER,
    transit_minutes   INTEGER,
    biking_minutes    INTEGER,
    walking_minutes   INTEGER,
    distance_miles    DECIMAL(6,2),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commute_data_origin ON commute_data(origin_type, origin_id);
CREATE INDEX IF NOT EXISTS idx_commute_data_destination ON commute_data(destination);

-- ================================================================
-- 8. nearby_places - Points of interest near neighborhoods
-- ================================================================
CREATE TABLE IF NOT EXISTS nearby_places (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_type        VARCHAR(50) NOT NULL,
    name              VARCHAR(255) NOT NULL,
    address           TEXT,
    city              VARCHAR(100),
    state             VARCHAR(100),
    zip_code          VARCHAR(10),
    phone             VARCHAR(50),
    website           VARCHAR(500),
    latitude          DECIMAL(10,7),
    longitude         DECIMAL(10,7),
    neighborhood_id   UUID REFERENCES neighborhood_stats(id) ON DELETE SET NULL,
    source            VARCHAR(100) DEFAULT 'mls',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nearby_places_type ON nearby_places(place_type);
CREATE INDEX IF NOT EXISTS idx_nearby_places_neighborhood ON nearby_places(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_nearby_places_city ON nearby_places(city);
CREATE INDEX IF NOT EXISTS idx_nearby_places_coords ON nearby_places(latitude, longitude);

-- ================================================================
-- 9. agent_leads - Lead management CRM
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_leads (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255),
    phone             VARCHAR(50),
    source            VARCHAR(100) DEFAULT 'direct',
    status            VARCHAR(50) NOT NULL DEFAULT 'new',
    lead_type         VARCHAR(50) NOT NULL DEFAULT 'buyer',
    budget_min        DECIMAL(14,2),
    budget_max        DECIMAL(14,2),
    property_type     VARCHAR(100),
    city_interest     VARCHAR(255),
    bedrooms_min      INTEGER,
    bathrooms_min     INTEGER,
    notes_summary     TEXT,
    listing_key       VARCHAR(255),
    listing_address   TEXT,
    inquiry_id        UUID,
    inquiry_source    VARCHAR(100),
    first_contacted_at TIMESTAMPTZ,
    last_contacted_at TIMESTAMPTZ,
    converted_at      TIMESTAMPTZ,
    closed_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_leads_agent_id ON agent_leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_leads_user_id ON agent_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_leads_status ON agent_leads(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_leads_source ON agent_leads(source);
CREATE INDEX IF NOT EXISTS idx_agent_leads_created_at ON agent_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_leads_lead_type ON agent_leads(lead_type);

-- ================================================================
-- 10. lead_notes - Notes on leads
-- ================================================================
CREATE TABLE IF NOT EXISTS lead_notes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id           UUID NOT NULL REFERENCES agent_leads(id) ON DELETE CASCADE,
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    note_type         VARCHAR(50) DEFAULT 'general',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_agent_id ON lead_notes(agent_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON lead_notes(created_at DESC);

-- ================================================================
-- 11. lead_tasks - Tasks and follow-ups for leads
-- ================================================================
CREATE TABLE IF NOT EXISTS lead_tasks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id           UUID NOT NULL REFERENCES agent_leads(id) ON DELETE CASCADE,
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title             VARCHAR(500) NOT NULL,
    description       TEXT,
    task_type         VARCHAR(50) NOT NULL DEFAULT 'follow_up',
    priority          VARCHAR(20) NOT NULL DEFAULT 'medium',
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    due_at            TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead_id ON lead_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_agent_id ON lead_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_status ON lead_tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_due_at ON lead_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_priority ON lead_tasks(priority);

-- ================================================================
-- 12. lead_pipeline - Pipeline stage tracking
-- ================================================================
CREATE TABLE IF NOT EXISTS lead_pipeline (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id           UUID NOT NULL REFERENCES agent_leads(id) ON DELETE CASCADE,
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    stage             VARCHAR(50) NOT NULL DEFAULT 'new',
    previous_stage    VARCHAR(50),
    entered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exited_at         TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_pipeline_lead_id ON lead_pipeline(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_agent_id ON lead_pipeline(agent_id);
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_stage ON lead_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_entered_at ON lead_pipeline(entered_at DESC);

-- ================================================================
-- 13. property_comparisons - Saved property comparisons
-- ================================================================
CREATE TABLE IF NOT EXISTS property_comparisons (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              VARCHAR(255) DEFAULT 'My Comparison',
    listing_keys      TEXT[] NOT NULL DEFAULT '{}',
    property_data     JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_comparisons_user_id ON property_comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_property_comparisons_created_at ON property_comparisons(created_at DESC);

-- ================================================================
-- 14. mortgage_requests - Saved mortgage calculations
-- ================================================================
CREATE TABLE IF NOT EXISTS mortgage_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id        VARCHAR(255),
    property_price    DECIMAL(14,2) NOT NULL,
    down_payment      DECIMAL(14,2),
    down_payment_pct  DECIMAL(5,2),
    interest_rate     DECIMAL(5,3) NOT NULL,
    loan_term_years   INTEGER NOT NULL DEFAULT 30,
    property_tax_rate DECIMAL(6,4) DEFAULT 0,
    annual_hoa        DECIMAL(10,2) DEFAULT 0,
    annual_insurance  DECIMAL(10,2) DEFAULT 0,
    pmi_rate          DECIMAL(5,3) DEFAULT 0,
    monthly_payment   DECIMAL(10,2),
    principal_payment DECIMAL(10,2),
    interest_payment  DECIMAL(10,2),
    tax_payment       DECIMAL(10,2),
    insurance_payment DECIMAL(10,2),
    hoa_payment       DECIMAL(10,2),
    pmi_payment       DECIMAL(10,2),
    amortization_schedule JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mortgage_requests_user_id ON mortgage_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_mortgage_requests_session ON mortgage_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_mortgage_requests_created_at ON mortgage_requests(created_at DESC);

-- ================================================================
-- 15. ai_recommendations - AI property recommendations
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_recommendations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recommendation_type VARCHAR(50) NOT NULL DEFAULT 'property_match',
    listing_keys      TEXT[] DEFAULT '{}',
    listing_data      JSONB DEFAULT '{}',
    score             DECIMAL(5,2),
    reason            TEXT,
    source            VARCHAR(50) DEFAULT 'ai',
    feedback          VARCHAR(20),
    viewed_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_user_id ON ai_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_type ON ai_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_score ON ai_recommendations(score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_created_at ON ai_recommendations(created_at DESC);

-- ================================================================
-- 16. ai_market_reports - AI-generated market summaries
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_market_reports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type       VARCHAR(50) NOT NULL DEFAULT 'market_summary',
    location          VARCHAR(255) NOT NULL,
    location_type     VARCHAR(50) NOT NULL DEFAULT 'city',
    title             VARCHAR(500),
    summary           TEXT NOT NULL,
    report_data       JSONB DEFAULT '{}',
    metrics           JSONB DEFAULT '{}',
    generated_for     UUID REFERENCES users(id) ON DELETE SET NULL,
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_market_reports_type ON ai_market_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_ai_market_reports_location ON ai_market_reports(location);
CREATE INDEX IF NOT EXISTS idx_ai_market_reports_location_type ON ai_market_reports(location_type);
CREATE INDEX IF NOT EXISTS idx_ai_market_reports_generated_at ON ai_market_reports(generated_at DESC);

-- ================================================================
-- 17. listing_metadata - Local listing metadata
-- ================================================================
CREATE TABLE IF NOT EXISTS listing_metadata (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL UNIQUE,
    agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
    custom_title      VARCHAR(500),
    custom_description TEXT,
    is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
    internal_notes    TEXT,
    marketing_status  VARCHAR(50) DEFAULT 'active',
    social_visibility VARCHAR(50) DEFAULT 'public',
    open_house_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    open_house_dates  TIMESTAMPTZ[] DEFAULT '{}',
    tags              TEXT[] DEFAULT '{}',
    seo_title         VARCHAR(500),
    seo_description   TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_metadata_listing_key ON listing_metadata(listing_key);
CREATE INDEX IF NOT EXISTS idx_listing_metadata_agent_id ON listing_metadata(agent_id);
CREATE INDEX IF NOT EXISTS idx_listing_metadata_featured ON listing_metadata(is_featured);
CREATE INDEX IF NOT EXISTS idx_listing_metadata_marketing ON listing_metadata(marketing_status);

-- ================================================================
-- 18. analytics_events - Property/listing analytics events
-- ================================================================
CREATE TABLE IF NOT EXISTS analytics_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type        VARCHAR(50) NOT NULL,
    listing_key       VARCHAR(255),
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
    session_id        VARCHAR(255),
    ip_address        VARCHAR(45),
    user_agent        TEXT,
    referrer          TEXT,
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_listing ON analytics_events(listing_key);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_agent ON analytics_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_listing_created ON analytics_events(listing_key, created_at DESC);

-- ================================================================
-- 19. feed_events - Curated real estate feed events
-- ================================================================
CREATE TABLE IF NOT EXISTS feed_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type        VARCHAR(50) NOT NULL,
    agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
    post_id           UUID REFERENCES agent_posts(id) ON DELETE SET NULL,
    listing_key       VARCHAR(255),
    title             VARCHAR(500) NOT NULL,
    description       TEXT,
    media_url         TEXT,
    metadata          JSONB DEFAULT '{}',
    is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_events_type ON feed_events(event_type);
CREATE INDEX IF NOT EXISTS idx_feed_events_agent ON feed_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_listing ON feed_events(listing_key);
CREATE INDEX IF NOT EXISTS idx_feed_events_pinned ON feed_events(is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_created_at ON feed_events(created_at DESC);

-- ================================================================
-- 20. open_houses - Open house events
-- ================================================================
CREATE TABLE IF NOT EXISTS open_houses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_key       VARCHAR(255) NOT NULL,
    agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
    date              DATE NOT NULL,
    start_time        TIME NOT NULL,
    end_time          TIME NOT NULL,
    description       TEXT,
    is_cancelled      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_houses_listing ON open_houses(listing_key);
CREATE INDEX IF NOT EXISTS idx_open_houses_agent ON open_houses(agent_id);
CREATE INDEX IF NOT EXISTS idx_open_houses_date ON open_houses(date);
CREATE INDEX IF NOT EXISTS idx_open_houses_active ON open_houses(date, is_cancelled) WHERE NOT is_cancelled;

-- ================================================================
-- 21. agent_verification - Verification records
-- ================================================================
CREATE TABLE IF NOT EXISTS agent_verification (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    verification_type VARCHAR(50) NOT NULL DEFAULT 'mls',
    verified_value    VARCHAR(500) NOT NULL,
    verified_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    notes             TEXT,
    verified_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, verification_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_verification_agent ON agent_verification(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_verification_status ON agent_verification(status);

-- ================================================================
-- 22. trending_topics - Trending real estate topics
-- ================================================================
CREATE TABLE IF NOT EXISTS trending_topics (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic             VARCHAR(255) NOT NULL UNIQUE,
    topic_type        VARCHAR(50) NOT NULL DEFAULT 'neighborhood',
    score             DECIMAL(10,2) NOT NULL DEFAULT 0,
    metadata          JSONB DEFAULT '{}',
    last_computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_topics_score ON trending_topics(score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_topics_type ON trending_topics(topic_type);

-- ================================================================
-- Extend existing saved_searches with more fields
-- ================================================================
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(200);
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS property_type VARCHAR(100);
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS min_price DECIMAL(14,2);
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS max_price DECIMAL(14,2);
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS min_beds INTEGER;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS min_baths INTEGER;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS school_district VARCHAR(255);
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS waterfront BOOLEAN;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS new_construction BOOLEAN;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS hoa BOOLEAN;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS last_match_count INTEGER DEFAULT 0;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- ================================================================
-- Extend existing notifications with more context
-- ================================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS listing_address TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS listing_price DECIMAL(14,2);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS listing_photo_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_alert BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alert_type VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_notifications_alert_type ON notifications(alert_type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_alert ON notifications(is_alert);

-- ================================================================
-- Add enhanced feed event types to agent_posts (validate via trigger)
-- ================================================================
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS feed_event_type VARCHAR(50);
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS market_update_data JSONB DEFAULT '{}';
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS neighborhood_spotlight_data JSONB DEFAULT '{}';
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS investment_data JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_agent_posts_feed_event_type ON agent_posts(feed_event_type);

-- ================================================================
-- Triggers for updated_at
-- ================================================================
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'search_alerts',
        'neighborhood_stats',
        'zip_market_stats',
        'commute_data',
        'agent_leads',
        'lead_notes',
        'lead_tasks',
        'property_comparisons',
        'listing_metadata',
        'open_houses'
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
