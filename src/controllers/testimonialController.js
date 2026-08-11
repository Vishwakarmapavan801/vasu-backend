const pool = require('../config/database');

async function getTestimonials(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 6, 20);
    const { rows } = await pool.query(
      `SELECT r.id, r.reviewer_name, r.rating, r.title, r.review,
              r.verified_purchase, r.helpful_count, r.is_approved, r.created_at,
              a.name AS agent_name, a.profile_image AS agent_image
       FROM agent_reviews r
       LEFT JOIN agents a ON a.id::text = r.agent_id::text
       WHERE r.is_approved = true AND r.is_featured = true
       ORDER BY r.helpful_count DESC, r.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTestimonials };
