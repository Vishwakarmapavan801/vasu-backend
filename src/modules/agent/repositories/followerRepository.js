const pool = require('../../../config/database');

const FOLLOWER_COLUMNS = ['id', 'agent_id', 'user_id', 'created_at'];
const FOLLOWER_FIELDS = FOLLOWER_COLUMNS.join(', ');

async function findByAgentId(agentId) {
  const { rows } = await pool.query(
    `SELECT ${FOLLOWER_FIELDS} FROM agent_followers WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId]
  );
  return rows;
}

async function findByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT ${FOLLOWER_FIELDS} FROM agent_followers WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function create(agentId, userId) {
  const { rows } = await pool.query(
    `INSERT INTO agent_followers (agent_id, user_id) VALUES ($1, $2)
     ON CONFLICT (agent_id, user_id) DO NOTHING
     RETURNING ${FOLLOWER_FIELDS}`,
    [agentId, userId]
  );
  return rows[0] || null;
}

async function deleteFollower(agentId, userId) {
  const { rows } = await pool.query(
    `DELETE FROM agent_followers WHERE agent_id = $1 AND user_id = $2 RETURNING id`,
    [agentId, userId]
  );
  return rows.length > 0;
}

async function isFollowing(agentId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 AS following FROM agent_followers WHERE agent_id = $1 AND user_id = $2`,
    [agentId, userId]
  );
  return rows.length > 0;
}

async function countByAgentId(agentId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_followers WHERE agent_id = $1`,
    [agentId]
  );
  return rows[0].count;
}

module.exports = {
  findByAgentId,
  findByUserId,
  create,
  delete: deleteFollower,
  isFollowing,
  countByAgentId,
};
