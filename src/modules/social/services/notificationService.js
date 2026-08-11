const pool = require('../../../config/database');

async function createNotification(data) {
  const { user_id, actor_id, type, post_id, comment_id, message } = data;
  const { rows } = await pool.query(
    `INSERT INTO social_notifications (user_id, actor_id, type, post_id, comment_id, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [user_id, actor_id || null, type, post_id || null, comment_id || null, message || null]
  );
  return rows[0];
}

async function notifyPostOwner(post, actorId, type, commentId = null) {
  const agent = await getAgentByPostId(post.id);
  if (!agent || agent.user_id === actorId) return;
  const messages = {
    like: 'liked your post',
    comment: 'commented on your post',
    reply: 'replied to your comment',
    save: 'saved your post',
  };
  await createNotification({
    user_id: agent.user_id,
    actor_id: actorId,
    type,
    post_id: post.id,
    comment_id: commentId,
    message: messages[type] || type,
  });
}

async function notifyFollow(targetUserId, actorId) {
  if (targetUserId === actorId) return;
  await createNotification({
    user_id: targetUserId,
    actor_id: actorId,
    type: 'follow',
    message: 'started following you',
  });
}

async function getNotifications(userId, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM social_notifications WHERE user_id = $1',
    [userId]
  );
  const { rows } = await pool.query(
    `SELECT n.*, u.full_name AS actor_name, u.profile_photo_url AS actor_photo
     FROM social_notifications n
     LEFT JOIN users u ON n.actor_id = u.id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { data: rows, pagination: { total: parseInt(countRows.rows[0]?.total || 0), page, limit } };
}

async function markAsRead(notificationId, userId) {
  await pool.query(
    'UPDATE social_notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

async function markAllAsRead(userId) {
  await pool.query(
    'UPDATE social_notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
}

async function getUnreadCount(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM social_notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return rows[0]?.count || 0;
}

async function getAgentByPostId(postId) {
  const { rows } = await pool.query(
    `SELECT a.* FROM agents a JOIN agent_posts p ON a.id = p.agent_id WHERE p.id = $1`,
    [postId]
  );
  return rows[0] || null;
}

async function getUserByAgentId(agentId) {
  const { rows } = await pool.query('SELECT user_id FROM agents WHERE id = $1', [agentId]);
  return rows[0] || null;
}

module.exports = {
  createNotification, notifyPostOwner, notifyFollow,
  getNotifications, markAsRead, markAllAsRead, getUnreadCount,
  getAgentByPostId, getUserByAgentId,
};
