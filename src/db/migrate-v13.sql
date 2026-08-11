-- v13 Google OAuth Migration
-- Adds Google sign-in support:
--   users.google_id        — the Google account ID (unique per account)
--   password_hash nullable — Google-created accounts have no password
-- Also completes the users schema expected by authController.js
--   users.email_verified_at — declared in migrate-v5.sql but missing on some databases

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);

-- Partial unique index: Google accounts are unique, while email/password users keep NULL (multiple NULLs allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Google-only accounts sign in through Google, not a password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Existing auth code references this column (register auto-verify, verify-email, resend-verification, dev-login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
