const pool = require('../../../config/database');

const TOUR_COLUMNS = [
  'id', 'agent_id', 'user_id', 'name', 'email', 'phone',
  'preferred_date', 'preferred_time', 'alternate_date', 'alternate_time',
  'property_address', 'property_id', 'message', 'status', 'created_at', 'updated_at'
];

const TOUR_FIELDS = TOUR_COLUMNS.join(', ');

async function findByAgentId(agentId, params = {}) {
  const { page = 1, limit = 20, status } = params;
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [agentId];
  let idx = 2;

  conditions.push('agent_id = $1');

  if (status) {
    conditions.push(`status = $${idx}`);
    values.push(status);
    idx++;
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_tour_requests WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${TOUR_FIELDS} FROM agent_tour_requests WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
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

async function findByUserId(userId, params = {}) {
  const { page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_tour_requests WHERE user_id = $1`,
    [userId]
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${TOUR_FIELDS} FROM agent_tour_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
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

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${TOUR_FIELDS} FROM agent_tour_requests WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO agent_tour_requests (
      agent_id, user_id, name, email, phone,
      preferred_date, preferred_time, alternate_date, alternate_time,
      property_address, property_id, message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING ${TOUR_FIELDS}`,
    [
      data.agent_id,
      data.user_id || null,
      data.name,
      data.email,
      data.phone || null,
      data.preferred_date,
      data.preferred_time,
      data.alternate_date || null,
      data.alternate_time || null,
      data.property_address || null,
      data.property_id || null,
      data.message || null,
    ]
  );
  return rows[0];
}

async function updateStatus(id, status) {
  const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid tour status. Allowed: ${allowed.join(', ')}`);
  }
  const { rows } = await pool.query(
    `UPDATE agent_tour_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING ${TOUR_FIELDS}`,
    [status, id]
  );
  return rows[0] || null;
}

async function countByAgentId(agentId, status) {
  const conditions = ['agent_id = $1'];
  const values = [agentId];

  if (status) {
    conditions.push('status = $2');
    values.push(status);
  }

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_tour_requests WHERE ${conditions.join(' AND ')}`,
    values
  );
  return rows[0].count;
}

module.exports = {
  findByAgentId,
  findByUserId,
  findById,
  create,
  updateStatus,
  countByAgentId,
};
