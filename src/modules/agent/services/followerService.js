const pool = require('../../../config/database');

async function follow(agentId, userId) {
  const existing = await pool.query(
    `SELECT id FROM agent_followers WHERE agent_id = $1 AND user_id = $2`,
    [agentId, userId]
  );
  if (existing.rows.length > 0) {
    return { alreadyFollowing: true };
  }

  await pool.query(
    `INSERT INTO agent_followers (agent_id, user_id) VALUES ($1, $2)`,
    [agentId, userId]
  );
  return { success: true };
}

async function unfollow(agentId, userId) {
  const result = await pool.query(
    `DELETE FROM agent_followers WHERE agent_id = $1 AND user_id = $2 RETURNING id`,
    [agentId, userId]
  );
  return { unfollowed: result.rows.length > 0 };
}

async function isFollowing(agentId, userId) {
  const { rows } = await pool.query(
    `SELECT id FROM agent_followers WHERE agent_id = $1 AND user_id = $2`,
    [agentId, userId]
  );
  return rows.length > 0;
}

async function getFollowers(agentId) {
  const { rows } = await pool.query(
    `SELECT f.created_at AS followed_at,
      u.id AS user_id, u.full_name, u.email, u.profile_photo_url
     FROM agent_followers f
     JOIN users u ON f.user_id = u.id
     WHERE f.agent_id = $1
     ORDER BY f.created_at DESC`,
    [agentId]
  );
  return rows;
}

async function getFollowing(userId) {
  const { rows } = await pool.query(
    `SELECT f.created_at AS followed_at,
      a.id AS agent_id, a.full_name, a.email, a.profile_photo_url,
      a.company_name, a.city, a.state
     FROM agent_followers f
     JOIN agents a ON f.agent_id = a.id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return rows;
}

async function getFollowerCount(agentId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_followers WHERE agent_id = $1`,
    [agentId]
  );
  return rows[0].count;
}

module.exports = {
  follow,
  unfollow,
  isFollowing,
  getFollowers,
  getFollowing,
  getFollowerCount,
};
