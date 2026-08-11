/**
 * Admin Agent Service
 *
 * Full lifecycle management for agent profiles:
 * approve / reject / suspend / reactivate / verify / feature / reset password.
 *
 * Reuses agentService for approve/reject so existing behavior (verification
 * + status transitions + audit logging in the controller) stays consistent.
 */

const bcrypt = require('bcryptjs');
const pool = require('../../../config/database');
const agentService = require('../../../modules/agent/services/agentService');
const { revokeUserSessions } = require('../../../services/auth/refreshTokenService');

const SALT_ROUNDS = 12;

async function list(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(parseInt(params.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (params.status) {
    conditions.push(`a.status = $${idx++}`);
    values.push(params.status);
  }
  if (params.verified === 'true' || params.verified === true) {
    conditions.push(`a.is_verified = TRUE`);
  }
  if (params.search) {
    const like = `%${String(params.search).replace(/[%_]/g, '')}%`;
    conditions.push(`(a.full_name ILIKE $${idx} OR a.email ILIKE $${idx} OR a.license_number ILIKE $${idx} OR a.company_name ILIKE $${idx})`);
    values.push(like);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const orderBy =
    params.sort === 'created_at'
      ? 'a.created_at DESC'
      : params.sort === 'rating'
        ? 'a.average_rating DESC'
        : 'a.created_at DESC';

  const { rows } = await pool.query(
    `SELECT a.id, a.user_id, a.full_name, a.profile_photo_url, a.designation,
            a.company_name, a.license_number, a.phone, a.email, a.city, a.state,
            a.experience_years, a.is_verified, a.status, a.average_rating, a.total_reviews,
            a.created_at, a.updated_at,
            u.email AS account_email,
            (SELECT COUNT(*)::int FROM agent_followers f WHERE f.agent_id = a.id) AS follower_count,
            (SELECT COUNT(*)::int FROM agent_reviews r WHERE r.agent_id = a.id) AS review_count
     FROM agents a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY ${orderBy}
     LIMIT $${idx++} OFFSET $${idx}`,
    [...values, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::text AS count FROM agents a ${where}`,
    values
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: parseInt(countRows[0].count, 10) || 0,
      pages: Math.max(1, Math.ceil((parseInt(countRows[0].count, 10) || 0) / limit)),
    },
  };
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT a.*, u.email AS account_email, u.role AS account_role, u.status AS account_status,
            u.created_at AS account_created_at,
            (SELECT COUNT(*)::int FROM agent_followers f WHERE f.agent_id = a.id) AS follower_count,
            (SELECT COUNT(*)::int FROM agent_reviews r WHERE r.agent_id = a.id) AS review_count,
            (SELECT COUNT(*)::int FROM agent_posts p WHERE p.agent_id = a.id) AS post_count,
            (SELECT COUNT(*)::int FROM agent_leads l WHERE l.agent_id = a.id) AS lead_count,
            (SELECT COUNT(*)::int FROM agent_tour_requests t WHERE t.agent_id = a.id) AS tour_count
     FROM agents a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [id]
  );
  const agent = rows[0];
  if (!agent) return null;

  try {
    const stats = await agentService.getStats(id);
    if (stats) agent.stats = stats;
  } catch (_) {
    agent.stats = null;
  }

  // Sessions + login history for the linked account
  if (agent.user_id) {
    const sessions = await pool.query(
      `SELECT id, device_info, ip_address, expires_at, created_at, revoked_at
       FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
      [agent.user_id]
    );
    agent.sessions = sessions.rows;
  } else {
    agent.sessions = [];
  }

  // Featured status (monetization)
  const featured = await pool.query(
    `SELECT id, plan_type, starts_at, ends_at, is_active, priority
     FROM featured_agents WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  agent.featured = featured.rows[0] || null;

  return agent;
}

async function getListings(agentId) {
  try {
    const listings = await agentService.getListings(agentId);
    return listings || [];
  } catch (_) {
    return [];
  }
}

async function getSoldListings(agentId) {
  try {
    const listings = await agentService.getSoldListings(agentId);
    return listings || [];
  } catch (_) {
    return [];
  }
}

async function approve(agentId, adminId) {
  return agentService.approve(agentId, adminId);
}

async function reject(agentId, adminId, reason) {
  return agentService.reject(agentId, adminId, reason);
}

async function suspend(agentId) {
  const { rows } = await pool.query(
    `UPDATE agents SET status = 'suspended', updated_at = NOW()
     WHERE id = $1 RETURNING id, status`,
    [agentId]
  );
  if (rows[0]?.id) {
    const { rows: userRows } = await pool.query('SELECT user_id FROM agents WHERE id = $1', [agentId]);
    if (userRows[0]?.user_id) {
      await revokeUserSessions(userRows[0].user_id);
    }
  }
  return rows[0] || null;
}

async function reactivate(agentId) {
  const { rows } = await pool.query(
    `UPDATE agents SET status = 'approved', updated_at = NOW()
     WHERE id = $1 RETURNING id, status`,
    [agentId]
  );
  return rows[0] || null;
}

async function verify(agentId) {
  const { rows } = await pool.query(
    `UPDATE agents SET is_verified = TRUE, updated_at = NOW()
     WHERE id = $1 RETURNING id, is_verified`,
    [agentId]
  );
  return rows[0] || null;
}

async function feature(agentId, { featured, priority }) {
  const isActive = !!featured;
  if (isActive) {
    const existing = await pool.query('SELECT id FROM featured_agents WHERE agent_id = $1', [agentId]);
    let rows;
    if (existing.rows[0]) {
      rows = await pool.query(
        `UPDATE featured_agents SET is_active = TRUE, priority = $2, starts_at = NOW(), ends_at = NOW() + INTERVAL '30 days', updated_at = NOW()
         WHERE agent_id = $1 RETURNING id, is_active, priority, starts_at, ends_at`,
        [agentId, Math.max(0, parseInt(priority, 10) || 0)]
      );
    } else {
      rows = await pool.query(
        `INSERT INTO featured_agents (agent_id, is_active, priority, starts_at, ends_at)
         VALUES ($1, TRUE, $2, NOW(), NOW() + INTERVAL '30 days')
         RETURNING id, is_active, priority, starts_at, ends_at`,
        [agentId, Math.max(0, parseInt(priority, 10) || 0)]
      );
    }
    return rows.rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE featured_agents SET is_active = FALSE, updated_at = NOW()
     WHERE agent_id = $1 RETURNING id, is_active`,
    [agentId]
  );
  return rows[0] || null;
}

async function remove(agentId) {
  const { rows } = await pool.query(
    `UPDATE agents SET status = 'deleted', updated_at = NOW()
     WHERE id = $1 RETURNING id, status`,
    [agentId]
  );
  if (rows[0]?.id) {
    const { rows: userRows } = await pool.query('SELECT user_id FROM agents WHERE id = $1', [agentId]);
    if (userRows[0]?.user_id) {
      await revokeUserSessions(userRows[0].user_id);
    }
  }
  return rows[0] || null;
}

async function resetPassword(agentId, password) {
  const { rows } = await pool.query('SELECT user_id FROM agents WHERE id = $1', [agentId]);
  if (!rows[0]?.user_id) {
    throw Object.assign(new Error('Agent has no linked user account'), { statusCode: 400 });
  }
  if (!password || password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 });
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, rows[0].user_id]);
  await revokeUserSessions(rows[0].user_id);
  return { reset: true };
}

module.exports = {
  list,
  getById,
  getListings,
  getSoldListings,
  approve,
  reject,
  suspend,
  reactivate,
  verify,
  feature,
  remove,
  resetPassword,
};
