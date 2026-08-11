const pool = require('../../../config/database');

const POST_COLUMNS = [
  'id', 'agent_id', 'property_id', 'title', 'content', 'media_urls',
  'post_type', 'visibility', 'caption', 'hashtags', 'location',
  'location_lat', 'location_lng', 'is_reel', 'is_story',
  'allows_comments', 'allows_saves', 'mentions', 'tagged_agents',
  'listing_key', 'listing_id', 'like_count', 'comment_count',
  'save_count', 'share_count', 'view_count', 'feed_event_type',
  'market_update_data', 'neighborhood_spotlight_data', 'investment_data',
  'created_at', 'updated_at'
];

const POST_FIELDS = POST_COLUMNS.join(', ');

async function list(agentId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const conditions = ['agent_id = $1'];
  const values = [agentId];
  let idx = 2;

  if (params.post_type) {
    conditions.push(`post_type = $${idx}`);
    values.push(params.post_type);
    idx++;
  }

  if (params.visibility) {
    conditions.push(`visibility = $${idx}`);
    values.push(params.visibility);
    idx++;
  }

  const where = conditions.join(' AND ');
  const sortField = params.sort === 'title' ? 'title' : 'created_at';
  const sortOrder = params.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_posts WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${POST_FIELDS} FROM agent_posts WHERE ${where} ORDER BY ${sortField} ${sortOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    success: true,
    data: rows.map(row => ({
      ...row,
      media_urls: typeof row.media_urls === 'string' ? JSON.parse(row.media_urls) : (row.media_urls || []),
    })),
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
  };
}

async function getById(postId) {
  const { rows } = await pool.query(
    `SELECT ${POST_FIELDS} FROM agent_posts WHERE id = $1`,
    [postId]
  );

  if (!rows.length) return null;

  return {
    ...rows[0],
    media_urls: typeof rows[0].media_urls === 'string' ? JSON.parse(rows[0].media_urls) : (rows[0].media_urls || []),
    hashtags: typeof rows[0].hashtags === 'string' ? JSON.parse(rows[0].hashtags) : (rows[0].hashtags || []),
    mentions: typeof rows[0].mentions === 'string' ? JSON.parse(rows[0].mentions) : (rows[0].mentions || []),
    tagged_agents: typeof rows[0].tagged_agents === 'string' ? JSON.parse(rows[0].tagged_agents) : (rows[0].tagged_agents || []),
  };
}

async function create(agentId, data) {
  const agentCheck = await pool.query(
    `SELECT status FROM agents WHERE id = $1`,
    [agentId]
  );
  if (!agentCheck.rows.length) throw new Error('Agent not found');
  if (agentCheck.rows[0].status !== 'approved') throw new Error('Agent must be approved to create posts');

  const allowed = ['title','content','caption','media_urls','post_type','visibility','property_id','hashtags','location','location_lat','location_lng','is_reel','is_story','allows_comments','allows_saves','mentions','tagged_agents','listing_key','listing_id','feed_event_type','market_update_data','neighborhood_spotlight_data','investment_data'];
  const cols = ['agent_id'];
  const vals = [agentId];
  const phs = ['$1'];
  let idx = 2;

  for (const col of allowed) {
    if (data[col] === undefined || data[col] === null) continue;
    cols.push(col);
    vals.push(data[col]);
    phs.push(`$${idx}`);
    idx++;
  }

  const { rows } = await pool.query(
    `INSERT INTO agent_posts (${cols.join(', ')}) VALUES (${phs.join(', ')}) RETURNING ${POST_FIELDS}`,
    vals
  );

  const post = rows[0];
  const mediaUrls = typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : (post.media_urls || []);

  if (mediaUrls.length > 0) {
    const mediaValues = mediaUrls.map((url, i) => `($1, $${i + 2}, ${i})`).join(', ');
    const mediaParams = [post.id, ...mediaUrls];
    await pool.query(
      `INSERT INTO social_post_media (post_id, media_url, sort_order) VALUES ${mediaValues}`,
      mediaParams
    );
  }

  await pool.query(
    `INSERT INTO feed_events (event_type, agent_id, post_id, listing_key, title, description, media_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      'agent_post',
      agentId,
      post.id,
      post.listing_key || null,
      post.title || '',
      post.caption || '',
      mediaUrls[0] || null,
      JSON.stringify({ post_type: post.post_type, visibility: post.visibility }),
    ]
  );

  return {
    ...post,
    media_urls: mediaUrls,
    hashtags: typeof post.hashtags === 'string' ? JSON.parse(post.hashtags) : (post.hashtags || []),
    mentions: typeof post.mentions === 'string' ? JSON.parse(post.mentions) : (post.mentions || []),
    tagged_agents: typeof post.tagged_agents === 'string' ? JSON.parse(post.tagged_agents) : (post.tagged_agents || []),
  };
}

async function update(postId, agentId, data) {
  const existing = await pool.query(
    `SELECT id FROM agent_posts WHERE id = $1 AND agent_id = $2`,
    [postId, agentId]
  );
  if (!existing.rows.length) throw new Error('Post not found or unauthorized');

  const fields = [];
  const values = [];
  let idx = 1;

  const allowedFields = ['title','content','caption','media_urls','post_type','visibility','property_id','hashtags','location','location_lat','location_lng','is_reel','is_story','allows_comments','allows_saves','mentions','tagged_agents','listing_key','listing_id','feed_event_type','market_update_data','neighborhood_spotlight_data','investment_data'];
  for (const [key, value] of Object.entries(data)) {
    if (!allowedFields.includes(key) || value === undefined) continue;
    if (key === 'media_urls' && Array.isArray(value)) {
      fields.push(`${key} = $${idx}::jsonb`);
      values.push(JSON.stringify(value));
    } else if ((key === 'hashtags' || key === 'mentions' || key === 'tagged_agents') && Array.isArray(value)) {
      fields.push(`${key} = $${idx}::jsonb`);
      values.push(JSON.stringify(value));
    } else {
      fields.push(`${key} = $${idx}`);
      values.push(value);
    }
    idx++;
  }

  if (!fields.length) {
    const { rows } = await pool.query(
      `SELECT ${POST_FIELDS} FROM agent_posts WHERE id = $1`, [postId]
    );
    return rows.length ? rows[0] : null;
  }

  values.push(postId);
  const { rows } = await pool.query(
    `UPDATE agent_posts SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING ${POST_FIELDS}`,
    values
  );

  return {
    ...rows[0],
    media_urls: typeof rows[0].media_urls === 'string' ? JSON.parse(rows[0].media_urls) : (rows[0].media_urls || []),
    hashtags: typeof rows[0].hashtags === 'string' ? JSON.parse(rows[0].hashtags) : (rows[0].hashtags || []),
    mentions: typeof rows[0].mentions === 'string' ? JSON.parse(rows[0].mentions) : (rows[0].mentions || []),
    tagged_agents: typeof rows[0].tagged_agents === 'string' ? JSON.parse(rows[0].tagged_agents) : (rows[0].tagged_agents || []),
  };
}

async function remove(postId, agentId) {
  const result = await pool.query(
    `DELETE FROM agent_posts WHERE id = $1 AND agent_id = $2 RETURNING id`,
    [postId, agentId]
  );
  if (!result.rows.length) throw new Error('Post not found or unauthorized');
  return { deleted: true };
}

async function getStats(agentId) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      post_type,
      COUNT(*)::int AS count
    FROM agent_posts
    WHERE agent_id = $1
    GROUP BY post_type`,
    [agentId]
  );

  const counts = { total: 0 };
  for (const row of rows) {
    counts.total += row.count;
    counts[row.post_type] = row.count;
  }

  return counts;
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getStats,
};
