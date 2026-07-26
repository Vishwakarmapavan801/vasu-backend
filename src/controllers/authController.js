/**
 * Auth Controller
 *
 * Handles user registration, login, session verification, and logout.
 * All passwords are hashed with bcrypt before storage.
 * JWTs are issued on successful login/register.
 */

const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { generateToken } = require('../middleware/auth');

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
function authResponse(res, user, token, message) {
  const displayName = user.name || user.email || 'User';
  return res.status(200).json({
    success: true,
    message: message || 'Authenticated successfully',
    token,
    user: {
      id: user.id,
      email: user.email,
      name: displayName,
      phone: user.phone || '',
    },
  });
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
      'SELECT id FROM users WHERE email = $1',
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
      `INSERT INTO users (email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, phone, created_at`,
      [cleanEmail, passwordHash, cleanName, cleanPhone || null]
    );

    const user = result.rows[0];
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || '',
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }
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

    // Find user
    const result = await pool.query(
      'SELECT id, email, name, phone, password_hash FROM users WHERE email = $1',
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return authResponse(res, user, token, 'Signed in successfully!');
  } catch (err) {
    next(err);
  }
}

// ================================================================
// GET /api/auth/me
// ================================================================
async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, email, name, phone, created_at FROM users WHERE id = $1',
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
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// POST /api/auth/logout
// ================================================================
async function logout(req, res) {
  // JWT is stateless; client removes the token.
  // This endpoint exists for API completeness.
  return res.status(200).json({
    success: true,
    message: 'Signed out successfully.',
  });
}

module.exports = {
  register,
  login,
  getMe,
  logout,
};
