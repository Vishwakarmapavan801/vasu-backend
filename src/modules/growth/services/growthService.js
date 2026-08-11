const pool = require('../../../config/database');

// ================================================================
// SUGGESTED AGENTS
// ================================================================
async function getSuggestedAgents(userId, query = {}) {
  const { limit = 20, offset = 0 } = query;
  const { rows } = await pool.query(
    `SELECT sa.*, a.name AS agent_name, a.email AS agent_email, a.phone AS agent_phone,
            a.average_rating, a.total_reviews, a.total_listings_active, a.cover_photo_url, a.office_name,
            a.service_areas
     FROM suggested_agents sa
     JOIN agents a ON sa.agent_id = a.id
     WHERE sa.user_id = $1 AND sa.is_dismissed = FALSE
     ORDER BY sa.score DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { data: rows, limit, offset };
}

async function createSuggestedAgent(userId, agentId, score, reason) {
  const { rows } = await pool.query(
    `INSERT INTO suggested_agents (user_id, agent_id, score, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING RETURNING *`,
    [userId, agentId, score, reason]
  );
  return rows[0] || null;
}

async function dismissSuggestedAgent(userId, id) {
  const { rows } = await pool.query(
    `UPDATE suggested_agents SET is_dismissed = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

async function clickSuggestedAgent(userId, id) {
  const { rows } = await pool.query(
    `UPDATE suggested_agents SET clicked_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

// ================================================================
// SUGGESTED LISTINGS
// ================================================================
async function getSuggestedListings(userId, query = {}) {
  const { limit = 20, offset = 0 } = query;
  const { rows } = await pool.query(
    `SELECT sl.* FROM suggested_listings sl
     WHERE sl.user_id = $1 AND sl.is_dismissed = FALSE
     ORDER BY sl.score DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { data: rows, limit, offset };
}

async function createSuggestedListing(userId, listingKey, score, reason) {
  const { rows } = await pool.query(
    `INSERT INTO suggested_listings (user_id, listing_key, score, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING RETURNING *`,
    [userId, listingKey, score, reason]
  );
  return rows[0] || null;
}

async function dismissSuggestedListing(userId, id) {
  const { rows } = await pool.query(
    `UPDATE suggested_listings SET is_dismissed = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

// ================================================================
// FEED SCORES
// ================================================================
async function getFeedScores(query = {}) {
  const { limit = 50, offset = 0 } = query;
  const { rows } = await pool.query(
    `SELECT fs.*, ap.title AS post_title, ap.caption, ap.media_urls, ap.post_type, ap.like_count, ap.comment_count, ap.created_at AS post_created_at
     FROM feed_scores fs
     JOIN agent_posts ap ON fs.post_id = ap.id
     ORDER BY fs.score DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { data: rows, limit, offset };
}

async function upsertFeedScore(postId, score, signals = {}) {
  const { rows } = await pool.query(
    `INSERT INTO feed_scores (post_id, score, recency_score, engagement_score, relevance_score, agent_score, signals)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (post_id) DO UPDATE SET
       score = EXCLUDED.score,
       recency_score = EXCLUDED.recency_score,
       engagement_score = EXCLUDED.engagement_score,
       relevance_score = EXCLUDED.relevance_score,
       agent_score = EXCLUDED.agent_score,
       signals = EXCLUDED.signals,
       computed_at = NOW()
     RETURNING *`,
    [postId, score, signals.recency_score || 0, signals.engagement_score || 0, signals.relevance_score || 0, signals.agent_score || 0, JSON.stringify(signals)]
  );
  return rows[0];
}

async function computeFeedScores() {
  await pool.query(`
    INSERT INTO feed_scores (post_id, score, recency_score, engagement_score, agent_score, signals, computed_at)
    SELECT
      ap.id,
      (
        COALESCE(EXTRACT(EPOCH FROM ap.created_at) / 86400, 0) * 0.3 +
        COALESCE(ap.like_count + ap.comment_count * 2 + ap.save_count * 3 + ap.share_count * 4, 0) * 0.4 +
        CASE WHEN a.verification_status = 'verified' THEN 10 ELSE 0 END * 0.2 +
        CASE WHEN ap.created_at > NOW() - INTERVAL '7 days' THEN 20 ELSE 0 END * 0.1
      ) AS score,
      GREATEST(0, 100 - EXTRACT(EPOCH FROM NOW() - ap.created_at) / 86400) AS recency_score,
      COALESCE(ap.like_count + ap.comment_count * 2 + ap.save_count * 3, 0) AS engagement_score,
      CASE WHEN ap.created_at > NOW() - INTERVAL '7 days' THEN 20 ELSE 0 END AS relevance_score,
      CASE WHEN a.verification_status = 'verified' THEN 10 ELSE 0 END AS agent_score,
      jsonb_build_object(
        'post_age_days', EXTRACT(EPOCH FROM NOW() - ap.created_at) / 86400,
        'total_engagement', COALESCE(ap.like_count + ap.comment_count, 0),
        'agent_verified', a.verification_status = 'verified'
      ) AS signals,
      NOW()
    FROM agent_posts ap
    JOIN agents a ON ap.agent_id = a.id
    ON CONFLICT (post_id) DO UPDATE SET
      score = EXCLUDED.score,
      recency_score = EXCLUDED.recency_score,
      engagement_score = EXCLUDED.engagement_score,
      relevance_score = EXCLUDED.relevance_score,
      agent_score = EXCLUDED.agent_score,
      signals = EXCLUDED.signals,
      computed_at = NOW()
  `);
  return { success: true, message: 'Feed scores recomputed' };
}

module.exports = {
  getSuggestedAgents, createSuggestedAgent, dismissSuggestedAgent, clickSuggestedAgent,
  getSuggestedListings, createSuggestedListing, dismissSuggestedListing,
  getFeedScores, upsertFeedScore, computeFeedScores,
};
