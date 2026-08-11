const pool = require('../config/database');

// ================================================================
// Property History
// ================================================================

async function getPropertyHistory(listingKey, params = {}) {
  const { page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM property_history WHERE listing_key = $1`,
    [listingKey]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const { rows } = await pool.query(
    `SELECT * FROM property_history WHERE listing_key = $1 ORDER BY change_date DESC LIMIT $2 OFFSET $3`,
    [listingKey, limit, offset]
  );

  return {
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: offset + limit < total },
  };
}

async function addPropertyHistory(data) {
  const { rows } = await pool.query(
    `INSERT INTO property_history (listing_key, listing_id, event_type, previous_value, new_value, description, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.listing_key, data.listing_id, data.event_type, data.previous_value, data.new_value, data.description, data.source || 'mls']
  );
  return rows[0];
}

// ================================================================
// Recently Viewed
// ================================================================

async function getRecentlyViewed(userId, params = {}) {
  const { page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM recently_viewed WHERE user_id = $1`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const { rows } = await pool.query(
    `SELECT * FROM recently_viewed WHERE user_id = $1 ORDER BY viewed_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: offset + limit < total },
  };
}

async function addRecentlyViewed(userId, listingKey, listingId, propertyData) {
  await pool.query(
    `INSERT INTO recently_viewed (user_id, listing_key, listing_id, property_data, viewed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, listing_key)
     DO UPDATE SET viewed_at = NOW(), property_data = COALESCE($4, recently_viewed.property_data)`,
    [userId, listingKey, listingId, propertyData ? JSON.stringify(propertyData) : null]
  );
  return { success: true };
}

async function clearRecentlyViewed(userId) {
  await pool.query(`DELETE FROM recently_viewed WHERE user_id = $1`, [userId]);
  return { success: true };
}

// ================================================================
// Property Comparisons
// ================================================================

async function getComparisons(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM property_comparisons WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return { success: true, data: rows };
}

async function createComparison(userId, name) {
  const { rows } = await pool.query(
    `INSERT INTO property_comparisons (user_id, name) VALUES ($1, $2) RETURNING *`,
    [userId, name || 'My Comparison']
  );
  return { success: true, data: rows[0] };
}

async function addToComparison(comparisonId, userId, listingKey, listingId, propertySnapshot) {
  const existing = await pool.query(
    `SELECT * FROM property_comparisons WHERE id = $1 AND user_id = $2`,
    [comparisonId, userId]
  );
  if (!existing.rows.length) return { success: false, error: 'Comparison not found' };

  const current = existing.rows[0];
  const listings = current.listings || [];
  const alreadyExists = listings.some(l => l.listingKey === listingKey);
  if (alreadyExists) return { success: true, data: current };

  const entry = { listingKey, listingId, snapshot: propertySnapshot || {}, addedAt: new Date().toISOString() };
  listings.push(entry);

  const { rows } = await pool.query(
    `UPDATE property_comparisons SET listings = $1::jsonb WHERE id = $2 RETURNING *`,
    [JSON.stringify(listings), comparisonId]
  );
  return { success: true, data: rows[0] };
}

async function removeFromComparison(comparisonId, userId, listingKey) {
  const existing = await pool.query(
    `SELECT * FROM property_comparisons WHERE id = $1 AND user_id = $2`,
    [comparisonId, userId]
  );
  if (!existing.rows.length) return { success: false, error: 'Comparison not found' };

  const current = existing.rows[0];
  const listings = (current.listings || []).filter(l => l.listingKey !== listingKey);

  const { rows } = await pool.query(
    `UPDATE property_comparisons SET listings = $1::jsonb WHERE id = $2 RETURNING *`,
    [JSON.stringify(listings), comparisonId]
  );
  return { success: true, data: rows[0] };
}

async function deleteComparison(comparisonId, userId) {
  const { rowCount } = await pool.query(
    `DELETE FROM property_comparisons WHERE id = $1 AND user_id = $2`,
    [comparisonId, userId]
  );
  return { success: rowCount > 0 };
}

module.exports = {
  getPropertyHistory,
  addPropertyHistory,
  getRecentlyViewed,
  addRecentlyViewed,
  clearRecentlyViewed,
  getComparisons,
  createComparison,
  addToComparison,
  removeFromComparison,
  deleteComparison,
};
