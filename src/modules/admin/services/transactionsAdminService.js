/**
 * Admin Transactions Service
 *
 * Read/update surface for the closing-workflow tables created by migration v10:
 *  - transactions (offer → accepted → inspection → closing)
 *  - transaction_milestones (per-transaction checklist)
 *
 * Older DB lineages (pre-v10) may not have these tables — the service degrades
 * gracefully with `tablesAvailable: false` instead of throwing 500s.
 */

const pool = require('../../../config/database');

const CHECK_QUERY = `
  SELECT to_regclass('public.transactions') IS NOT NULL AS transactions,
         to_regclass('public.transaction_milestones') IS NOT NULL AS milestones
`;

let availabilityCache = null;
let availabilityCheckedAt = 0;
const AVAILABILITY_TTL_MS = 60_000;

async function availability() {
  if (availabilityCache && Date.now() - availabilityCheckedAt < AVAILABILITY_TTL_MS) {
    return availabilityCache;
  }
  const { rows } = await pool.query(CHECK_QUERY);
  availabilityCache = {
    transactions: !!rows[0].transactions,
    milestones: !!rows[0].milestones,
  };
  availabilityCheckedAt = Date.now();
  return availabilityCache;
}

async function assertAvailable() {
  const avail = await availability();
  if (!avail.transactions) {
    throw Object.assign(new Error('Transactions table is not available on this database lineage'), {
      statusCode: 404,
    });
  }
  return avail;
}

async function list({ status, agentId, search, limit = 50, offset = 0 }) {
  const avail = await availability();
  if (!avail.transactions) {
    return { success: true, transactions: [], total: 0, tablesAvailable: false };
  }

  const where = [];
  const params = [];
  let p = 1;

  if (status) {
    where.push(`t.status = $${p++}`);
    params.push(status);
  }
  if (agentId) {
    where.push(`t.agent_id = $${p++}`);
    params.push(agentId);
  }
  if (search && search.trim()) {
    where.push(
      `(t.listing_key ILIKE $${p} OR t.title_company ILIKE $${p} OR a.name ILIKE $${p} OR u.email ILIKE $${p})`
    );
    params.push(`%${search.trim()}%`);
    p++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRes = await pool.query(
    `SELECT COUNT(*)::text AS total
     FROM transactions t
     LEFT JOIN agents a ON a.id = t.agent_id
     LEFT JOIN users u ON u.id = t.buyer_id
     ${whereSql}`,
    params
  );

  const listRes = await pool.query(
    `SELECT t.id, t.transaction_type, t.offer_price, t.accepted_price,
            t.commission, t.commission_pct, t.status, t.listing_key,
            t.closing_date, t.possession_date, t.created_at, t.updated_at,
            a.name AS agent_name,
            u.email AS buyer_email
     FROM transactions t
     LEFT JOIN agents a ON a.id = t.agent_id
     LEFT JOIN users u ON u.id = t.buyer_id
     ${whereSql}
     ORDER BY t.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limit, offset]
  );

  const statusRes = await pool.query(
    `SELECT status, COUNT(*)::text AS count
     FROM transactions GROUP BY status`
  );

  const byStatus = {};
  for (const row of statusRes.rows) {
    byStatus[row.status] = parseInt(row.count, 10) || 0;
  }

  return {
    success: true,
    transactions: listRes.rows,
    total: parseInt(countRes.rows[0].total, 10) || 0,
    byStatus,
    tablesAvailable: true,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
  };
}

async function getById(id) {
  const avail = await assertAvailable();

  const { rows } = await pool.query(
    `SELECT t.*,
            a.name AS agent_name,
            a.email AS agent_email,
            b.email AS buyer_email,
            b.name AS buyer_name,
            s.email AS seller_email,
            s.name AS seller_name,
            l.name AS lead_name,
            l.phone AS lead_phone
     FROM transactions t
     LEFT JOIN agents a ON a.id = t.agent_id
     LEFT JOIN users b ON b.id = t.buyer_id
     LEFT JOIN users s ON s.id = t.seller_id
     LEFT JOIN agent_leads l ON l.id = t.lead_id
     WHERE t.id = $1`,
    [id]
  );

  if (!rows[0]) {
    throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
  }

  const transaction = rows[0];

  let milestones = [];
  if (avail.milestones) {
    const milestoneRes = await pool.query(
      `SELECT id, milestone_type, title, description, due_date, completed_at,
              is_automated, created_at
       FROM transaction_milestones
       WHERE transaction_id = $1
       ORDER BY due_date ASC NULLS LAST, created_at ASC`,
      [id]
    );
    milestones = milestoneRes.rows;
  }

  return { success: true, transaction: { ...transaction, milestones } };
}

async function updateStatus(id, status, adminId) {
  await assertAvailable();

  const allowed = [
    'offer', 'accepted', 'under_contract', 'inspection',
    'appraisal', 'financing', 'closing', 'closed', 'cancelled',
  ];
  if (!allowed.includes(status)) {
    throw Object.assign(new Error(`Invalid transaction status: ${status}`), { statusCode: 400 });
  }

  const { rows } = await pool.query(
    `UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
    [status, id]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
  }

  return { success: true, id, status };
}

async function addMilestone(transactionId, { milestoneType, title, description, dueDate }, adminId) {
  const avail = await assertAvailable();
  if (!avail.milestones) {
    throw Object.assign(new Error('transaction_milestones table is not available on this lineage'), {
      statusCode: 404,
    });
  }
  if (!title || !title.trim()) {
    throw Object.assign(new Error('Milestone title is required'), { statusCode: 400 });
  }

  const { rows } = await pool.query(
    `INSERT INTO transaction_milestones
       (transaction_id, milestone_type, title, description, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, milestone_type, title, description, due_date, completed_at, created_at`,
    [transactionId, milestoneType || 'custom', title.trim(), description || null, dueDate || null]
  );

  return { success: true, milestone: rows[0] };
}

async function updateMilestone(id, { title, description, dueDate, completed }) {
  const avail = await assertAvailable();
  if (!avail.milestones) {
    throw Object.assign(new Error('transaction_milestones table is not available on this lineage'), {
      statusCode: 404,
    });
  }

  const completedAt = completed ? new Date() : null;
  const { rows } = await pool.query(
    `UPDATE transaction_milestones
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         due_date = COALESCE($3, due_date),
         completed_at = COALESCE($4, completed_at)
     WHERE id = $5
     RETURNING id, milestone_type, title, description, due_date, completed_at`,
    [title || null, description ?? null, dueDate ?? null, completedAt, id]
  );

  if (!rows[0]) {
    throw Object.assign(new Error('Milestone not found'), { statusCode: 404 });
  }
  return { success: true, milestone: rows[0] };
}

async function deleteMilestone(id) {
  const avail = await assertAvailable();
  if (!avail.milestones) {
    throw Object.assign(new Error('transaction_milestones table is not available on this lineage'), {
      statusCode: 404,
    });
  }
  const { rows } = await pool.query(
    'DELETE FROM transaction_milestones WHERE id = $1 RETURNING id',
    [id]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Milestone not found'), { statusCode: 404 });
  }
  return { success: true };
}

module.exports = {
  list,
  getById,
  updateStatus,
  addMilestone,
  updateMilestone,
  deleteMilestone,
};
