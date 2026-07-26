/**
 * CAPTCHA Verification Middleware
 *
 * Express middleware that verifies Cloudflare Turnstile CAPTCHA tokens
 * on every protected route. Must be applied BEFORE the route handler.
 *
 * Usage:
 *   router.post('/contact', verifyCaptcha, formLimiter, controller.submitContact);
 *
 * The middleware expects the CAPTCHA token in req.body.captchaToken.
 * On failure, it returns 403 with a descriptive error message.
 * No business logic executes after a failed verification.
 */

const { verifyCaptchaToken } = require('../services/captchaVerification');

/**
 * Extract client IP from the request.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '';
}

/**
 * CAPTCHA verification middleware.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function verifyCaptcha(req, res, next) {
  // Extract token from request body
  const token = req.body?.captchaToken;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(403).json({
      success: false,
      error: 'CAPTCHA verification required. Please complete the security challenge.',
    });
  }

  const clientIp = getClientIp(req);
  const result = await verifyCaptchaToken(token, clientIp);

  if (!result.success) {
    return res.status(403).json({
      success: false,
      error: result.error || 'CAPTCHA verification failed.',
    });
  }

  // Token is valid — proceed to the route handler
  // Remove the token from the body so it doesn't get stored in the database
  delete req.body.captchaToken;
  next();
}

module.exports = { verifyCaptcha };
