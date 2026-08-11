const pool = require('../config/database');

async function findByUserId(userId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1',
    [userId]
  );
  const total = countResult.rows[0].total;

  const result = await pool.query(
    `SELECT * FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return { notifications: result.rows, pagination: { page, limit, total } };
}

async function getUnreadCount(userId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return result.rows[0].count;
}

async function create(userId, data) {
  const { type, title, message, link, listing_key, image_url } = data;
  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, link, listing_key, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, type, title, message || '', link || '', listing_key || '', image_url || '']
  );
  return result.rows[0];
}

async function markRead(id, userId) {
  const result = await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  return result.rows[0] || null;
}

async function markAllRead(userId) {
  await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
}

async function remove(id, userId) {
  const result = await pool.query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rows.length > 0;
}

module.exports = { findByUserId, getUnreadCount, create, markRead, markAllRead, remove };
