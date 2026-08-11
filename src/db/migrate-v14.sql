-- ================================================================
-- v14 Admin Panel Migration
--
-- Adds the schema required by the Enterprise Admin Panel:
--   users.role            — RBAC role for every user (default 'user')
--   users.status          — account status (active/suspended)
--   admin_audit_log       — admin action audit trail (referenced by
--                           src/services/auditService.js but never created)
--   admin_settings        — persisted platform settings / feature flags
--   listing_admin_meta    — platform-only metadata for MLS listings
--                           (featured/archived). NEVER writes to MLS.
--
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ================================================================

-- ================================================================
-- 1. users — RBAC + account status
-- ================================================================
-- authController.js / refreshTokenService.js SELECT u.role on every
-- login, /me and token refresh. The base + v2..v13 migrations never
-- added it, so this guarantees the column exists (default 'user').
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user';

-- Account lifecycle for admin moderation (suspend / reactivate).
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ================================================================
-- 2. admin_audit_log — admin action audit trail
-- ================================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id   VARCHAR(255),
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

-- ================================================================
-- 3. admin_settings — persisted platform settings (key/value JSONB)
-- ================================================================
CREATE TABLE IF NOT EXISTS admin_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_settings_updated ON admin_settings(updated_at DESC);

-- ================================================================
-- 4. listing_admin_meta — platform-only listing metadata
-- ================================================================
-- Admin "featured / archive" toggles live here and are merged into API
-- responses. The MLS Grid source of record is never modified.
CREATE TABLE IF NOT EXISTS listing_admin_meta (
    listing_key       VARCHAR(255) PRIMARY KEY,
    is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
    featured_priority INTEGER NOT NULL DEFAULT 0,
    is_archived       BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at       TIMESTAMPTZ,
    notes             TEXT,
    updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_admin_meta_featured ON listing_admin_meta(is_featured, featured_priority DESC);
CREATE INDEX IF NOT EXISTS idx_listing_admin_meta_archived ON listing_admin_meta(is_archived);

-- ================================================================
-- 5. mls_sync_status / mls_sync_errors — MLS sync tracking
-- ================================================================
-- Consumed by the admin MLS control panel (GET /api/admin/mls/status,
-- trigger sync) and written by jobs/mlsSyncWorker.js (mlsSyncService).
-- Ensured here so the admin panel + sync pipeline function even on
-- deployments that never ran the v11 production-launch migration.
CREATE TABLE IF NOT EXISTS mls_sync_status (
    id                SERIAL PRIMARY KEY,
    status            VARCHAR(50) NOT NULL DEFAULT 'idle',
    sync_count        INTEGER DEFAULT 0,
    last_sync_at      TIMESTAMP,
    last_full_sync_at TIMESTAMP,
    created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mls_sync_errors (
    id             SERIAL PRIMARY KEY,
    listing_key    VARCHAR(255),
    error_message  TEXT,
    stage          VARCHAR(100),
    retry_count    INTEGER DEFAULT 0,
    last_retry_at  TIMESTAMP,
    resolved_at    TIMESTAMP,
    occurred_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mls_sync_errors_unresolved ON mls_sync_errors(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mls_sync_errors_listing ON mls_sync_errors(listing_key);
CREATE INDEX IF NOT EXISTS idx_mls_sync_errors_occurred ON mls_sync_errors(occurred_at DESC);

-- ================================================================
-- Note: the schema_audit insert for v14 is executed by
-- run-migration-v14.js (non-fatal if schema_audit is missing).
-- ================================================================
