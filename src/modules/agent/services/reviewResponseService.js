const pool = require('../../../config/database');

const COLUMNS = ['id', 'review_id', 'agent_id', 'response', 'created_at', 'updated_at'];
const FIELDS = COLUMNS.join(', ');

async function getByAgentId(agentId) {
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM agent_review_responses WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId]
  );
  return rows;
}

async function getByReviewId(reviewId) {
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM agent_review_responses WHERE review_id = $1`,
    [reviewId]
  );
  return rows[0] || null;
}

async function create(agentId, reviewId, response) {
  const existing = await pool.query(
    'SELECT id FROM agent_review_responses WHERE review_id = $1',
    [reviewId]
  );
  if (existing.rows.length) {
    throw new Error('A response already exists for this review');
  }
  const { rows } = await pool.query(
    `INSERT INTO agent_review_responses (agent_id, review_id, response) VALUES ($1, $2, $3) RETURNING ${FIELDS}`,
    [agentId, reviewId, response]
  );
  return rows[0];
}

async function update(id, agentId, response) {
  const { rows } = await pool.query(
    `UPDATE agent_review_responses SET response = $1, updated_at = NOW() WHERE id = $2 AND agent_id = $3 RETURNING ${FIELDS}`,
    [response, id, agentId]
  );
  return rows[0] || null;
}

async function remove(id, agentId) {
  const result = await pool.query(
    'DELETE FROM agent_review_responses WHERE id = $1 AND agent_id = $2 RETURNING id',
    [id, agentId]
  );
  if (!result.rows.length) throw new Error('Response not found or unauthorized');
  return { deleted: true };
}

module.exports = {
  getByAgentId,
  getByReviewId,
  create,
  update,
  remove,
};
