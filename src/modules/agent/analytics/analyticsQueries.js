const pool = require('../../../config/database');

async function getProfileViewsOverTime(agentId, days = 30) {
  const { rows } = await pool.query(
    `SELECT
      DATE(created_at) AS date,
      COUNT(*)::int AS count
    FROM agent_profile_views
    WHERE agent_id = $1
      AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY date ASC`,
    [agentId, String(days)]
  );
  return rows;
}

async function getTourRequestsOverTime(agentId, days = 30) {
  const { rows } = await pool.query(
    `SELECT
      DATE(created_at) AS date,
      COUNT(*)::int AS count
    FROM agent_tour_requests
    WHERE agent_id = $1
      AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY date ASC`,
    [agentId, String(days)]
  );
  return rows;
}

async function getReviewGrowth(agentId, days = 30) {
  const { rows } = await pool.query(
    `SELECT
      DATE(created_at) AS date,
      COUNT(*)::int AS count
    FROM agent_reviews
    WHERE agent_id = $1
      AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY date ASC`,
    [agentId, String(days)]
  );
  return rows;
}

async function getFollowerGrowth(agentId, days = 30) {
  const { rows } = await pool.query(
    `SELECT
      DATE(created_at) AS date,
      COUNT(*)::int AS count
    FROM agent_followers
    WHERE agent_id = $1
      AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY date ASC`,
    [agentId, String(days)]
  );
  return rows;
}

async function getPostEngagement(agentId, days = 30) {
  const { rows } = await pool.query(
    `SELECT
      DATE(p.created_at) AS date,
      COUNT(*)::int AS total_posts,
      COUNT(*) FILTER (WHERE sp.id IS NOT NULL)::int AS saves
    FROM agent_posts p
    LEFT JOIN agent_saved_posts sp ON sp.post_id = p.id
    WHERE p.agent_id = $1
      AND p.created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE(p.created_at)
    ORDER BY date ASC`,
    [agentId, String(days)]
  );
  return rows.map(r => ({
    date: r.date,
    count: r.total_posts,
    saves: r.saves,
  }));
}

async function getNeighborhoodPerformance(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COALESCE(city, 'Unknown') AS neighborhood,
      COUNT(*)::int AS total_listings,
      COUNT(*) FILTER (WHERE status IS NOT NULL AND LOWER(status) = 'sold')::int AS sold_listings
    FROM agent_listings
    WHERE agent_id = $1
    GROUP BY city
    ORDER BY total_listings DESC`,
    [agentId]
  );

  if (!rows.length) {
    const { rows: fallback } = await pool.query(
      `SELECT
        COALESCE(city, 'Unknown') AS neighborhood,
        COUNT(*)::int AS total_listings
      FROM agents
      WHERE id = $1 AND city IS NOT NULL
      GROUP BY city`,
      [agentId]
    );
    return fallback.map(r => ({
      neighborhood: r.neighborhood,
      totalListings: r.total_listings,
      soldListings: r.sold_listings || 0,
    }));
  }

  return rows.map(r => ({
    neighborhood: r.neighborhood,
    totalListings: r.total_listings,
    soldListings: r.sold_listings,
  }));
}

async function getLeadSources(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COALESCE(source, 'direct') AS source,
      COUNT(*)::int AS count
    FROM agent_tour_requests
    WHERE agent_id = $1
    GROUP BY source
    ORDER BY count DESC`,
    [agentId]
  );

  if (!rows.length) {
    return [
      { source: 'direct', count: 0 },
    ];
  }

  return rows;
}

async function getConversionRate(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total_requests,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      CASE
        WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*)) * 100, 1)
        ELSE 0
      END AS conversion_rate
    FROM agent_tour_requests
    WHERE agent_id = $1`,
    [agentId]
  );

  return {
    totalRequests: rows[0].total_requests,
    completed: rows[0].completed,
    conversionRate: parseFloat(rows[0].conversion_rate) || 0,
  };
}

module.exports = {
  getProfileViewsOverTime,
  getTourRequestsOverTime,
  getReviewGrowth,
  getFollowerGrowth,
  getPostEngagement,
  getNeighborhoodPerformance,
  getLeadSources,
  getConversionRate,
};
