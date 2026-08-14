-- ================================================================
-- v17 AI Blog Generation System Migration
--
-- Extends blog_posts into the single source of truth for the
-- AI-powered blog generation system (source_type = 'ai') and adds
-- the three tracking tables required by the workflow:
--
--   blog_generation_jobs — every generation request (admin or cron),
--       including the raw MCP snapshot data it was built from and the
--       full structured log of the run.
--   blog_publish_jobs   — per-destination publish status for website,
--       Facebook and LinkedIn.
--   blog_assets         — every generated/uploaded image (cover,
--       listing fallback, OG) with storage metadata.
--
-- Lifecycle for AI posts uses status values:
--   GENERATED → DRAFT (optional edit) → approved → PUBLISHED
--   FAILED when generation/publishing fails.
--
-- All statements are idempotent and safe to re-run.
-- ================================================================

-- ---- base table (self-contained fallback: production already has it) ----
CREATE TABLE IF NOT EXISTS blog_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    slug            TEXT NOT NULL,
    excerpt         TEXT,
    content         TEXT,
    featured_image  TEXT,
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_type     VARCHAR(20) NOT NULL DEFAULT 'mls',
    status          VARCHAR(20) NOT NULL DEFAULT 'published',
    category        VARCHAR(100),
    city            VARCHAR(150),
    county          VARCHAR(150),
    state           VARCHAR(10),
    neighborhood    VARCHAR(200),
    listing_key     VARCHAR(255),
    read_time       INTEGER NOT NULL DEFAULT 1,
    published_at    TIMESTAMPTZ,
    meta_title      TEXT,
    meta_description TEXT,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,
    author_name     VARCHAR(255),
    featured        BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure slug is unique regardless of how the table was originally created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);

-- ---- new AI-blog columns -----------------------------------------------
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source_topic TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS og_image TEXT;

-- ---- blog_generation_jobs ----------------------------------------------
CREATE TABLE IF NOT EXISTS blog_generation_jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_post_id      UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
    topic             TEXT NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    trigger_type      VARCHAR(20) NOT NULL DEFAULT 'admin',
    mcp_snapshot      JSONB,
    mcp_listings      JSONB,
    mcp_neighborhoods JSONB,
    mcp_market        JSONB,
    mcp_activity      JSONB,
    logs              JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message     TEXT,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_gen_jobs_status ON blog_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_blog_gen_jobs_post ON blog_generation_jobs(blog_post_id);
CREATE INDEX IF NOT EXISTS idx_blog_gen_jobs_created ON blog_generation_jobs(created_at DESC);

-- ---- blog_publish_jobs --------------------------------------------------
CREATE TABLE IF NOT EXISTS blog_publish_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_post_id   UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    destination    VARCHAR(20) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    external_id    TEXT,
    external_url   TEXT,
    error_message  TEXT,
    attempts       INTEGER NOT NULL DEFAULT 0,
    response       JSONB,
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (blog_post_id, destination)
);

CREATE INDEX IF NOT EXISTS idx_blog_pub_jobs_status ON blog_publish_jobs(status);
CREATE INDEX IF NOT EXISTS idx_blog_pub_jobs_post ON blog_publish_jobs(blog_post_id);

-- ---- blog_assets --------------------------------------------------------
CREATE TABLE IF NOT EXISTS blog_assets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_post_id   UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
    kind           VARCHAR(20) NOT NULL DEFAULT 'cover',
    storage_key    TEXT,
    storage_bucket TEXT,
    url            TEXT,
    width          INTEGER,
    height         INTEGER,
    mime_type      TEXT,
    size_bytes     BIGINT,
    source         VARCHAR(20) NOT NULL DEFAULT 'openai',
    prompt         TEXT,
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_assets_post ON blog_assets(blog_post_id);
CREATE INDEX IF NOT EXISTS idx_blog_assets_kind ON blog_assets(kind);

-- ---- indexes on the extended columns ------------------------------------
CREATE INDEX IF NOT EXISTS idx_blog_posts_source_topic ON blog_posts(source_topic);
CREATE INDEX IF NOT EXISTS idx_blog_posts_canonical ON blog_posts(canonical_url);
