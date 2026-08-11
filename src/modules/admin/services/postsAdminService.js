/**
 * Admin Posts Service
 *
 * Moderation surface for agent posts (articles, reels, stories, market
 * updates). Agents own their content; admins can review, hide/unhide,
 * or remove it. All data is real agent_posts rows.
 */

const pool = require('../../../config/database');

async function list(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(parseInt(params.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (params.visibility) {
    conditions.push(`p.visibility = $${idx++}`);
    values.push(params.visibility);
  }
  if (params.postType) {
    conditions.push(`p.post_type = $${idx++}`);
    values.push(params.postType);
  }
  if (params.agentId) {
    conditions.push(`p.agent_id = $${idx++}`);
    values.push(params.agentId);
  }
  if (params.search) {
    const like = `%${String(params.search).replace(/[%_]/g, '')}%`;
    conditions.push(`(p.title ILIKE $${idx} OR p.content ILIKE $${idx} OR p.caption ILIKE $${idx})`);
    values.push(like);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT p.id, p.agent_id, p.property_id, p.title, p.content, p.caption, p.media_urls,
            p.post_type, p.visibility, p.is_reel, p.is_story, p.listing_key, p.listing_id,
            p.like_count, p.comment_count, p.save_count, p.share_count, p.view_count,
            p.feed_event_type, p.created_at, p.updated_at,
            a.full_name AS agent_name, a.email AS agent_email
     FROM agent_posts p
     LEFT JOIN agents a ON a.id = p.agent_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...values, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::text AS count FROM agent_posts p ${where}`,
    values
  );

  const { rows: summaryRows } = await pool.query(
    `SELECT visibility, COUNT(*)::int AS count FROM agent_posts GROUP BY visibility`
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: parseInt(countRows[0].count, 10) || 0,
      pages: Math.max(1, Math.ceil((parseInt(countRows[0].count, 10) || 0) / limit)),
    },
    summary: summaryRows,
  };
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT p.*, a.full_name AS agent_name, a.email AS agent_email
     FROM agent_posts p
     LEFT JOIN agents a ON a.id = p.agent_id
     WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function setVisibility(id, visibility, adminId) {
  if (!['published', 'hidden'].includes(visibility)) {
    throw Object.assign(new Error('Invalid visibility'), { statusCode: 400 });
  }
  const { rows } = await pool.query(
    `UPDATE agent_posts SET visibility = $1, updated_at = NOW() WHERE id = $2 RETURNING id, visibility`,
    [visibility, id]
  );
  return rows[0] || null;
}

async function remove(id, adminId) {
  const { rows } = await pool.query('SELECT id FROM agent_posts WHERE id = $1', [id]);
  if (!rows[0]) return null;
  await pool.query('DELETE FROM agent_posts WHERE id = $1', [id]);
  return { removed: true, id };
}

module.exports = { list, getById, setVisibility, remove };
