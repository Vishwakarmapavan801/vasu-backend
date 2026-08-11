const bcrypt = require('bcryptjs');
const pool = require('../../../config/database');
const refreshTokenService = require('../../../services/auth/refreshTokenService');

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;
const PHONE_RE = /^[\d\s\-().+]{7,20}$/;

function stripHtml(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim();
}

function badRequest(res, message, fields) {
  const response = { success: false, error: message };
  if (fields) response.fields = fields;
  return res.status(400).json(response);
}

function authResponse(res, user, token, message, refreshToken) {
  const displayName = user.name || user.email || 'Agent';
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
      is_agent: true,
      agent_status: user.agent_status || 'pending',
      agent_id: user.agent_id || null,
    },
  };
  if (refreshToken) response.refreshToken = refreshToken;
  return res.status(200).json(response);
}

async function register(req, res, next) {
  try {
    const { name, email, password, phone, license_number, specialties, bio } = req.body || {};
    const errors = {};

    const cleanName = stripHtml(name || '');
    if (!cleanName || cleanName.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    } else if (!NAME_RE.test(cleanName)) {
      errors.name = 'Name can only contain letters, spaces, hyphens, and apostrophes';
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      errors.email = 'Email is required';
    } else if (!EMAIL_RE.test(cleanEmail)) {
      errors.email = 'Invalid email address';
    }

    if (!password || password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (password && password.length > 128) {
      errors.password = 'Password must be 128 characters or less';
    }

    const cleanPhone = stripHtml(phone || '');
    if (cleanPhone && !PHONE_RE.test(cleanPhone)) {
      errors.phone = 'Invalid phone number';
    }

    if (Object.keys(errors).length > 0) {
      return badRequest(res, 'Validation failed', errors);
    }

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

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const userResult = await pool.query(
      `INSERT INTO public.users (email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, phone, role, created_at`,
      [cleanEmail, passwordHash, cleanName, cleanPhone || null]
    );

    const user = userResult.rows[0];

    if (process.env.NODE_ENV === 'development') {
      await pool.query(
        'UPDATE public.users SET email_verified = TRUE, email_verified_at = NOW() WHERE id = $1',
        [user.id]
      );
    }

    const agentResult = await pool.query(
      `INSERT INTO public.agents (user_id, full_name, email, phone, license_number, specialties, bio, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [user.id, cleanName, cleanEmail, cleanPhone || null, license_number || null, specialties || null, bio || null]
    );

    const agentId = agentResult.rows[0].id;

    const jwtUser = { id: user.id, email: user.email, name: cleanName, role: user.role || 'user' };
    const tokens = await refreshTokenService.generateTokens(
      jwtUser,
      req.headers['user-agent'] || null,
      req.ip
    );

    return res.status(201).json({
      success: true,
      message: 'Agent account created successfully.',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: cleanName,
        phone: cleanPhone || '',
        role: user.role || 'user',
        is_agent: true,
        agent_status: 'pending',
        agent_id: agentId,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }
    console.error('[agentAuthController] register failed:', err);
    next(err);
  }
}

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

    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.password_hash, u.email_verified, u.role,
              a.id AS agent_id, a.status AS agent_status
       FROM public.users u
       JOIN agents a ON a.user_id::text = u.id::text
       WHERE u.email = $1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'No agent account found with this email.',
      });
    }

    const user = result.rows[0];

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

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

    return authResponse(res, {
      ...user,
      is_agent: true,
      agent_id: user.agent_id,
      agent_status: user.agent_status,
    }, tokens.accessToken, 'Signed in as agent!', tokens.refreshToken);
  } catch (err) {
    console.error('[agentAuthController] login failed:', err);
    next(err);
  }
}

async function devLogin(req, res, next) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const devEmail = 'agent@vasurealty.com';
    const devPassword = 'Agent@123';
    const devName = 'Demo Agent';

    let result = await pool.query(
      'SELECT u.id, u.email, u.name, u.phone, u.password_hash, u.email_verified, u.role, a.id AS agent_id, a.status AS agent_status FROM public.users u LEFT JOIN agents a ON a.user_id::text = u.id::text WHERE u.email = $1',
      [devEmail]
    );

    let user;
    if (result.rows.length === 0) {
      const passwordHash = await bcrypt.hash(devPassword, 10);
      result = await pool.query(
        `INSERT INTO public.users (email, password_hash, name, phone, email_verified)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, email, name, phone, role, created_at`,
        [devEmail, passwordHash, devName, null]
      );
      user = result.rows[0];

      await pool.query(
        `INSERT INTO public.agents (user_id, full_name, email, status)
         VALUES ($1, $2, $3, 'approved')
         RETURNING id`,
        [user.id, devName, devEmail]
      );

      result = await pool.query(
        'SELECT u.id, u.email, u.name, u.phone, u.password_hash, u.email_verified, u.role, a.id AS agent_id, a.status AS agent_status FROM public.users u JOIN agents a ON a.user_id::text = u.id::text WHERE u.id = $1',
        [user.id]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      if (!user.email_verified) {
        await pool.query(
          'UPDATE public.users SET email_verified = TRUE WHERE id = $1',
          [user.id]
        );
        user.email_verified = true;
      }
      if (!user.agent_id) {
        const agentResult = await pool.query(
          `INSERT INTO public.agents (user_id, full_name, email, status)
           VALUES ($1, $2, $3, 'approved')
           RETURNING id`,
          [user.id, user.name, user.email]
        );
        user.agent_id = agentResult.rows[0].id;
        user.agent_status = 'approved';
      }
    }

    const tokens = await refreshTokenService.generateTokens(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      req.headers['user-agent'] || null,
      req.ip
    );

    return authResponse(res, {
      ...user,
      is_agent: true,
      agent_id: user.agent_id,
      agent_status: user.agent_status || 'approved',
    }, tokens.accessToken, 'Dev agent login successful!', tokens.refreshToken);
  } catch (err) {
    console.error('[agentAuthController] devLogin failed:', err);
    next(err);
  }
}

module.exports = { register, login, devLogin };
