/**
 * Admin Enquiries Service
 *
 * Admin triage over website enquiry records:
 *   - property_management_enquiries (Property Management "Start With Us" form)
 *   - buyer_agent_requests        (Buyer Enquiry form)
 *
 * Enquiries start unassigned (agent_id NULL). Admins can update status and
 * assign an agent. When an enquiry is assigned to an agent, a linked row is
 * upserted into agent_leads (using the existing inquiry_id/inquiry_source
 * pattern) so the enquiry also appears in the agent CRM and the admin Leads
 * screen — never fabricated, always backed by the real enquiry record.
 */

const pool = require('../../../config/database');

const ENQUIRY_SOURCES = new Set(['property_management', 'buyer']);

// Status vocabulary shared with agent_leads admin statuses.
const ALLOWED_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'closed'];

const SOURCE_META = {
  property_management: {
    table: 'property_management_enquiries',
    leadSource: 'property_management',
    leadType: 'property_management',
    inquirySource: 'property_management',
  },
  buyer: {
    table: 'buyer_agent_requests',
    leadSource: 'buyer_enquiry',
    leadType: 'buyer',
    inquirySource: 'buyer_enquiry',
  },
};

function assertSource(source) {
  if (!ENQUIRY_SOURCES.has(source)) {
    throw Object.assign(new Error(`Invalid enquiry source: ${source}`), { statusCode: 400 });
  }
}

/**
 * List enquiries across both sources with optional filters.
 */
async function list(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(parseInt(params.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (params.source) {
    assertSource(params.source);
    conditions.push(`e.source_type = $${idx++}`);
    values.push(params.source);
  }
  if (params.status) {
    conditions.push(`e.status = $${idx++}`);
    values.push(params.status);
  }
  if (params.agentId) {
    conditions.push(`e.agent_id = $${idx++}`);
    values.push(params.agentId);
  }
  if (params.search) {
    const like = `%${String(params.search).replace(/[%_]/g, '')}%`;
    conditions.push(`(e.name ILIKE $${idx} OR e.email ILIKE $${idx} OR e.phone ILIKE $${idx})`);
    values.push(like);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const base = `
    FROM (
      SELECT 'property_management' AS source_type, id, name, email, phone, status, agent_id,
             property_address AS address, property_type, units, message, sms_consent, created_at, updated_at
      FROM property_management_enquiries
      UNION ALL
      SELECT 'buyer' AS source_type, id, name, email, phone, status, agent_id,
             NULL AS address, NULL AS property_type, NULL AS units,
             additional_requirements AS message, sms_consent, created_at, updated_at
      FROM buyer_agent_requests
    ) e
    LEFT JOIN agents a ON a.id = e.agent_id`;

  const { rows } = await pool.query(
    `SELECT e.source_type, e.id, e.name, e.email, e.phone, e.status, e.agent_id,
            e.address, e.property_type, e.units, e.message, e.sms_consent,
            e.created_at, e.updated_at,
            a.full_name AS agent_name, a.email AS agent_email
     ${base}
     ${where}
     ORDER BY e.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...values, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::text AS count ${base} ${where}`,
    values
  );

  const { rows: statusRows } = await pool.query(
    `SELECT source_type, status, COUNT(*)::int AS count
     FROM (
       SELECT 'property_management' AS source_type, status FROM property_management_enquiries
       UNION ALL
       SELECT 'buyer' AS source_type, status FROM buyer_agent_requests
     ) s
     GROUP BY source_type, status
     ORDER BY source_type, status`
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: parseInt(countRows[0].count, 10) || 0,
      pages: Math.max(1, Math.ceil((parseInt(countRows[0].count, 10) || 0) / limit)),
    },
    summary: statusRows,
  };
}

/**
 * Fetch a single enquiry with agent details.
 */
async function getById(source, id) {
  assertSource(source);
  const meta = SOURCE_META[source];
  const { rows } = await pool.query(
    `SELECT e.*, a.full_name AS agent_name, a.email AS agent_email
     FROM ${meta.table} e
     LEFT JOIN agents a ON a.id = e.agent_id
     WHERE e.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Update the status of an enquiry and mirror it to any linked agent lead.
 */
async function updateStatus(source, id, status) {
  assertSource(source);
  if (!ALLOWED_STATUSES.includes(status)) {
    throw Object.assign(new Error('Invalid enquiry status'), { statusCode: 400 });
  }
  const meta = SOURCE_META[source];
  const { rows } = await pool.query(
    `UPDATE ${meta.table} SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status]
  );
  if (!rows[0]) return null;

  // Mirror to the linked agent lead (if one exists from a prior assignment).
  await pool.query(
    `UPDATE agent_leads SET status = $1, updated_at = NOW()
     WHERE inquiry_id = $2 AND inquiry_source = $3`,
    [status, id, meta.inquirySource]
  );

  return rows[0];
}

/**
 * Assign an enquiry to an agent and create/update the linked agent lead.
 */
async function assignAgent(source, id, agentId) {
  assertSource(source);
  const meta = SOURCE_META[source];

  const agent = await pool.query('SELECT id FROM agents WHERE id = $1', [agentId]);
  if (!agent.rows[0]) {
    throw Object.assign(new Error('Agent not found'), { statusCode: 404 });
  }

  const { rows } = await pool.query(
    `UPDATE ${meta.table}
     SET agent_id = $1, assigned_at = COALESCE(assigned_at, NOW()), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [agentId, id]
  );
  if (!rows[0]) return null;

  const enquiry = rows[0];

  // Upsert the linked agent lead so the enquiry appears in the agent CRM
  // and the admin Leads screen. The lead is derived entirely from the real
  // enquiry record.
  const existing = await pool.query(
    'SELECT id FROM agent_leads WHERE inquiry_id = $1 AND inquiry_source = $2',
    [id, meta.inquirySource]
  );

  const leadFields = {
    name: enquiry.name,
    email: enquiry.email,
    phone: enquiry.phone,
    status: enquiry.status || 'new',
  };

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE agent_leads
       SET agent_id = $1, name = $2, email = $3, phone = $4, status = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [agentId, leadFields.name, leadFields.email, leadFields.phone, leadFields.status, existing.rows[0].id]
    );
  } else {
    const notesSummary = source === 'property_management'
      ? `Property management enquiry — ${enquiry.property_type || 'property'}.${enquiry.message ? ` ${enquiry.message}` : ''}`
      : `Buyer enquiry — ${enquiry.additional_requirements || ''}`.trim();
    const listingAddress = source === 'property_management' ? enquiry.property_address : null;
    await pool.query(
      `INSERT INTO agent_leads
        (agent_id, name, email, phone, source, status, lead_type, notes_summary, listing_address, inquiry_id, inquiry_source, first_contacted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT DO NOTHING`,
      [agentId, leadFields.name, leadFields.email, leadFields.phone,
       meta.leadSource, leadFields.status, meta.leadType,
       notesSummary, listingAddress, id, meta.inquirySource]
    );
  }

  return enquiry;
}

module.exports = { list, getById, updateStatus, assignAgent };
