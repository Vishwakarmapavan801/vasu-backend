const pool = require('../../../config/database');

const REVIEW_COLUMNS = [
  'id', 'agent_id', 'user_id', 'property_id', 'rating', 'review_text',
  'verified_transaction', 'status', 'created_at', 'updated_at'
];

const REVIEW_FIELDS = REVIEW_COLUMNS.join(', ');

async function list(agentId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 10));
  const offset = (page - 1) * limit;
  const conditions = ['agent_id = $1'];
  const values = [agentId];
  let idx = 2;

  if (params.status) {
    conditions.push(`r.status = $${idx}`);
    values.push(params.status);
    idx++;
  }

  if (params.rating) {
    conditions.push(`r.rating = $${idx}`);
    values.push(parseInt(params.rating, 10));
    idx++;
  }

  const where = conditions.join(' AND ');
  const sortField = params.sort === 'rating' ? 'r.rating' : 'r.created_at';
  const sortOrder = params.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_reviews r WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT r.${REVIEW_FIELDS},
      u.full_name AS user_name,
      u.profile_photo_url AS user_photo
     FROM agent_reviews r
     LEFT JOIN users u ON r.user_id = u.id
     WHERE ${where}
     ORDER BY ${sortField} ${sortOrder}
     LIMIT $${idx} OFFSET $${idx + 1}`,
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

async function create(userId, data) {
  const existing = await pool.query(
    `SELECT id FROM agent_reviews WHERE agent_id = $1 AND user_id = $2 AND user_id IS NOT NULL`,
    [data.agent_id, userId]
  );
  if (existing.rows.length > 0) {
    throw new Error('You have already reviewed this agent');
  }

  const { rows } = await pool.query(
    `INSERT INTO agent_reviews (agent_id, user_id, property_id, rating, review_text, verified_transaction, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING ${REVIEW_FIELDS}`,
    [
      data.agent_id, userId, data.property_id || null,
      data.rating, data.review_text, data.verified_transaction || false
    ]
  );
  return rows[0];
}

async function update(reviewId, userId, data) {
  const existing = await pool.query(
    `SELECT id FROM agent_reviews WHERE id = $1 AND user_id = $2`,
    [reviewId, userId]
  );
  if (!existing.rows.length) throw new Error('Review not found or unauthorized');

  const fields = [];
  const values = [];
  let idx = 1;

  if (data.rating !== undefined) {
    fields.push(`rating = $${idx}`);
    values.push(data.rating);
    idx++;
  }
  if (data.review_text !== undefined) {
    fields.push(`review_text = $${idx}`);
    values.push(data.review_text);
    idx++;
  }
  if (data.verified_transaction !== undefined) {
    fields.push(`verified_transaction = $${idx}`);
    values.push(data.verified_transaction);
    idx++;
  }

  if (!fields.length) return existing.rows[0];

  values.push(reviewId);
  const { rows } = await pool.query(
    `UPDATE agent_reviews SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING ${REVIEW_FIELDS}`,
    values
  );
  return rows[0];
}

async function remove(reviewId, userId) {
  const result = await pool.query(
    `DELETE FROM agent_reviews WHERE id = $1 AND user_id = $2 RETURNING id`,
    [reviewId, userId]
  );
  if (!result.rows.length) throw new Error('Review not found or unauthorized');
  return { deleted: true };
}

async function getStats(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total_reviews,
      COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS avg_rating,
      COUNT(*) FILTER (WHERE rating = 5)::int AS five_star,
      COUNT(*) FILTER (WHERE rating = 4)::int AS four_star,
      COUNT(*) FILTER (WHERE rating = 3)::int AS three_star,
      COUNT(*) FILTER (WHERE rating = 2)::int AS two_star,
      COUNT(*) FILTER (WHERE rating = 1)::int AS one_star
    FROM agent_reviews
    WHERE agent_id = $1 AND status = 'approved'`,
    [agentId]
  );

  const stats = rows[0];
  return {
    totalReviews: stats.total_reviews,
    avgRating: parseFloat(stats.avg_rating) || 0,
    distribution: {
      5: stats.five_star,
      4: stats.four_star,
      3: stats.three_star,
      2: stats.two_star,
      1: stats.one_star,
    },
  };
}

module.exports = {
  list,
  create,
  update,
  remove,
  getStats,
};
