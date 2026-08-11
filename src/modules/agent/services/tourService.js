const pool = require('../../../config/database');

const TOUR_COLUMNS = [
  'id', 'agent_id', 'property_id', 'user_id', 'name', 'email', 'phone',
  'preferred_date', 'preferred_time', 'message', 'status', 'created_at', 'updated_at'
];

const TOUR_FIELDS = TOUR_COLUMNS.join(', ');

async function listByAgent(agentId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const conditions = ['agent_id = $1'];
  const values = [agentId];
  let idx = 2;

  if (params.status) {
    conditions.push(`status = $${idx}`);
    values.push(params.status);
    idx++;
  }

  const where = conditions.join(' AND ');
  const sortOrder = params.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_tour_requests WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${TOUR_FIELDS} FROM agent_tour_requests WHERE ${where} ORDER BY created_at ${sortOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    success: true,
    data: rows,
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
  };
}

async function listByUser(userId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const conditions = ['user_id = $1'];
  const values = [userId];
  let idx = 2;

  if (params.status) {
    conditions.push(`status = $${idx}`);
    values.push(params.status);
    idx++;
  }

  const where = conditions.join(' AND ');
  const sortOrder = params.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_tour_requests WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${TOUR_FIELDS} FROM agent_tour_requests WHERE ${where} ORDER BY created_at ${sortOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    success: true,
    data: rows,
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
  };
}

async function request(data) {
  const { rows } = await pool.query(
    `INSERT INTO agent_tour_requests (agent_id, property_id, user_id, name, email, phone, preferred_date, preferred_time, message, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING ${TOUR_FIELDS}`,
    [
      data.agent_id, data.property_id || null, data.user_id || null,
      data.name, data.email, data.phone || null,
      data.preferred_date, data.preferred_time, data.message || null
    ]
  );
  return rows[0];
}

async function updateStatus(tourId, agentId, status) {
  const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${allowed.join(', ')}`);
  }

  const existing = await pool.query(
    `SELECT id FROM agent_tour_requests WHERE id = $1 AND agent_id = $2`,
    [tourId, agentId]
  );
  if (!existing.rows.length) throw new Error('Tour request not found or unauthorized');

  const { rows } = await pool.query(
    `UPDATE agent_tour_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING ${TOUR_FIELDS}`,
    [status, tourId]
  );
  return rows[0];
}

async function getStats(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
    FROM agent_tour_requests
    WHERE agent_id = $1`,
    [agentId]
  );

  return rows[0] || { total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
}

module.exports = {
  listByAgent,
  listByUser,
  request,
  updateStatus,
  getStats,
};
