/**
 * Auth Controller
 *
 * Handles user registration, login, session verification, and logout.
 * All passwords are hashed with bcrypt before storage.
 * JWTs are issued on successful login/register.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');
const { generateToken } = require('../middleware/auth');
const refreshTokenService = require('../services/auth/refreshTokenService');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');
const { CLIENT_URL } = require('../config');
const { verifyGoogleIdToken, GoogleAuthError } = require('../services/auth/googleAuthService');

const SALT_ROUNDS = 12;

/** Simple email regex */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Name regex (letters, spaces, hyphens, apostrophes only) — must match formController.js */
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;

/** Phone regex (digits, spaces, dashes, parens, dots, +) — must match formController.js */
const PHONE_RE = /^[\d\s\-().+]{7,20}$/;

/**
 * Strip HTML tags and trim.
 */
function stripHtml(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim();
}

/**
 * Build a 400 error response.
 */
function badRequest(res, message, fields) {
  const response = { success: false, error: message };
  if (fields) response.fields = fields;
  return res.status(400).json(response);
}

/**
 * Build a success response with token.
 */
function authResponse(res, user, token, message, refreshToken) {
  const displayName = user.name || user.email || 'User';
  const response = {
    success: true,
    message: message || 'Authenticated successfully',
    token,
    user: {
      id: user.id,
      email: user.email,
      name: displayName,
      phone: user.phone || '',
      role: user.role || 'user',
      is_agent: !!user.is_agent,
      agent_status: user.agent_status || null,
    },
  };
  if (refreshToken) response.refreshToken = refreshToken;
  return res.status(200).json(response);
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return badRequest(res, 'Please provide a valid email address.');
    }

    const result = await pool.query(
      'SELECT id, email, name FROM public.users WHERE email = $1',
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists for that email, a password reset link has been sent.',
      });
    }

    const user = result.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await pool.query(
      `UPDATE public.users
       SET reset_token = $1,
           reset_token_expires_at = $2
       WHERE id = $3`,
      [resetToken, resetTokenExpiresAt, user.id]
    );

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name || user.email,
      resetToken,
    });

    return res.status(200).json({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token } = req.params || {};
    const { password } = req.body || {};

    if (!token) {
      return badRequest(res, 'Reset token is required.');
    }

    if (!password || password.length < 8) {
      return badRequest(res, 'Password must be at least 8 characters.');
    }

    const result = await pool.query(
      `SELECT id, email, reset_token, reset_token_expires_at
       FROM public.users
       WHERE reset_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token.',
      });
    }

    const user = result.rows[0];
    const expiresAt = user.reset_token_expires_at ? new Date(user.reset_token_expires_at) : null;

    if (!expiresAt || expiresAt <= new Date()) {
      await pool.query(
        `UPDATE public.users
         SET reset_token = NULL,
             reset_token_expires_at = NULL
         WHERE id = $1`,
        [user.id]
      );
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token.',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query(
      `UPDATE public.users
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires_at = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can sign in with your new password.',
    });
  } catch (err) {
    console.error('[authController] resetPassword failed:', err);
    next(err);
  }
}

// ================================================================
// POST /api/auth/register
// ================================================================
async function register(req, res, next) {
  try {
    const { name, email, password, phone } = req.body || {};
    const errors = {};

    // Validate name
    const cleanName = stripHtml(name || '');
    if (!cleanName || cleanName.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    } else if (!NAME_RE.test(cleanName)) {
      errors.name = 'Name can only contain letters, spaces, hyphens, and apostrophes';
    }
    if (!errors.name && cleanName.length > 255) {
      errors.name = 'Name must be 255 characters or less';
    }

    // Validate email
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      errors.email = 'Email is required';
    } else if (!EMAIL_RE.test(cleanEmail)) {
      errors.email = 'Invalid email address';
    }

    // Validate password
    if (!password || password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (password && password.length > 128) {
      errors.password = 'Password must be 128 characters or less';
    }

    // Validate phone (optional)
    const cleanPhone = stripHtml(phone || '');
    if (cleanPhone && !PHONE_RE.test(cleanPhone)) {
      errors.phone = 'Invalid phone number';
    }

    if (Object.keys(errors).length > 0) {
      return badRequest(res, 'Validation failed', errors);
    }

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM public.users WHERE email = $1',
      [cleanEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const result = await pool.query(
      `INSERT INTO public.users (email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, phone, role, created_at`,
      [cleanEmail, passwordHash, cleanName, cleanPhone || null]
    );

    const user = result.rows[0];

    // Auto-verify in development, send verification email in production
    if (process.env.NODE_ENV === 'development') {
      await pool.query(
        'UPDATE public.users SET email_verified = TRUE, email_verified_at = NOW() WHERE id = $1',
        [user.id]
      );
    } else {
      const rawToken = crypto.randomBytes(32);
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );

      // Send verification email (fire-and-forget)
      sendVerificationEmail({
        to: user.email,
        name: user.name || user.email,
        verificationToken: rawToken.toString('hex'),
      });
    }

    return res.status(201).json({
      success: true,
      message: process.env.NODE_ENV === 'development'
        ? 'Account created successfully.'
        : 'Verification email sent. Please verify your email before logging in.',
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }
    console.error('[authController] register failed:', err);
    next(err);
  }
}

// ================================================================
// POST /api/auth/login
// ================================================================
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const errors = {};

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      errors.email = 'Email is required';
    } else if (!EMAIL_RE.test(cleanEmail)) {
      errors.email = 'Invalid email address';
    }
    if (!password) {
      errors.password = 'Password is required';
    }

    if (Object.keys(errors).length > 0) {
      return badRequest(res, 'Validation failed', errors);
    }

    // Find user with agent status
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.password_hash, u.email_verified, u.role,
              CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS is_agent,
              a.status AS agent_status
       FROM public.users u
       LEFT JOIN agents a ON a.user_id::text = u.id::text
       WHERE u.email = $1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    // Google-created accounts have no password — route them back to Google sign-in
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        error: 'This account uses Google sign-in. Please continue with Google.',
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    // Check email verification (skip in development)
    if (!user.email_verified && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: 'Please verify your email before logging in.',
      });
    }

    const tokens = await refreshTokenService.generateTokens(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      req.headers['user-agent'] || null,
      req.ip
    );

    return authResponse(res, user, tokens.accessToken, 'Signed in successfully!', tokens.refreshToken);
  } catch (err) {
    console.error('[authController] login failed:', err);
    next(err);
  }
}

// ================================================================
// GET /api/auth/me
// ================================================================
async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.created_at,
              CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS is_agent,
              a.status AS agent_status
       FROM public.users u
       LEFT JOIN agents a ON a.user_id::text = u.id::text
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found.',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || '',
        role: user.role || 'user',
        createdAt: user.created_at,
        is_agent: !!user.is_agent,
        agent_status: user.agent_status || null,
      },
    });
  } catch (err) {
    console.error('[authController] getMe failed:', err);
    next(err);
  }
}

// ================================================================
// POST /api/auth/logout
// ================================================================
async function logout(req, res) {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await refreshTokenService.revokeSession(refreshToken);
  }
  return res.status(200).json({
    success: true,
    message: 'Signed out successfully.',
  });
}

// ================================================================
// PUT /api/auth/profile
// ================================================================
async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body || {};
    const errors = {};

    // Validate name
    const cleanName = stripHtml(name || '');
    if (cleanName && cleanName.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    } else if (cleanName && !NAME_RE.test(cleanName)) {
      errors.name = 'Name can only contain letters, spaces, hyphens, and apostrophes';
    }
    if (cleanName && cleanName.length > 255) {
      errors.name = 'Name must be 255 characters or less';
    }

    // Validate phone (optional)
    const cleanPhone = stripHtml(phone || '');
    if (cleanPhone && !PHONE_RE.test(cleanPhone)) {
      errors.phone = 'Invalid phone number';
    }

    if (Object.keys(errors).length > 0) {
      return badRequest(res, 'Validation failed', errors);
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (cleanName) {
      updates.push(`name = $${paramIndex++}`);
      values.push(cleanName);
    }
    if (cleanPhone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(cleanPhone || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update.' });
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE public.users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, name, phone, role, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const user = result.rows[0];
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || '',
        role: user.role || 'user',
      },
    });
  } catch (err) {
    console.error('[authController] updateProfile failed:', err);
    next(err);
  }
}

// ================================================================
// PUT /api/auth/change-password
// ================================================================
async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body || {};
    const errors = {};

    if (!currentPassword) {
      errors.currentPassword = 'Current password is required';
    }
    if (!newPassword || newPassword.length < 8) {
      errors.newPassword = 'New password must be at least 8 characters';
    }
    if (newPassword && newPassword.length > 128) {
      errors.newPassword = 'New password must be 128 characters or less';
    }

    if (Object.keys(errors).length > 0) {
      return badRequest(res, 'Validation failed', errors);
    }

    const result = await pool.query(
      'SELECT password_hash FROM public.users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Google-created accounts have no password — offer password reset instead
    if (!result.rows[0].password_hash) {
      return res.status(400).json({
        success: false,
        error: 'This account uses Google sign-in. Use "Forgot password" to set a password.',
      });
    }

    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect.',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      'UPDATE public.users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );

    await refreshTokenService.revokeUserSessions(userId);

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please sign in again.',
    });
  } catch (err) {
    console.error('[authController] changePassword failed:', err);
    next(err);
  }
}

// ================================================================
// GET /api/auth/verify-email?token=...
// ================================================================
async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;

    if (!token) {
      const acceptsJson = req.accepts('json');
      if (acceptsJson) {
        return res.status(400).json({ success: false, error: 'Verification token is required.' });
      }
      return res.redirect(`${CLIENT_URL}/verify-email?error=missing_token`);
    }

    const tokenHash = crypto.createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');

    const result = await pool.query(
      `SELECT id, user_id, expires_at
       FROM email_verification_tokens
       WHERE token_hash = $1 AND used_at IS NULL`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      const acceptsJson = req.accepts('json');
      if (acceptsJson) {
        return res.status(400).json({ success: false, error: 'Invalid or expired verification token.' });
      }
      return res.redirect(`${CLIENT_URL}/verify-email?error=invalid_token`);
    }

    const verification = result.rows[0];
    const expiresAt = new Date(verification.expires_at);

    if (expiresAt <= new Date()) {
      const acceptsJson = req.accepts('json');
      if (acceptsJson) {
        return res.status(400).json({ success: false, error: 'Verification token has expired. Please request a new one.' });
      }
      return res.redirect(`${CLIENT_URL}/verify-email?error=expired_token`);
    }

    // Mark token as used
    await pool.query(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1',
      [verification.id]
    );

    // Mark user as verified
    await pool.query(
      'UPDATE public.users SET email_verified = TRUE, email_verified_at = NOW() WHERE id = $1',
      [verification.user_id]
    );

    const acceptsJson = req.accepts('json');
    if (acceptsJson) {
      return res.status(200).json({
        success: true,
        message: 'Email verified successfully. You can now log in.',
      });
    }

    return res.redirect(`${CLIENT_URL}/email-verified`);
  } catch (err) {
    console.error('[authController] verifyEmail failed:', err);
    next(err);
  }
}

// ================================================================
// Simple in-memory rate limiter for resend-verification
// ================================================================
const resendRateLimit = new Map();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of resendRateLimit) {
    data.timestamps = data.timestamps.filter(t => now - t < 3600000);
    if (data.timestamps.length === 0) {
      resendRateLimit.delete(key);
    }
  }
}, 300000);

function checkResendRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const entry = resendRateLimit.get(key) || { timestamps: [] };

  // Clean old entries
  entry.timestamps = entry.timestamps.filter(t => now - t < 3600000);

  // Check minimum 60 seconds between requests
  if (entry.timestamps.length > 0) {
    const lastRequest = entry.timestamps[entry.timestamps.length - 1];
    if (now - lastRequest < 60000) {
      return { allowed: false, message: 'Please wait at least 60 seconds before requesting another verification email.' };
    }
  }

  // Check max 3 emails per hour
  if (entry.timestamps.length >= 3) {
    return { allowed: false, message: 'Too many verification emails sent. Please try again later.' };
  }

  entry.timestamps.push(now);
  resendRateLimit.set(key, entry);
  return { allowed: true };
}

// ================================================================
// POST /api/auth/resend-verification
// ================================================================
async function resendVerification(req, res, next) {
  try {
    const { email } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return badRequest(res, 'Please provide a valid email address.');
    }

    // Rate limit check
    const rateCheck = checkResendRateLimit(cleanEmail);
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, error: rateCheck.message });
    }

    // Find user
    const userResult = await pool.query(
      'SELECT id, email, name, email_verified FROM public.users WHERE email = $1',
      [cleanEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists for that email, a verification email has been sent.',
      });
    }

    const user = userResult.rows[0];

    // If already verified, notify but don't spam
    if (user.email_verified) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists for that email, a verification email has been sent.',
      });
    }

    // Invalidate previous unused tokens
    await pool.query(
      `UPDATE email_verification_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );

    // Generate new token
    const rawToken = crypto.randomBytes(32);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    // Send verification email (fire-and-forget)
    sendVerificationEmail({
      to: user.email,
      name: user.name || user.email,
      verificationToken: rawToken.toString('hex'),
    });

    return res.status(200).json({
      success: true,
      message: 'If an account exists for that email, a verification email has been sent.',
    });
  } catch (err) {
    console.error('[authController] resendVerification failed:', err);
    next(err);
  }
}

// ================================================================
// POST /api/auth/refresh
// ================================================================
async function refreshToken(req, res, next) {
  try {
    const { refreshToken: token } = req.body || {};
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required.',
      });
    }

    const tokens = await refreshTokenService.refreshAccessToken(
      token,
      req.headers['user-agent'] || null,
      req.ip
    );

    if (!tokens) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully.',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error('[authController] refreshToken failed:', err);
    next(err);
  }
}

// ================================================================
// POST /api/auth/google
// ================================================================
async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return badRequest(res, 'Google token is required.');
    }

    // Verify the ID token on the server (never trust the client's token alone)
    const profile = await verifyGoogleIdToken(idToken);

    // Fast path: existing Google user
    let result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.password_hash, u.email_verified, u.role, u.google_id,
              CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS is_agent,
              a.status AS agent_status
       FROM public.users u
       LEFT JOIN agents a ON a.user_id::text = u.id::text
       WHERE u.google_id = $1`,
      [profile.googleId]
    );

    let user = result.rows[0] || null;

    // Account linking: existing email/password user signs in with the same email
    if (!user) {
      result = await pool.query(
        `SELECT u.id, u.email, u.name, u.phone, u.password_hash, u.email_verified, u.role, u.google_id,
                CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS is_agent,
                a.status AS agent_status
         FROM public.users u
         LEFT JOIN agents a ON a.user_id::text = u.id::text
         WHERE u.email = $1`,
        [profile.email]
      );
      user = result.rows[0] || null;
    }

    if (user) {
      // Link the Google account to this user and mark the email verified (Google verified it)
      if (user.google_id !== profile.googleId) {
        await pool.query(
          'UPDATE public.users SET google_id = $1 WHERE id = $2',
          [profile.googleId, user.id]
        );
        user.google_id = profile.googleId;
      }
      if (!user.email_verified) {
        await pool.query(
          'UPDATE public.users SET email_verified = TRUE WHERE id = $1',
          [user.id]
        );
        user.email_verified = true;
      }
    } else {
      // First-time Google user — create the account and log them in
      const insert = await pool.query(
        `INSERT INTO public.users (email, name, google_id, email_verified)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id, email, name, phone, role, created_at`,
        [profile.email, profile.name || profile.email, profile.googleId]
      );
      user = insert.rows[0];
      user.is_agent = false;
      user.agent_status = null;
      user.google_id = profile.googleId;
    }

    const tokens = await refreshTokenService.generateTokens(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      req.headers['user-agent'] || null,
      req.ip
    );

    return authResponse(res, user, tokens.accessToken, 'Signed in with Google successfully!', tokens.refreshToken);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return res.status(401).json({ success: false, error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }
    console.error('[authController] googleLogin failed:', err);
    next(err);
  }
}

// ================================================================
// Dev-only: auto-login without credentials (NODE_ENV=development)
// ================================================================
async function devLogin(req, res, next) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const devEmail = 'demo@vasurealty.com';
    const devPassword = 'Demo@123';

    // Find existing dev user
    let result = await pool.query(
      'SELECT id, email, name, phone, password_hash, email_verified, role FROM public.users WHERE email = $1',
      [devEmail]
    );

    let user;
    if (result.rows.length === 0) {
      // Create dev user
      const passwordHash = await bcrypt.hash(devPassword, 10);
      result = await pool.query(
        `INSERT INTO public.users (email, password_hash, name, phone, email_verified, email_verified_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW())
         RETURNING id, email, name, phone, role, created_at`,
        [devEmail, passwordHash, 'Demo User', null]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      // Ensure email is verified
      if (!user.email_verified) {
        await pool.query(
          'UPDATE public.users SET email_verified = TRUE, email_verified_at = NOW() WHERE id = $1',
          [user.id]
        );
        user.email_verified = true;
      }
    }

    const tokens = await refreshTokenService.generateTokens(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      req.headers['user-agent'] || null,
      req.ip
    );

    return authResponse(res, user, tokens.accessToken, 'Dev login successful!', tokens.refreshToken);
  } catch (err) {
    console.error('[authController] devLogin failed:', err);
    next(err);
  }
}

module.exports = {
  register,
  login,
  googleLogin,
  getMe,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  verifyEmail,
  resendVerification,
  devLogin,
};
