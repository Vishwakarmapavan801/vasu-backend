const pool = require('../../../config/database');

const NOTIFICATION_COLUMNS = [
  'id', 'agent_id', 'type', 'title', 'message', 'link', 'is_read', 'created_at'
];

const NOTIFICATION_FIELDS = NOTIFICATION_COLUMNS.join(', ');

async function create(agentId, type, title, message, link) {
  const { rows } = await pool.query(
    `INSERT INTO agent_notifications (agent_id, type, title, message, link)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${NOTIFICATION_FIELDS}`,
    [agentId, type, title, message || '', link || '']
  );
  return rows[0];
}

async function list(agentId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const conditions = ['agent_id = $1'];
  const values = [agentId];
  let idx = 2;

  if (params.unreadOnly) {
    conditions.push('is_read = FALSE');
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agent_notifications WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `SELECT ${NOTIFICATION_FIELDS} FROM agent_notifications WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    success: true,
    data: rows,
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
  };
}

async function markRead(notificationId, agentId) {
  const { rows } = await pool.query(
    `UPDATE agent_notifications SET is_read = TRUE WHERE id = $1 AND agent_id = $2 RETURNING ${NOTIFICATION_FIELDS}`,
    [notificationId, agentId]
  );
  return rows[0] || null;
}

async function markAllRead(agentId) {
  await pool.query(
    `UPDATE agent_notifications SET is_read = TRUE WHERE agent_id = $1 AND is_read = FALSE`,
    [agentId]
  );
}

async function getUnreadCount(agentId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agent_notifications WHERE agent_id = $1 AND is_read = FALSE`,
    [agentId]
  );
  return rows[0].count;
}

async function notifyNewFollower(agentId, followerName) {
  return create(
    agentId,
    'new_follower',
    'New Follower',
    `${followerName} started following you`,
    `/agent/${agentId}/followers`
  );
}

async function notifyNewReview(agentId, reviewerName) {
  return create(
    agentId,
    'new_review',
    'New Review',
    `${reviewerName} left a review on your profile`,
    `/agent/${agentId}/reviews`
  );
}

async function notifyNewTourRequest(agentId, requesterName) {
  return create(
    agentId,
    'new_tour_request',
    'New Tour Request',
    `${requesterName} requested a tour`,
    `/agent/${agentId}/tours`
  );
}

async function notifyStatusChange(agentId, status) {
  return create(
    agentId,
    'status_change',
    'Profile Status Updated',
    `Your agent profile has been ${status}`,
    `/agent/${agentId}`
  );
}

module.exports = {
  create,
  list,
  markRead,
  markAllRead,
  getUnreadCount,
  notifyNewFollower,
  notifyNewReview,
  notifyNewTourRequest,
  notifyStatusChange,
};
