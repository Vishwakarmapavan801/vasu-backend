/**
 * Admin Settings Service
 *
 * Platform-level key/value configuration stored in admin_settings.
 * Values are JSONB so arbitrary structured settings can be stored; the admin
 * UI reads/writes them through this service only. Everything is persisted —
 * no defaults are invented at read time.
 */

const pool = require('../../../config/database');

async function getSettings(keys) {
  if (Array.isArray(keys) && keys.length > 0) {
    const { rows } = await pool.query(
      `SELECT key, value, updated_by, updated_at FROM admin_settings WHERE key = ANY($1)`,
      [keys]
    );
    return { data: rows };
  }
  const { rows } = await pool.query(
    `SELECT key, value, updated_by, updated_at FROM admin_settings ORDER BY key`
  );
  return { data: rows };
}

async function getSetting(key) {
  const { rows } = await pool.query(
    `SELECT key, value, updated_by, updated_at FROM admin_settings WHERE key = $1`,
    [key]
  );
  return rows[0] || null;
}

async function setSetting(key, value, adminId) {
  if (!key || typeof key !== 'string' || !key.trim()) {
    throw Object.assign(new Error('Setting key is required'), { statusCode: 400 });
  }
  const serialized = value === undefined || value === null ? JSON.stringify(null) : JSON.stringify(value);
  const { rows } = await pool.query(
    `INSERT INTO admin_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING key, value, updated_by, updated_at`,
    [key.trim(), serialized, adminId]
  );
  return rows[0] || null;
}

async function deleteSetting(key, adminId) {
  const { rows } = await pool.query(
    'DELETE FROM admin_settings WHERE key = $1 RETURNING key',
    [key]
  );
  return rows[0] || null;
}

module.exports = { getSettings, getSetting, setSetting, deleteSetting };
