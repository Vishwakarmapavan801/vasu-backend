-- ================================================================
-- v18 Property Management & Buyer Enquiries Migration
--
-- Adds the production enquiry tables used by the website enquiry
-- forms (Property Management "Start With Us" form and the Buyer
-- Enquiry form). Enquiries are stored unassigned (agent_id NULL)
-- and are triaged from the admin panel: status updates and agent
-- assignment are supported directly on the enquiry records.
--
-- All statements are idempotent and safe to re-run.
-- ================================================================

-- ---- property_management_enquiries ---------------------------------
CREATE TABLE IF NOT EXISTS property_management_enquiries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(255) NOT NULL,
    email            VARCHAR(255) NOT NULL,
    phone            VARCHAR(50),
    property_address TEXT,
    property_type    VARCHAR(100),
    units            INTEGER,
    message          TEXT,
    sms_consent      BOOLEAN NOT NULL DEFAULT FALSE,
    status           VARCHAR(50) NOT NULL DEFAULT 'new',
    agent_id         UUID REFERENCES agents(id) ON DELETE SET NULL,
    assigned_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_enquiries_created_at ON property_management_enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_enquiries_status ON property_management_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_pm_enquiries_agent ON property_management_enquiries(agent_id);
CREATE INDEX IF NOT EXISTS idx_pm_enquiries_email ON property_management_enquiries(email);

-- ---- buyer_agent_requests: agent assignment + SMS consent ----------
ALTER TABLE buyer_agent_requests ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE buyer_agent_requests ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE buyer_agent_requests ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_buyer_agent_requests_agent ON buyer_agent_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_buyer_agent_requests_created_at ON buyer_agent_requests(created_at DESC);

-- ---- updated_at triggers (idempotent: drop-if-exists then create) -----
DROP TRIGGER IF EXISTS update_property_management_enquiries_updated_at ON property_management_enquiries;
CREATE TRIGGER update_property_management_enquiries_updated_at BEFORE UPDATE ON property_management_enquiries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_buyer_agent_requests_updated_at ON buyer_agent_requests;
CREATE TRIGGER update_buyer_agent_requests_updated_at BEFORE UPDATE ON buyer_agent_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('property_management_enquiries')
ORDER BY table_name;
