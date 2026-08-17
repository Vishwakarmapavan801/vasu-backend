/**
 * Auth Routes
 *
 * Handles user registration, login, session verification, and logout.
 * All routes are publicly accessible (no auth required) except /me.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { captchaIfConfigured } = require('../middleware/verifyCaptcha');

const router = Router();

// Rate limiting: stricter for auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again later.' },
});

// Public endpoints (rate-limited)
// CAPTCHA is verified server-side when RECAPTCHA_SECRET_KEY is configured —
// the frontend collects the token but it is never trusted client-side.
router.post('/register', authLimiter, captchaIfConfigured, asyncHandler(controller.register));
router.post('/login', authLimiter, captchaIfConfigured, asyncHandler(controller.login));
router.post('/google', authLimiter, asyncHandler(controller.googleLogin));
router.post('/forgot-password', authLimiter, asyncHandler(controller.forgotPassword));
router.post('/reset-password/:token', asyncHandler(controller.resetPassword));
router.put('/reset-password/:token', asyncHandler(controller.resetPassword));
router.post('/logout', asyncHandler(controller.logout));
router.post('/refresh', asyncHandler(controller.refreshToken));

// Email verification
router.get('/verify-email', asyncHandler(controller.verifyEmail));
router.post('/resend-verification', asyncHandler(controller.resendVerification));

// Dev-only: auto-login (no rate limit, no auth required)
router.post('/dev-login', asyncHandler(controller.devLogin));

// Protected endpoints (requires valid JWT)
router.get('/me', requireAuth, asyncHandler(controller.getMe));
router.put('/profile', requireAuth, asyncHandler(controller.updateProfile));
router.put('/change-password', requireAuth, asyncHandler(controller.changePassword));

module.exports = router;
