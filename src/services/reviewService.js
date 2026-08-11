const pool = require('../config/database');

const REVIEW_FIELDS = [
  'id', 'agent_id', 'user_id', 'reviewer_name', 'reviewer_email',
  'rating', 'title', 'review', 'verified_purchase', 'is_featured',
  'is_approved', 'helpful_count', 'status', 'created_at', 'updated_at'
].join(', ');

async function findByAgentId(agentId, params = {}) {
  const {
    page = 1, limit = 10, sort = 'created_at', order = 'desc',
    rating, status = 'approved'
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
    conditions.push(`rating = $${idx}`);
    values.push(parseInt(rating, 10));
    idx++;
  }

  const where = conditions.join(' AND ');
  const allowedSort = ['created_at', 'rating', 'helpful_count'].includes(sort) ? sort : 'created_at';
  const allowedOrder = order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM agent_reviews WHERE ${where}`, values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const { rows } = await pool.query(
    `SELECT ${REVIEW_FIELDS} FROM agent_reviews WHERE ${where} ORDER BY ${allowedSort} ${allowedOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  const ratingResult = await pool.query(
    `SELECT
      COUNT(*)::int AS total_reviews,
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*) FILTER (WHERE rating = 5)::int AS five_star,
      COUNT(*) FILTER (WHERE rating = 4)::int AS four_star,
      COUNT(*) FILTER (WHERE rating = 3)::int AS three_star,
      COUNT(*) FILTER (WHERE rating = 2)::int AS two_star,
      COUNT(*) FILTER (WHERE rating = 1)::int AS one_star
    FROM agent_reviews WHERE agent_id = $1 AND status = 'approved'`,
    [agentId]
  );

  return {
    success: true,
    data: rows,
    ratingSummary: ratingResult.rows[0] || {},
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
  };
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO agent_reviews (
      agent_id, user_id, reviewer_name, reviewer_email,
      rating, title, review, verified_purchase
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING ${REVIEW_FIELDS}`,
    [
      data.agent_id, data.user_id || null,
      data.reviewer_name, data.reviewer_email || null,
      data.rating, data.title || null, data.review,
      data.verified_purchase || false,
    ]
  );
  return rows[0];
}

async function markHelpful(reviewId) {
  const { rows } = await pool.query(
    `UPDATE agent_reviews SET helpful_count = helpful_count + 1 WHERE id = $1 RETURNING helpful_count`,
    [reviewId]
  );
  return rows.length ? rows[0].helpful_count : null;
}

async function moderate(reviewId, status) {
  const allowed = ['approved', 'rejected', 'pending'];
  if (!allowed.includes(status)) return null;
  const { rows } = await pool.query(
    `UPDATE agent_reviews SET status = $1, is_approved = $2 WHERE id = $3 RETURNING ${REVIEW_FIELDS}`,
    [status, status === 'approved', reviewId]
  );
  return rows.length ? rows[0] : null;
}

module.exports = {
  findByAgentId,
  create,
  markHelpful,
  moderate,
};
