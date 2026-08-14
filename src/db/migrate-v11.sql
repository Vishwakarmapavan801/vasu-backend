-- v11 Production Launch Migration
-- Adds: billing, sync tracking, compliance log, email logs, calendar tokens

-- ============================================================
-- Billing & Subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_invoices (
  id SERIAL PRIMARY KEY,
  stripe_invoice_id VARCHAR(255) UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  invoice_url TEXT,
  invoice_pdf TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_user ON billing_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);

CREATE TABLE IF NOT EXISTS billing_events (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_user ON billing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);

-- ============================================================
-- MLS Sync Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS mls_sync_status (
  id SERIAL PRIMARY KEY,
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  sync_count INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP,
  last_full_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mls_sync_errors (
  id SERIAL PRIMARY KEY,
  listing_key VARCHAR(255),
  error_message TEXT,
  stage VARCHAR(100),
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  resolved_at TIMESTAMP,
  occurred_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mls_sync_errors_unresolved ON mls_sync_errors(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mls_sync_errors_listing ON mls_sync_errors(listing_key);

-- ============================================================
-- MLS Compliance Log
-- ============================================================
CREATE TABLE IF NOT EXISTS mls_compliance_log (
  id SERIAL PRIMARY KEY,
  listing_key VARCHAR(255),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL DEFAULT 'display',
  issues JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'allowed',
  checked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mls_compliance_listing ON mls_compliance_log(listing_key);
CREATE INDEX IF NOT EXISTS idx_mls_compliance_status ON mls_compliance_log(status);
CREATE INDEX IF NOT EXISTS idx_mls_compliance_checked ON mls_compliance_log(checked_at);

-- ============================================================
-- Email Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  recipient VARCHAR(255) NOT NULL,
  template_id VARCHAR(255),
  message_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'sent',
  error_message TEXT,
  metadata JSONB,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);

-- ============================================================
-- Calendar Tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'google',
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  calendar_id VARCHAR(255),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_tokens_user_provider ON calendar_tokens(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_calendar_tokens_expires ON calendar_tokens(expires_at);

-- ============================================================
-- Agent Preferences (extend)
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": false}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS business_hours JSONB;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS service_areas TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/New_York';

-- ============================================================
-- Add stripe_customer_id to users
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ============================================================
-- Add sync tracking columns to properties
-- ============================================================
ALTER TABLE properties ADD COLUMN IF NOT EXISTS mls_updated_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'synced';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_properties_sync_status ON properties(sync_status);
CREATE INDEX IF NOT EXISTS idx_properties_mls_updated ON properties(mls_updated_at);

-- ============================================================
-- Audit Log for Schema Changes
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_audit (
  id SERIAL PRIMARY KEY,
  migration VARCHAR(50) NOT NULL,
  action TEXT NOT NULL,
  table_name VARCHAR(255),
  details JSONB,
  applied_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- API Keys for external integrations
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  permissions JSONB DEFAULT '["read"]',
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- ============================================================
-- Notification Preferences / Devices table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_devices (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_token ON user_devices(device_token);

-- ============================================================
-- Log this migration (INSERT handled by runner)
-- ============================================================
