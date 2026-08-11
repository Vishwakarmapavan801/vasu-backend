const pool = require('../../../config/database');
const mlsService = require('../../../services/mlsService');

function getDateRange(period) {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : period === '1y' ? 365 : 30;
  return { days, since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() };
}

async function getOverview(agentId) {
  const { since } = getDateRange('30d');
  const [views, inquiries, tours, reviews, followers, listingViews] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM agent_profile_views WHERE agent_id = $1', [agentId]),
    pool.query('SELECT COUNT(*)::int AS count FROM agent_listing_inquiries WHERE agent_id = $1', [agentId]),
    pool.query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
      FROM agent_tour_requests WHERE agent_id = $1`, [agentId]),
    pool.query(`SELECT
      COUNT(*)::int AS total,
      COALESCE(ROUND(AVG(rating)::numeric,1),0) AS avg_rating
      FROM agent_reviews WHERE agent_id = $1 AND status = 'approved'`, [agentId]),
    pool.query('SELECT COUNT(*)::int AS count FROM agent_followers WHERE agent_id = $1', [agentId]),
    pool.query('SELECT COUNT(*)::int AS count FROM agent_listing_views WHERE agent_id = $1', [agentId]),
  ]);

  return {
    profile_views: views.rows[0].count,
    listing_views: listingViews.rows[0].count,
    total_inquiries: inquiries.rows[0].count,
    tours: tours.rows[0],
    reviews: reviews.rows[0],
    followers: followers.rows[0].count,
  };
}

async function getViewsAnalytics(agentId, period) {
  const { days, since } = getDateRange(period);

  const [profileViews, listingViews] = await Promise.all([
    pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
       FROM agent_profile_views WHERE agent_id = $1 AND created_at >= $2
       GROUP BY DATE(created_at) ORDER BY date`,
      [agentId, since]
    ),
    pool.query(
      `SELECT DATE(viewed_at) AS date, COUNT(*)::int AS count
       FROM agent_listing_views WHERE agent_id = $1 AND viewed_at >= $2
       GROUP BY DATE(viewed_at) ORDER BY date`,
      [agentId, since]
    ),
  ]);

  return { days, profile_views: profileViews.rows, listing_views: listingViews.rows, total_profile_views: profileViews.rows.reduce((s, r) => s + r.count, 0), total_listing_views: listingViews.rows.reduce((s, r) => s + r.count, 0) };
}

async function getInquiryAnalytics(agentId, period) {
  const { days, since } = getDateRange(period);
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
     FROM agent_listing_inquiries WHERE agent_id = $1 AND created_at >= $2
     GROUP BY DATE(created_at) ORDER BY date`,
    [agentId, since]
  );
  return { days, data: rows, total: rows.reduce((s, r) => s + r.count, 0) };
}

async function getTourAnalytics(agentId, period) {
  const { days, since } = getDateRange(period);
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS date, COUNT(*)::int AS count,
     COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
     COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM agent_tour_requests WHERE agent_id = $1 AND created_at >= $2
     GROUP BY DATE(created_at) ORDER BY date`,
    [agentId, since]
  );
  return { days, data: rows, total: rows.reduce((s, r) => s + r.count, 0) };
}

async function getConversionAnalytics(agentId, period) {
  const { days, since } = getDateRange(period);
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total_inquiries,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
    FROM agent_listing_inquiries WHERE agent_id = $1 AND created_at >= $2`,
    [agentId, since]
  );
  const r = rows[0];
  return {
    days,
    total_inquiries: r.total_inquiries,
    completed: r.completed,
    pending: r.pending,
    conversion_rate: r.total_inquiries > 0 ? Math.round((r.completed / r.total_inquiries) * 100) : 0,
  };
}

async function getTopPerformers(agentId) {
  const { rows } = await pool.query(
    `SELECT v.listing_key, v.listing_id, v.view_count,
      COALESCE(i.inquiry_count, 0) AS inquiry_count
    FROM (
      SELECT listing_key, listing_id, COUNT(*)::int AS view_count
      FROM agent_listing_views WHERE agent_id = $1
      GROUP BY listing_key, listing_id
      ORDER BY view_count DESC LIMIT 10
    ) v
    LEFT JOIN (
      SELECT listing_key, COUNT(*)::int AS inquiry_count
      FROM agent_listing_inquiries WHERE agent_id = $1
      GROUP BY listing_key
    ) i ON v.listing_key = i.listing_key
    ORDER BY v.view_count DESC`,
    [agentId, agentId]
  );
  return rows;
}

module.exports = {
  getOverview,
  getViewsAnalytics,
  getInquiryAnalytics,
  getTourAnalytics,
  getConversionAnalytics,
  getTopPerformers,
};
