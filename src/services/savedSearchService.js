const pool = require('../config/database');

async function findByUserId(userId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM saved_searches WHERE user_id = $1',
    [userId]
  );
  const total = countResult.rows[0].total;

  const result = await pool.query(
    `SELECT id, user_id, name, search_params, notify_on_new, notify_on_price_change,
            frequency, last_match_count, last_notified_at, is_active, created_at, updated_at
     FROM saved_searches WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    searches: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

async function findById(id, userId) {
  const result = await pool.query(
    'SELECT * FROM saved_searches WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0] || null;
}

async function create(userId, data) {
  const { name, search_params, notify_on_new, notify_on_price_change, frequency } = data;
  const result = await pool.query(
    `INSERT INTO saved_searches (user_id, name, search_params, notify_on_new, notify_on_price_change, frequency)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, name || 'My Search', JSON.stringify(search_params || {}),
     notify_on_new !== false, notify_on_price_change === true, frequency || 'realtime']
  );
  return result.rows[0];
}

async function update(id, userId, data) {
  const { name, search_params, notify_on_new, notify_on_price_change, frequency, is_active } = data;
  const updates = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
  if (search_params !== undefined) { updates.push(`search_params = $${idx++}`); values.push(JSON.stringify(search_params)); }
  if (notify_on_new !== undefined) { updates.push(`notify_on_new = $${idx++}`); values.push(notify_on_new); }
  if (notify_on_price_change !== undefined) { updates.push(`notify_on_price_change = $${idx++}`); values.push(notify_on_price_change); }
  if (frequency !== undefined) { updates.push(`frequency = $${idx++}`); values.push(frequency); }
  if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
  if (updates.length === 0) return null;
  values.push(id, userId);
  const result = await pool.query(
    `UPDATE saved_searches SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function remove(id, userId) {
  const result = await pool.query(
    'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rows.length > 0;
}

module.exports = { findByUserId, findById, create, update, remove };
