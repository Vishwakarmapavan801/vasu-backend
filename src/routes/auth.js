/**
 * Auth Routes
 *
 * Handles user registration, login, session verification, and logout.
 * All routes are publicly accessible (no auth required) except /me.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Rate limiting: stricter for auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again later.' },
});

// Public endpoints (rate-limited)
router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/logout', controller.logout);

// Protected endpoint (requires valid JWT)
router.get('/me', requireAuth, controller.getMe);

module.exports = router;
