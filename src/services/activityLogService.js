const pool = require('../config/database');

async function findByUserId(userId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM user_activity_log WHERE user_id = $1',
    [userId]
  );
  const total = countResult.rows[0].total;

  const result = await pool.query(
    `SELECT * FROM user_activity_log WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return { activities: result.rows, pagination: { page, limit, total } };
}

async function log(userId, activityType, description, listingKey = null, metadata = {}) {
  const result = await pool.query(
    `INSERT INTO user_activity_log (user_id, activity_type, description, listing_key, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, activityType, description, listingKey, JSON.stringify(metadata)]
  );
  return result.rows[0];
}

module.exports = { findByUserId, log };
