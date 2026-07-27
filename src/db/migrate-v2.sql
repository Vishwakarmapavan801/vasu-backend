-- ================================================================
-- VASU REALTY - v2 JotForm Sync Queue Migration
-- ================================================================
-- Run: node src/db/run-migration-v2.js
-- ================================================================

-- Ensure pgcrypto extension is available for gen_random_uuid() (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS jotform_sync_queue (
    id                  BIGSERIAL PRIMARY KEY,
    form_type           VARCHAR(100) NOT NULL,
    correlation_id      UUID NOT NULL DEFAULT gen_random_uuid(),
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
    db_record_id        UUID,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 5,
    last_error          TEXT,
    jotform_submission_id VARCHAR(255),
    next_retry_at       TIMESTAMPTZ,
    client_ip           VARCHAR(45),
    user_agent          VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jotform_sync_queue_status ON jotform_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_jotform_sync_queue_next_retry ON jotform_sync_queue(next_retry_at) WHERE status = 'pending' OR status = 'retrying';
CREATE INDEX IF NOT EXISTS idx_jotform_sync_queue_idempotency ON jotform_sync_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_jotform_sync_queue_created ON jotform_sync_queue(created_at DESC);

-- Create helper function if not already present (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger only if it does not already exist (PostgreSQL has no IF NOT EXISTS for triggers)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'update_jotform_sync_queue_updated_at'
          AND event_object_table = 'jotform_sync_queue'
    ) THEN
        CREATE TRIGGER update_jotform_sync_queue_updated_at
            BEFORE UPDATE ON jotform_sync_queue
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
