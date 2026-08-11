const pool = require('../../../config/database');

async function createPost(agentId, data) {
  const { title, caption, content, media_urls, post_type, visibility, hashtags, location, location_lat, location_lng, is_reel, is_story, allows_comments, allows_saves, mentions, tagged_agents, listing_key, listing_id, property_id, listing_address } = data;
  const finalLocation = listing_address || location || null;
  const { rows } = await pool.query(
    `INSERT INTO agent_posts (agent_id, title, caption, content, media_urls, post_type, visibility, hashtags, location, location_lat, location_lng, is_reel, is_story, allows_comments, allows_saves, mentions, tagged_agents, listing_key, listing_id, property_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [agentId, title || '', caption || caption || '', content || '', media_urls || [], post_type || 'property', visibility || 'published', hashtags || [], finalLocation, location_lat || null, location_lng || null, is_reel || false, is_story || false, allows_comments !== false, allows_saves !== false, mentions || [], tagged_agents || [], listing_key || null, listing_id || null, property_id || null]
  );
  const post = rows[0];
  if (hashtags && hashtags.length > 0) {
    for (const tag of hashtags) {
      await pool.query(
        `INSERT INTO social_hashtags (tag) VALUES ($1) ON CONFLICT (tag) DO UPDATE SET post_count = social_hashtags.post_count + 1, last_used_at = NOW()`,
        [tag.toLowerCase()]
      );
    }
  }
  if (listing_key) {
    await pool.query(
      `INSERT INTO social_post_listings (post_id, listing_key, listing_id) VALUES ($1, $2, $3)`,
      [post.id, listing_key, listing_id || null]
    );
  }
  return post;
}

async function updatePost(postId, agentId, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  const allowed = ['title', 'caption', 'content', 'media_urls', 'post_type', 'visibility', 'hashtags', 'location', 'location_lat', 'location_lng', 'is_reel', 'is_story', 'allows_comments', 'allows_saves', 'mentions', 'tagged_agents', 'listing_key', 'listing_id', 'property_id'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(key === 'location_lat' || key === 'location_lng' ? (data[key] || null) : data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = NOW()`);
  values.push(postId, agentId);
  const { rows } = await pool.query(
    `UPDATE agent_posts SET ${fields.join(', ')} WHERE id = $${idx} AND agent_id = $${idx + 1} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function deletePost(postId, agentId) {
  const { rows } = await pool.query(
    `DELETE FROM agent_posts WHERE id = $1 AND agent_id = $2 RETURNING id`,
    [postId, agentId]
  );
  if (rows.length > 0) {
    const hashtags = rows[0].hashtags || [];
    for (const tag of hashtags) {
      await pool.query(
        `UPDATE social_hashtags SET post_count = GREATEST(post_count - 1, 0) WHERE tag = $1`,
        [tag.toLowerCase()]
      );
    }
  }
  return rows.length > 0;
}

async function getPostById(postId, userId) {
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count,
      COALESCE(c.comment_count, 0) AS comment_count,
      COALESCE(s.save_count, 0) AS save_count,
      ${userId ? `EXISTS(SELECT 1 FROM social_likes WHERE post_id = p.id AND user_id = '${userId}') AS is_liked, EXISTS(SELECT 1 FROM social_saves WHERE post_id = p.id AND user_id = '${userId}') AS is_saved,` : 'false AS is_liked, false AS is_saved,'}
      (SELECT json_agg(json_build_object('id', pl.id, 'listing_key', pl.listing_key, 'listing_id', pl.listing_id)) FROM social_post_listings pl WHERE pl.post_id = p.id) AS attached_listings
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS save_count FROM social_saves GROUP BY post_id) s ON s.post_id = p.id
     WHERE p.id = $1 AND p.visibility = 'published'`,
    [postId]
  );
  return rows[0] || null;
}

async function getAgentPosts(agentId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const typeFilter = params.post_type ? ` AND p.post_type = $2` : '';
  const typeParam = params.post_type ? [agentId, params.post_type] : [agentId];
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_posts p WHERE p.agent_id = $1 AND p.visibility = 'published'${typeFilter}`,
    typeParam
  );
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count, COALESCE(s.save_count, 0) AS save_count
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS save_count FROM social_saves GROUP BY post_id) s ON s.post_id = p.id
     WHERE p.agent_id = $1 AND p.visibility = 'published'${typeFilter}
     ORDER BY p.created_at DESC LIMIT $${typeParam.length + 1} OFFSET $${typeParam.length + 2}`,
    [...typeParam, limit, offset]
  );
  return { data: rows, pagination: { total: parseInt(countResult.rows[0]?.total || 0), page, limit, hasMore: offset + rows.length < parseInt(countResult.rows[0]?.total || 0) } };
}

async function likePost(postId, userId) {
  try {
    await pool.query('INSERT INTO social_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, userId]);
    await pool.query('UPDATE agent_posts SET like_count = (SELECT COUNT(*) FROM social_likes WHERE post_id = $1) WHERE id = $1', [postId]);
    const { rows } = await pool.query('SELECT like_count FROM agent_posts WHERE id = $1', [postId]);
    return { liked: true, like_count: rows[0]?.like_count || 0 };
  } catch (e) {
    if (e.code === '23505') {
      const { rows } = await pool.query('SELECT like_count FROM agent_posts WHERE id = $1', [postId]);
      return { liked: true, like_count: rows[0]?.like_count || 0 };
    }
    throw e;
  }
}

async function unlikePost(postId, userId) {
  await pool.query('DELETE FROM social_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
  await pool.query('UPDATE agent_posts SET like_count = (SELECT COUNT(*) FROM social_likes WHERE post_id = $1) WHERE id = $1', [postId]);
  const { rows } = await pool.query('SELECT like_count FROM agent_posts WHERE id = $1', [postId]);
  return { liked: false, like_count: rows[0]?.like_count || 0 };
}

async function isPostLiked(postId, userId) {
  if (!userId) return false;
  const { rows } = await pool.query('SELECT 1 FROM social_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
  return rows.length > 0;
}

async function addComment(postId, userId, data) {
  const { content, parent_id, mentions } = data;
  const { rows } = await pool.query(
    `INSERT INTO social_comments (post_id, user_id, parent_id, content, mentions)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [postId, userId, parent_id || null, content, mentions || []]
  );
  const comment = rows[0];
  if (parent_id) {
    await pool.query('UPDATE social_comments SET reply_count = (SELECT COUNT(*) FROM social_comments WHERE parent_id = $1) WHERE id = $1', [parent_id]);
  }
  await pool.query('UPDATE agent_posts SET comment_count = (SELECT COUNT(*) FROM social_comments WHERE post_id = $1) WHERE id = $1', [postId]);
  const { rows: userRows } = await pool.query('SELECT id, full_name, profile_photo_url FROM users WHERE id = $1', [userId]);
  comment.user = userRows[0] || { id: userId };
  return comment;
}

async function getComments(postId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS total FROM social_comments WHERE post_id = $1 AND parent_id IS NULL', [postId]);
  const { rows } = await pool.query(
    `SELECT c.*, u.full_name AS user_name, u.profile_photo_url AS user_photo,
      COALESCE(cl.like_count, 0) AS like_count,
      (SELECT json_agg(json_build_object('id', r.id, 'content', r.content, 'user_name', ru.full_name, 'user_photo', ru.profile_photo_url, 'created_at', r.created_at, 'like_count', COALESCE(rcl.like_count, 0)) ORDER BY r.created_at ASC)
       FROM social_comments r
       LEFT JOIN users ru ON r.user_id = ru.id
       LEFT JOIN (SELECT comment_id, COUNT(*)::int AS like_count FROM social_comment_likes GROUP BY comment_id) rcl ON rcl.comment_id = r.id
       WHERE r.parent_id = c.id) AS replies
     FROM social_comments c
     JOIN users u ON c.user_id = u.id
     LEFT JOIN (SELECT comment_id, COUNT(*)::int AS like_count FROM social_comment_likes GROUP BY comment_id) cl ON cl.comment_id = c.id
     WHERE c.post_id = $1 AND c.parent_id IS NULL
     ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
    [postId, limit, offset]
  );
  return { data: rows, pagination: { total: parseInt(countRows.rows[0]?.total || 0), page, limit } };
}

async function updateComment(commentId, userId, content) {
  const { rows } = await pool.query(
    `UPDATE social_comments SET content = $1, is_edited = TRUE, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
    [content, commentId, userId]
  );
  return rows[0] || null;
}

async function deleteComment(commentId, userId) {
  const { rows } = await pool.query(
    `DELETE FROM social_comments WHERE id = $1 AND user_id = $2 RETURNING post_id, parent_id`,
    [commentId, userId]
  );
  if (rows.length > 0) {
    const { post_id, parent_id } = rows[0];
    if (parent_id) {
      await pool.query('UPDATE social_comments SET reply_count = (SELECT COUNT(*) FROM social_comments WHERE parent_id = $1) WHERE id = $1', [parent_id]);
    }
    await pool.query('UPDATE agent_posts SET comment_count = (SELECT COUNT(*) FROM social_comments WHERE post_id = $1) WHERE id = $1', [post_id]);
  }
  return rows.length > 0;
}

async function likeComment(commentId, userId) {
  try {
    await pool.query('INSERT INTO social_comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, userId]);
    await pool.query('UPDATE social_comments SET like_count = (SELECT COUNT(*) FROM social_comment_likes WHERE comment_id = $1) WHERE id = $1', [commentId]);
    return { liked: true };
  } catch (e) {
    if (e.code === '23505') return { liked: true };
    throw e;
  }
}

async function unlikeComment(commentId, userId) {
  await pool.query('DELETE FROM social_comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);
  await pool.query('UPDATE social_comments SET like_count = (SELECT COUNT(*) FROM social_comment_likes WHERE comment_id = $1) WHERE id = $1', [commentId]);
  return { liked: false };
}

async function savePost(postId, userId) {
  try {
    await pool.query('INSERT INTO social_saves (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, userId]);
    await pool.query('UPDATE agent_posts SET save_count = (SELECT COUNT(*) FROM social_saves WHERE post_id = $1) WHERE id = $1', [postId]);
    return { saved: true };
  } catch (e) {
    if (e.code === '23505') return { saved: true };
    throw e;
  }
}

async function unsavePost(postId, userId) {
  await pool.query('DELETE FROM social_saves WHERE post_id = $1 AND user_id = $2', [postId, userId]);
  await pool.query('UPDATE agent_posts SET save_count = (SELECT COUNT(*) FROM social_saves WHERE post_id = $1) WHERE id = $1', [postId]);
  return { saved: false };
}

async function isPostSaved(postId, userId) {
  if (!userId) return false;
  const { rows } = await pool.query('SELECT 1 FROM social_saves WHERE post_id = $1 AND user_id = $2', [postId, userId]);
  return rows.length > 0;
}

async function getSavedPosts(userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS total FROM social_saves WHERE user_id = $1', [userId]);
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count, COALESCE(s.save_count, 0) AS save_count,
      true AS is_saved
     FROM social_saves sv
     JOIN agent_posts p ON sv.post_id = p.id
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS save_count FROM social_saves GROUP BY post_id) s ON s.post_id = p.id
     WHERE sv.user_id = $1 AND p.visibility = 'published'
     ORDER BY sv.created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { data: rows, pagination: { total: parseInt(countRows.rows[0]?.total || 0), page, limit } };
}

async function follow(followerId, followingType, followingId) {
  try {
    await pool.query(
      `INSERT INTO social_follows (follower_id, following_type, following_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [followerId, followingType, followingId]
    );
    return { following: true };
  } catch (e) {
    if (e.code === '23505') return { following: true };
    throw e;
  }
}

async function unfollow(followerId, followingType, followingId) {
  await pool.query(
    `DELETE FROM social_follows WHERE follower_id = $1 AND following_type = $2 AND following_id = $3`,
    [followerId, followingType, followingId]
  );
  return { following: false };
}

async function isFollowing(followerId, followingType, followingId) {
  if (!followerId) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_type = $2 AND following_id = $3',
    [followerId, followingType, followingId]
  );
  return rows.length > 0;
}

async function getFollowerCount(followingType, followingId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM social_follows WHERE following_type = $1 AND following_id = $2',
    [followingType, followingId]
  );
  return rows[0]?.count || 0;
}

async function getFollowingCount(followerId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM social_follows WHERE follower_id = $1',
    [followerId]
  );
  return rows[0]?.count || 0;
}

async function getFollowers(followingType, followingId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.profile_photo_url, sf.created_at AS followed_at
     FROM social_follows sf JOIN users u ON sf.follower_id = u.id
     WHERE sf.following_type = $1 AND sf.following_id = $2
     ORDER BY sf.created_at DESC LIMIT $3 OFFSET $4`,
    [followingType, followingId, limit, offset]
  );
  return rows;
}

async function getFollowing(followerId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT sf.following_id, sf.following_type, sf.created_at AS followed_at,
      a.full_name, a.profile_photo_url, a.is_verified
     FROM social_follows sf
     LEFT JOIN agents a ON sf.following_type = 'agent' AND sf.following_id = a.id
     WHERE sf.follower_id = $1
     ORDER BY sf.created_at DESC LIMIT $2 OFFSET $3`,
    [followerId, limit, offset]
  );
  return rows;
}

async function getAgentByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM agents WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

async function getTrendingPosts(limit = 20) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count, COALESCE(s.save_count, 0) AS save_count
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS save_count FROM social_saves GROUP BY post_id) s ON s.post_id = p.id
     WHERE p.visibility = 'published' AND p.created_at >= $1
     ORDER BY (COALESCE(l.like_count, 0) * 2 + COALESCE(c.comment_count, 0) * 3 + COALESCE(s.save_count, 0)) DESC
     LIMIT $2`,
    [sevenDaysAgo, limit]
  );
  return rows;
}

async function searchPosts(query, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const searchTerm = `%${query}%`;
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo, a.is_verified AS agent_verified,
      COALESCE(l.like_count, 0) AS like_count, COALESCE(c.comment_count, 0) AS comment_count, COALESCE(s.save_count, 0) AS save_count
     FROM agent_posts p
     JOIN agents a ON p.agent_id = a.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM social_likes GROUP BY post_id) l ON l.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM social_comments GROUP BY post_id) c ON c.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*) AS save_count FROM social_saves GROUP BY post_id) s ON s.post_id = p.id
     WHERE p.visibility = 'published'
       AND (p.caption ILIKE $1 OR p.title ILIKE $1 OR $2 = ANY(p.hashtags) OR p.location ILIKE $1)
     ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
    [searchTerm, query.toLowerCase(), limit, offset]
  );
  return rows;
}

async function incrementShareCount(postId) {
  await pool.query('UPDATE agent_posts SET share_count = share_count + 1 WHERE id = $1', [postId]);
}

async function createStory(agentId, data) {
  const { media_url, media_type, thumbnail_url, caption } = data;
  const { rows } = await pool.query(
    `INSERT INTO social_stories (agent_id, media_url, media_type, thumbnail_url, caption)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [agentId, media_url, media_type || 'image', thumbnail_url || null, caption || null]
  );
  return rows[0];
}

async function getActiveStories(agentIds) {
  if (!agentIds || agentIds.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT s.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo
     FROM social_stories s
     JOIN agents a ON s.agent_id = a.id
     WHERE s.agent_id = ANY($1::uuid[]) AND s.expires_at > NOW()
     ORDER BY s.created_at DESC`,
    [agentIds]
  );
  return rows;
}

async function viewStory(storyId, userId) {
  await pool.query(
    'INSERT INTO social_story_views (story_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [storyId, userId]
  );
  await pool.query('UPDATE social_stories SET view_count = (SELECT COUNT(*) FROM social_story_views WHERE story_id = $1) WHERE id = $1', [storyId]);
}

async function createAgentAccount(userId, data) {
  const existingAgent = await getAgentByUserId(userId);
  if (existingAgent) return existingAgent;
  const { full_name, company_name, license_number, phone, email, city, state, experience_years, bio, languages, specialties, areas_served, website, instagram, facebook, linkedin, profile_photo_url, designation, office_address, country, zip_code } = data;
  const { rows } = await pool.query(
    `INSERT INTO agents (user_id, full_name, company_name, license_number, phone, email, city, state, country, zip_code, experience_years, bio, languages, specialties, areas_served, website, instagram, facebook, linkedin, profile_photo_url, designation, office_address, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [userId, full_name || '', company_name || '', license_number || '', phone || '', email || '', city || '', state || '', country || 'US', zip_code || '', parseInt(experience_years) || 0, bio || '', languages || ['English'], specialties || [], areas_served || [], website || '', instagram || '', facebook || '', linkedin || '', profile_photo_url || '', designation || '', office_address || '', 'active']
  );
  return rows[0];
}

module.exports = {
  createPost, updatePost, deletePost, getPostById, getAgentPosts,
  likePost, unlikePost, isPostLiked,
  addComment, getComments, updateComment, deleteComment, likeComment, unlikeComment,
  savePost, unsavePost, isPostSaved, getSavedPosts,
  follow, unfollow, isFollowing, getFollowerCount, getFollowingCount, getFollowers, getFollowing,
  getAgentByUserId, getTrendingPosts, searchPosts, incrementShareCount,
  createStory, getActiveStories, viewStory,
  createAgentAccount,
};
