/**
 * Admin Auth Controller
 *
 * Dedicated login/logout/refresh for the admin panel. It reuses the exact
 * session machinery as the public auth (refreshTokenService) but additionally
 * gates the session behind an admin role. The JWT signed by generateToken
 * carries the role claim, which requireRole() checks on every admin route.
 */

const bcrypt = require('bcryptjs');
const pool = require('../../../config/database');
const { isAdminRole } = require('../../../middleware/admin');
const { verifyAccessToken } = require('../../../middleware/auth');
const refreshTokenService = require('../../../services/auth/refreshTokenService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authResponse(res, user, token, message, refreshToken) {
  const response = {
    success: true,
    message: message || 'Authenticated successfully',
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name || user.email,
      phone: user.phone || '',
      role: user.role || 'user',
      is_agent: !!user.is_agent,
      agent_status: user.agent_status || null,
    },
  };
  if (refreshToken) response.refreshToken = refreshToken;
  return res.status(200).json(response);
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }

    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.password_hash, u.role,
              u.email_verified, u.status,
              CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS is_agent,
              a.status AS agent_status
       FROM public.users u
       LEFT JOIN agents a ON a.user_id::text = u.id::text
       WHERE u.email = $1`,
      [cleanEmail]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    if (!isAdminRole(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'This account does not have admin access.',
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'This account has been suspended.' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    if (!user.email_verified && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ success: false, error: 'Please verify your email before logging in.' });
    }

    const tokens = await refreshTokenService.generateTokens(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      req.headers['user-agent'] || null,
      req.ip
    );

    return authResponse(res, user, tokens.accessToken, 'Admin signed in successfully!', tokens.refreshToken);
  } catch (err) {
    console.error('[adminAuthController] login failed:', err);
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token is required.' });
    }

    const tokens = await refreshTokenService.refreshAccessToken(
      refreshToken,
      req.headers['user-agent'] || null,
      req.ip
    );
    if (!tokens) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
    }

    // Only allow refresh when the session still belongs to an admin role.
    const decoded = verifyAccessToken(tokens.accessToken);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, error: 'Invalid session token.' });
    }

    const userResult = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.status,
              CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS is_agent,
              a.status AS agent_status
       FROM public.users u
       LEFT JOIN agents a ON a.user_id::text = u.id::text
       WHERE u.id = $1`,
      [decoded.id]
    );
    const user = userResult.rows[0];
    if (!user || !isAdminRole(user.role) || user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }

    return authResponse(res, user, tokens.accessToken, 'Session refreshed.', tokens.refreshToken);
  } catch (err) {
    console.error('[adminAuthController] refresh failed:', err);
    next(err);
  }
}

async function logout(req, res) {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await refreshTokenService.revokeSession(refreshToken);
  }
  res.json({ success: true, message: 'Signed out successfully.' });
}

async function me(req, res) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.phone, u.role, u.status, u.created_at,
            CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS is_agent,
            a.status AS agent_status
     FROM public.users u
     LEFT JOIN agents a ON a.user_id::text = u.id::text
     WHERE u.id = $1`,
    [req.user.id]
  );

  if (!result.rows[0] || !isAdminRole(result.rows[0].role)) {
    return res.status(404).json({ success: false, error: 'Admin user not found.' });
  }

  res.json({ success: true, user: result.rows[0] });
}

module.exports = { login, refresh, logout, me };
