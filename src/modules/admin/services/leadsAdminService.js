/**
 * Admin Leads (CRM) Service
 *
 * Read-only + light admin actions over agent_leads. Admins can triage,
 * re-assign to an agent, and review notes/tasks — the CRM itself stays
 * agent-owned. Everything is real agent_leads / lead_notes / lead_tasks data.
 */

const pool = require('../../../config/database');

async function list(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(parseInt(params.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (params.status) {
    conditions.push(`l.status = $${idx++}`);
    values.push(params.status);
  }
  if (params.source) {
    conditions.push(`l.source = $${idx++}`);
    values.push(params.source);
  }
  if (params.leadType) {
    conditions.push(`l.lead_type = $${idx++}`);
    values.push(params.leadType);
  }
  if (params.agentId) {
    conditions.push(`l.agent_id = $${idx++}`);
    values.push(params.agentId);
  }
  if (params.search) {
    const like = `%${String(params.search).replace(/[%_]/g, '')}%`;
    conditions.push(`(l.name ILIKE $${idx} OR l.email ILIKE $${idx} OR l.phone ILIKE $${idx} OR l.listing_address ILIKE $${idx})`);
    values.push(like);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT l.id, l.agent_id, l.user_id, l.name, l.email, l.phone, l.source, l.status,
            l.lead_type, l.budget_min, l.budget_max, l.property_type, l.city_interest,
            l.bedrooms_min, l.bathrooms_min, l.notes_summary, l.listing_key, l.listing_address,
            l.first_contacted_at, l.last_contacted_at, l.converted_at, l.closed_at, l.created_at, l.updated_at,
            a.full_name AS agent_name
     FROM agent_leads l
     LEFT JOIN agents a ON a.id = l.agent_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...values, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::text AS count FROM agent_leads l ${where}`,
    values
  );

  const { rows: statusRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM agent_leads GROUP BY status`
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

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT l.*, a.full_name AS agent_name, a.email AS agent_email
     FROM agent_leads l
     LEFT JOIN agents a ON a.id = l.agent_id
     WHERE l.id = $1`,
    [id]
  );
  const lead = rows[0];
  if (!lead) return null;

  const notes = await pool.query(
    `SELECT n.id, n.content, n.note_type, n.created_at, n.updated_at, a.full_name AS agent_name
     FROM lead_notes n LEFT JOIN agents a ON a.id = n.agent_id
     WHERE n.lead_id = $1 ORDER BY n.created_at DESC`,
    [id]
  );
  lead.notes = notes.rows;

  const tasks = await pool.query(
    `SELECT t.id, t.title, t.description, t.task_type, t.priority, t.status, t.due_at, t.completed_at, t.created_at
     FROM lead_tasks t WHERE t.lead_id = $1 ORDER BY t.created_at DESC`,
    [id]
  );
  lead.tasks = tasks.rows;

  return lead;
}

async function updateStatus(id, status, adminId) {
  const allowed = ['new', 'contacted', 'qualified', 'converted', 'closed'];
  if (!allowed.includes(status)) {
    throw Object.assign(new Error('Invalid lead status'), { statusCode: 400 });
  }
  const timestamps = status === 'converted' ? 'converted_at = NOW()' : status === 'closed' ? 'closed_at = NOW()' : '';
  const setClause = [`status = $2`, `updated_at = NOW()`];
  if (timestamps) setClause.push(timestamps);
  const { rows } = await pool.query(
    `UPDATE agent_leads SET ${setClause.join(', ')} WHERE id = $1 RETURNING id, status, converted_at, closed_at`,
    [id, status]
  );
  return rows[0] || null;
}

async function reassign(id, agentId, adminId) {
  const agent = await pool.query('SELECT id FROM agents WHERE id = $1', [agentId]);
  if (!agent.rows[0]) {
    throw Object.assign(new Error('Agent not found'), { statusCode: 404 });
  }
  const { rows } = await pool.query(
    `UPDATE agent_leads SET agent_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, agent_id`,
    [agentId, id]
  );
  return rows[0] || null;
}

module.exports = { list, getById, updateStatus, reassign };
