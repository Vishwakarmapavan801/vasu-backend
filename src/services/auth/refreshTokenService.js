const crypto = require('crypto');
const pool = require('../../config/database');
const { generateToken, verifyAccessToken } = require('../../middleware/auth');

const REFRESH_TOKEN_BYTES = 64;
const REFRESH_EXPIRY_DAYS = 30;

function generateRefreshTokenValue() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
}

async function generateTokens(user, deviceInfo = null, ipAddress = null) {
  const accessToken = generateToken(user);

  const refreshTokenValue = generateRefreshTokenValue();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO user_sessions (user_id, refresh_token, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshTokenValue, deviceInfo, ipAddress, expiresAt]
  );

  return { accessToken, refreshToken: refreshTokenValue, expiresAt };
}

async function verifyRefreshToken(token) {
  const result = await pool.query(
    `SELECT * FROM user_sessions
     WHERE refresh_token = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

async function refreshAccessToken(refreshToken, deviceInfo, ipAddress) {
  const session = await verifyRefreshToken(refreshToken);
  if (!session) {
    return null;
  }

  await pool.query(
    'UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1',
    [session.id]
  );

  const userResult = await pool.query(
    'SELECT id, email, name, role FROM users WHERE id = $1',
    [session.user_id]
  );
  if (userResult.rows.length === 0) {
    return null;
  }

  const user = userResult.rows[0];
  return generateTokens(user, deviceInfo || session.device_info, ipAddress || session.ip_address);
}

async function revokeUserSessions(userId) {
  await pool.query(
    'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

async function revokeSession(refreshToken) {
  await pool.query(
    'UPDATE user_sessions SET revoked_at = NOW() WHERE refresh_token = $1 AND revoked_at IS NULL',
    [refreshToken]
  );
}

async function cleanupExpired() {
  const result = await pool.query(
    'DELETE FROM user_sessions WHERE expires_at <= NOW() AND revoked_at IS NULL'
  );
  return result.rowCount;
}

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
  revokeUserSessions,
  revokeSession,
  cleanupExpired,
};
