const pool = require('../config/database');

async function logAdminAction({ adminId, action, targetType, targetId, details }) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, action, targetType, targetId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[auditService] Failed to log admin action:', err.message);
  }
}

async function getAuditLog({ adminId, action, targetType, limit = 50, offset = 0 }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (adminId) {
    conditions.push(`admin_id = $${idx++}`);
    params.push(adminId);
  }
  if (action) {
    conditions.push(`action = $${idx++}`);
    params.push(action);
  }
  if (targetType) {
    conditions.push(`target_type = $${idx++}`);
    params.push(targetType);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  params.push(offset);

  const { rows } = await pool.query(
    `SELECT l.*,
            u.name AS admin_name,
            u.email AS admin_email,
            CASE l.target_type
              WHEN 'agent' THEN (SELECT full_name FROM agents WHERE id::text = l.target_id)
              WHEN 'lead' THEN (SELECT name FROM agent_leads WHERE id::text = l.target_id)
              WHEN 'user' THEN (SELECT email FROM users WHERE id::text = l.target_id)
              WHEN 'transaction' THEN (SELECT 'Transaction #' || id FROM transactions WHERE id::text = l.target_id)
              ELSE NULL
            END AS target_label
     FROM admin_audit_log l
     LEFT JOIN users u ON u.id = l.admin_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM admin_audit_log ${where}`,
    params.slice(0, -2)
  );

  return { data: rows, total: parseInt(countRows[0].count, 10) };
}

module.exports = { logAdminAction, getAuditLog };