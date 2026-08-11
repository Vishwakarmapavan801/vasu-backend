const pool = require('../../../config/database');
const mlsService = require('../../../services/mlsService');

async function getDashboard(agentId, userId) {
  const mlsMemberId = await getAgentMlsId(agentId);

  const [stats, reviews, tours, followers, views, listedProperties, soldProperties] = await Promise.all([
    getStats(agentId),
    getReviews(agentId),
    getTourStats(agentId),
    getFollowerCount(agentId),
    getProfileViews(agentId),
    mlsMemberId ? getMlsListings(mlsMemberId, 'Active') : Promise.resolve([]),
    mlsMemberId ? getMlsListings(mlsMemberId, 'Sold') : Promise.resolve([]),
  ]);

  const activeListings = listedProperties.length;
  const soldListings = soldProperties.length;
  const totalVolume = soldProperties.reduce((sum, p) => sum + (p.ClosePrice || p.ListPrice || 0), 0);

  const recentActivity = await getRecentActivity(agentId);
  const savedCount = await getSavedListingsCount(agentId);
  const totalInquiries = await getTotalInquiries(agentId);
  const totalViews = views;

  return {
    agent: { id: agentId },
    active_listings: activeListings,
    sold_listings: soldListings,
    total_views: totalViews,
    total_inquiries: totalInquiries,
    total_saved: savedCount,
    tour_requests: tours.total,
    profile_views: views,
    total_volume: totalVolume,
    leads: tours.total + totalInquiries,
    average_rating: stats.avgRating,
    review_count: stats.totalReviews,
    follower_count: followers,
    recent_activity: recentActivity,
    listings: listedProperties.slice(0, 10),
    sold: soldProperties.slice(0, 10),
  };
}

async function getDashboardAnalytics(agentId, period) {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : period === '1y' ? 365 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [viewsByDay, inquiriesByDay, toursByDay, topListings, conversionRate] = await Promise.all([
    getViewsByDay(agentId, since),
    getInquiriesByDay(agentId, since),
    getToursByDay(agentId, since),
    getTopListings(agentId),
    getConversionRate(agentId, since),
  ]);

  return {
    period,
    days,
    views: viewsByDay,
    inquiries: inquiriesByDay,
    tours: toursByDay,
    topListings,
    conversionRate,
    totalViews: viewsByDay.reduce((s, d) => s + d.count, 0),
    totalInquiries: inquiriesByDay.reduce((s, d) => s + d.count, 0),
    totalTours: toursByDay.reduce((s, d) => s + d.count, 0),
  };
}

async function getAgentMlsId(agentId) {
  const { rows } = await pool.query(
    'SELECT license_number FROM agents WHERE id = $1',
    [agentId]
  );
  return rows.length ? rows[0].license_number : null;
}

async function getStats(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'approved')::int AS total_reviews,
      COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS avg_rating
    FROM agent_reviews WHERE agent_id = $1`,
    [agentId]
  );
  return rows[0] || { total_reviews: 0, avg_rating: 0 };
}

async function getReviews(agentId) {
  const { rows } = await pool.query(
    `SELECT r.*, u.name AS user_name, u.name AS user_photo
     FROM agent_reviews r LEFT JOIN users u ON r.user_id = u.id
     WHERE r.agent_id = $1 AND r.status = 'approved'
     ORDER BY r.created_at DESC LIMIT 5`,
    [agentId]
  );
  return rows;
}

async function getTourStats(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
    FROM agent_tour_requests WHERE agent_id = $1`,
    [agentId]
  );
  return rows[0] || { total: 0, pending: 0, confirmed: 0, completed: 0 };
}

async function getFollowerCount(agentId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM agent_followers WHERE agent_id = $1',
    [agentId]
  );
  return rows[0].count;
}

async function getProfileViews(agentId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM agent_profile_views WHERE agent_id = $1',
    [agentId]
  );
  return rows[0].count;
}

async function getMlsListings(mlsMemberId, status) {
  if (!mlsService) return [];
  try {
    const statusFilter = status ? `%20and%20MlsStatus%20eq%20'${encodeURIComponent(status)}'` : '';
    const url = `${process.env.MLS_GRID_BASE_URL || 'https://api-demo.mlsgrid.com/v2'}/Property?$filter=ListAgentMlsId%20eq%20'${encodeURIComponent(mlsMemberId)}'${statusFilter}&$top=50`;
    const response = await mlsService.fetchWithRetry(url);
    if (response && response.value) {
      return response.value.map(item => mlsService.normalizeProperty(item));
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function getRecentActivity(agentId) {
  const { rows } = await pool.query(
    `SELECT activity_type, description, listing_key, created_at
     FROM agent_activity_log WHERE agent_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [agentId]
  );
  return rows;
}

async function getSavedListingsCount(agentId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_listing_meta WHERE agent_id = $1 AND featured = true`,
    [agentId]
  );
  return rows[0].count;
}

async function getTotalInquiries(agentId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM agent_listing_inquiries WHERE agent_id = $1',
    [agentId]
  );
  return rows[0].count;
}

async function getViewsByDay(agentId, since) {
  const { rows } = await pool.query(
    `SELECT DATE(viewed_at) AS date, COUNT(*)::int AS count
     FROM agent_listing_views WHERE agent_id = $1 AND viewed_at >= $2
     GROUP BY DATE(viewed_at) ORDER BY date`,
    [agentId, since]
  );
  return rows;
}

async function getInquiriesByDay(agentId, since) {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
     FROM agent_listing_inquiries WHERE agent_id = $1 AND created_at >= $2
     GROUP BY DATE(created_at) ORDER BY date`,
    [agentId, since]
  );
  return rows;
}

async function getToursByDay(agentId, since) {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
     FROM agent_tour_requests WHERE agent_id = $1 AND created_at >= $2
     GROUP BY DATE(created_at) ORDER BY date`,
    [agentId, since]
  );
  return rows;
}

async function getTopListings(agentId) {
  const { rows } = await pool.query(
    `SELECT listing_key, listing_id, COUNT(*)::int AS view_count
     FROM agent_listing_views WHERE agent_id = $1
     GROUP BY listing_key, listing_id
     ORDER BY view_count DESC LIMIT 10`,
    [agentId]
  );
  return rows;
}

async function getConversionRate(agentId, since) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total_inquiries,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
    FROM agent_listing_inquiries WHERE agent_id = $1 AND created_at >= $2`,
    [agentId, since]
  );
  const r = rows[0];
  return {
    totalInquiries: r.total_inquiries,
    completed: r.completed,
    rate: r.total_inquiries > 0 ? Math.round((r.completed / r.total_inquiries) * 100) : 0,
  };
}

module.exports = {
  getDashboard,
  getDashboardAnalytics,
};
