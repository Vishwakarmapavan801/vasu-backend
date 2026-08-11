const pool = require('../../../config/database');

const POST_COLUMNS = [
  'id', 'agent_id', 'title', 'content', 'excerpt', 'featured_image_url',
  'post_type', 'visibility', 'tags', 'published_at', 'is_pinned',
  'like_count', 'comment_count', 'share_count', 'created_at', 'updated_at'
];

const POST_FIELDS = POST_COLUMNS.join(', ');

function rowToPost(row) {
  if (!row) return null;
  return {
    ...row,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
  };
}

async function findByAgentId(agentId, params = {}) {
  const { page = 1, limit = 10, postType, visibility } = params;
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [agentId];
  let idx = 2;

  conditions.push('agent_id = $1');

  if (postType) {
    conditions.push(`post_type = $${idx}`);
    values.push(postType);
    idx++;
  }

  if (visibility) {
    conditions.push(`visibility = $${idx}`);
    values.push(visibility);
    idx++;
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_posts WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${POST_FIELDS} FROM agent_posts WHERE ${where} ORDER BY is_pinned DESC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    success: true,
    data: rows.map(rowToPost),
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
  };
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${POST_FIELDS} FROM agent_posts WHERE id = $1`,
    [id]
  );
  return rowToPost(rows[0] || null);
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO agent_posts (
      agent_id, title, content, excerpt, featured_image_url,
      post_type, visibility, tags, published_at, is_pinned
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING ${POST_FIELDS}`,
    [
      data.agent_id,
      data.title,
      data.content,
      data.excerpt || null,
      data.featured_image_url || null,
      data.post_type || 'article',
      data.visibility || 'public',
      data.tags ? JSON.stringify(data.tags) : JSON.stringify([]),
      data.published_at || (data.post_type === 'published' ? new Date().toISOString() : null),
      data.is_pinned || false,
    ]
  );
  return rowToPost(rows[0]);
}

async function update(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!POST_COLUMNS.includes(key) || key === 'id' || key === 'agent_id' || key === 'created_at' || key === 'updated_at') continue;
    if (value === undefined) continue;

    if (key === 'tags' && Array.isArray(value)) {
      fields.push(`${key} = $${idx}::jsonb`);
      values.push(JSON.stringify(value));
    } else {
      fields.push(`${key} = $${idx}`);
      values.push(value);
    }
    idx++;
  }

  if (!fields.length) return findById(id);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE agent_posts SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING ${POST_FIELDS}`,
    values
  );
  return rowToPost(rows[0] || null);
}

async function deletePost(id) {
  const { rows } = await pool.query(
    `DELETE FROM agent_posts WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

async function countByAgentId(agentId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_posts WHERE agent_id = $1`,
    [agentId]
  );
  return rows[0].count;
}

module.exports = {
  findByAgentId,
  findById,
  create,
  update,
  delete: deletePost,
  countByAgentId,
};
