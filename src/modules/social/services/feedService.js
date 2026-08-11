const pool = require('../../../config/database');

async function getFeed(userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const followedAgentIds = await getFollowedAgentIds(userId);

  // LIMIT=$1 OFFSET=$2, any WHERE params start at $3
  let whereClause;
  let whereParams;
  if (followedAgentIds.length > 0) {
    whereClause = `p.agent_id = ANY($3::uuid[])`;
    whereParams = [followedAgentIds];
  } else {
    const recentAgentIds = await getRecentlyActiveAgentIds(limit);
    if (recentAgentIds.length > 0) {
      whereClause = `p.agent_id = ANY($3::uuid[])`;
      whereParams = [recentAgentIds];
    } else {
      whereClause = `TRUE`;
      whereParams = [];
    }
  }

  const userIdParam = userId ? `$${3 + whereParams.length}` : null;
  const isLikedExpr = userIdParam
    ? `EXISTS(SELECT 1 FROM social_likes WHERE post_id = p.id AND user_id = ${userIdParam}) AS is_liked`
    : `false AS is_liked`;
  const isSavedExpr = userIdParam
    ? `EXISTS(SELECT 1 FROM social_saves WHERE post_id = p.id AND user_id = ${userIdParam}) AS is_saved`
    : `false AS is_saved`;

  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count, COALESCE(s.save_count, 0) AS save_count,
      ${isLikedExpr}, ${isSavedExpr},
      (SELECT json_agg(json_build_object('id', pl.id, 'listing_key', pl.listing_key, 'listing_id', pl.listing_id)) FROM social_post_listings pl WHERE pl.post_id = p.id) AS attached_listings
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS save_count FROM social_saves GROUP BY post_id) s ON s.post_id = p.id
     WHERE p.visibility = 'published' AND p.is_story = FALSE AND ${whereClause}
     ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset, ...whereParams, ...(userId ? [userId] : [])]
  );
  return rows;
}

async function getFollowedAgentIds(userId) {
  if (!userId) return [];
  const { rows } = await pool.query(
    `SELECT following_id FROM social_follows WHERE follower_id = $1 AND following_type = 'agent'`,
    [userId]
  );
  return rows.map(r => r.following_id);
}

async function getRecentlyActiveAgentIds(limit = 20) {
  const { rows } = await pool.query(
    `SELECT agent_id FROM agent_posts WHERE visibility = 'published' AND created_at > NOW() - INTERVAL '7 days' GROUP BY agent_id ORDER BY MAX(created_at) DESC LIMIT $1`,
    [limit]
  );
  return rows.map(r => r.agent_id);
}

async function getExploreContent(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count, COALESCE(s.save_count, 0) AS save_count,
      (SELECT json_agg(json_build_object('id', pl.id, 'listing_key', pl.listing_key, 'listing_id', pl.listing_id)) FROM social_post_listings pl WHERE pl.post_id = p.id) AS attached_listings
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS save_count FROM social_saves GROUP BY post_id) s ON s.post_id = p.id
     WHERE p.visibility = 'published' AND p.is_story = FALSE
     ORDER BY (COALESCE(l.like_count, 0) * 2 + COALESCE(c.comment_count, 0) * 3 + COALESCE(s.save_count, 0) * 1.5) DESC, p.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function getReelsFeed(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     WHERE p.visibility = 'published' AND p.is_reel = TRUE
     ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function searchByHashtag(hashtag, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     WHERE p.visibility = 'published' AND $1 = ANY(p.hashtags)
     ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
    [hashtag.toLowerCase(), limit, offset]
  );
  return rows;
}

async function getTrendingHashtags(limit = 20) {
  const { rows } = await pool.query(
    `SELECT tag, post_count, last_used_at FROM social_hashtags ORDER BY post_count DESC, last_used_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getRecommendedAgents(userId, limit = 10) {
  const followedIds = userId ? await getFollowedAgentIds(userId) : [];
  const excludeIds = followedIds.length > 0 ? followedIds : [];
  const placeholders = excludeIds.map((_, i) => `$${i + 2}`).join(',');
  const query = excludeIds.length > 0
    ? `SELECT a.*, COALESCE(r.avg_rating, 0) AS avg_rating, (SELECT COUNT(*) FROM agent_posts WHERE agent_id = a.id AND visibility = 'published') AS post_count FROM agents a LEFT JOIN (SELECT agent_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating FROM agent_reviews WHERE status = 'approved' GROUP BY agent_id) r ON r.agent_id = a.id WHERE a.status = 'active' AND a.id NOT IN (${placeholders}) ORDER BY COALESCE(r.avg_rating, 0) DESC, a.created_at DESC LIMIT $1`
    : `SELECT a.*, COALESCE(r.avg_rating, 0) AS avg_rating, (SELECT COUNT(*) FROM agent_posts WHERE agent_id = a.id AND visibility = 'published') AS post_count FROM agents a LEFT JOIN (SELECT agent_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating FROM agent_reviews WHERE status = 'approved' GROUP BY agent_id) r ON r.agent_id = a.id WHERE a.status = 'active' ORDER BY COALESCE(r.avg_rating, 0) DESC, a.created_at DESC LIMIT $1`;
  const params = excludeIds.length > 0 ? [limit, ...excludeIds] : [limit];
  const { rows } = await pool.query(query, params);
  return rows;
}

module.exports = {
  getFeed, getExploreContent, getReelsFeed,
  searchByHashtag, getTrendingHashtags, getRecommendedAgents,
  getFollowedAgentIds, getRecentlyActiveAgentIds,
};
