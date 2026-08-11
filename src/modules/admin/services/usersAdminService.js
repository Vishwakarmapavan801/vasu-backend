/**
 * Admin User Service
 *
 * User lifecycle: list, inspect, suspend/activate, change role, reset password,
 * revoke sessions. Roles are scoped to the RBAC roles defined in the admin
 * middleware (super_admin, admin, moderator, mls_manager, content_manager,
 * agent_manager).
 */

const bcrypt = require('bcryptjs');
const pool = require('../../../config/database');
const { ADMIN_ROLES } = require('../../../middleware/admin');
const { revokeUserSessions } = require('../../../services/auth/refreshTokenService');

const SALT_ROUNDS = 12;
const VALID_ROLES = [...ADMIN_ROLES, 'user'];

async function list(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(parseInt(params.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (params.status) {
    conditions.push(`u.status = $${idx++}`);
    values.push(params.status);
  }
  if (params.role) {
    conditions.push(`u.role = $${idx++}`);
    values.push(params.role);
  }
  if (params.search) {
    const like = `%${String(params.search).replace(/[%_]/g, '')}%`;
    conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone ILIKE $${idx})`);
    values.push(like);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.email_verified, u.email_verified_at,
            u.google_id IS NOT NULL AS has_google, u.created_at, u.updated_at,
            a.id AS agent_id, a.status AS agent_status, a.full_name AS agent_name,
            (SELECT COUNT(*)::int FROM user_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS active_sessions
     FROM users u
     LEFT JOIN agents a ON a.user_id = u.id
     ${where}
     ORDER BY u.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...values, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::text AS count FROM users u ${where}`,
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
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.email_verified, u.email_verified_at,
            u.google_id IS NOT NULL AS has_google, u.created_at, u.updated_at,
            a.id AS agent_id, a.full_name AS agent_name, a.status AS agent_status, a.is_verified AS agent_verified,
            a.created_at AS agent_created_at
     FROM users u
     LEFT JOIN agents a ON a.user_id = u.id
     WHERE u.id = $1`,
    [id]
  );
  const user = rows[0];
  if (!user) return null;

  const sessions = await pool.query(
    `SELECT id, device_info, ip_address, expires_at, created_at, revoked_at
     FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
    [id]
  );
  user.sessions = sessions.rows;

  const leadCount = await pool.query('SELECT COUNT(*)::text AS count FROM agent_leads WHERE user_id = $1', [id]);
  user.lead_count = parseInt(leadCount.rows[0].count, 10) || 0;

  return user;
}

async function updateStatus(id, status, actingAdminId) {
  if (!['active', 'suspended'].includes(status)) {
    throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
  }
  const { rows } = await pool.query(
    'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status',
    [status, id]
  );
  if (rows[0]?.id && status === 'suspended') {
    await revokeUserSessions(id);
  }
  return rows[0] || null;
}

async function updateRole(id, role, actingAdminId) {
  if (!VALID_ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role "${role}"`), { statusCode: 400 });
  }
  const { rows } = await pool.query(
    'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role',
    [role, id]
  );
  if (rows[0]?.id) {
    await revokeUserSessions(id); // re-login required after role change
  }
  return rows[0] || null;
}

async function resetPassword(id, password) {
  if (!password || password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 });
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
    [passwordHash, id]
  );
  if (rows[0]?.id) {
    await revokeUserSessions(id);
  }
  return rows[0] || null;
}

async function getRoleSummary() {
  const { rows } = await pool.query(
    `SELECT role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY role`
  );
  return rows;
}

module.exports = {
  list,
  getById,
  updateStatus,
  updateRole,
  resetPassword,
  getRoleSummary,
};
