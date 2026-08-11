const pool = require('../../../config/database');

const REVIEW_COLUMNS = [
  'id', 'agent_id', 'user_id', 'reviewer_name', 'reviewer_email',
  'rating', 'title', 'review_text', 'is_verified_purchase',
  'is_featured', 'helpful_count', 'status', 'created_at', 'updated_at'
];

const REVIEW_FIELDS = REVIEW_COLUMNS.join(', ');

async function findByAgentId(agentId, params = {}) {
  const {
    page = 1, limit = 10, sort = 'created_at', order = 'desc',
    rating, status
  } = params;
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

  if (rating) {
    const ratings = Array.isArray(rating) ? rating : [rating];
    const placeholders = ratings.map(r => `$${idx++}`).join(', ');
    conditions.push(`rating IN (${placeholders})`);
    values.push(...ratings);
  }

  const where = conditions.join(' AND ');
  const allowedSort = ['created_at', 'rating', 'helpful_count'].includes(sort) ? sort : 'created_at';
  const allowedOrder = order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_reviews WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${REVIEW_FIELDS} FROM agent_reviews WHERE ${where} ORDER BY ${allowedSort} ${allowedOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
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

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${REVIEW_FIELDS} FROM agent_reviews WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO agent_reviews (
      agent_id, user_id, reviewer_name, reviewer_email,
      rating, title, review_text, is_verified_purchase
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING ${REVIEW_FIELDS}`,
    [
      data.agent_id,
      data.user_id || null,
      data.reviewer_name,
      data.reviewer_email || null,
      data.rating,
      data.title || null,
      data.review_text,
      data.is_verified_purchase || false,
    ]
  );
  return rows[0];
}

async function update(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!REVIEW_COLUMNS.includes(key) || key === 'id' || key === 'agent_id' || key === 'user_id' || key === 'created_at' || key === 'updated_at') continue;
    if (value === undefined) continue;
    fields.push(`${key} = $${idx}`);
    values.push(value);
    idx++;
  }

  if (!fields.length) return findById(id);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE agent_reviews SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING ${REVIEW_FIELDS}`,
    values
  );
  return rows[0] || null;
}

async function deleteReview(id) {
  const { rows } = await pool.query(
    `DELETE FROM agent_reviews WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

async function getAverageRating(agentId) {
  const { rows } = await pool.query(
    `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating FROM agent_reviews WHERE agent_id = $1 AND status = 'approved'`,
    [agentId]
  );
  return rows[0] && rows[0].avg_rating ? parseFloat(rows[0].avg_rating) : 0;
}

async function getReviewCount(agentId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_reviews WHERE agent_id = $1 AND status = 'approved'`,
    [agentId]
  );
  return rows[0].count;
}

async function getRatingDistribution(agentId) {
  const { rows } = await pool.query(
    `SELECT
      rating,
      COUNT(*)::int AS count
     FROM agent_reviews
     WHERE agent_id = $1 AND status = 'approved'
     GROUP BY rating
     ORDER BY rating DESC`,
    [agentId]
  );

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) {
    distribution[row.rating] = row.count;
  }
  return distribution;
}

module.exports = {
  findByAgentId,
  findById,
  create,
  update,
  delete: deleteReview,
  getAverageRating,
  getReviewCount,
  getRatingDistribution,
};
