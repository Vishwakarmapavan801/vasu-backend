const rateLimit = require('express-rate-limit');
const isDev = () => process.env.NODE_ENV !== 'production';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: isDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: isDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  // Skip image proxy requests: /rent renders dozens of cards and each card
  // requests multiple /api/image variants. The 60/15min budget was returning
  // 429s for the majority of image requests in production, which showed up as
  // gray/blank listing images. The image proxy already has its own bounded
  // concurrency + adaptive CDN rate-limit handling, so it must not share the
  // generic API budget.
  skip: (req) => isDev() || req.path.startsWith('/image/'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: isDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: isDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  skip: isDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many API requests, please slow down.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  skip: isDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many webhook requests.' },
});

// Brute force protection for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: isDev,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Account temporarily locked.' },
});

// Track failed logins per IP/email and lock after N attempts
const failedLoginTracker = new Map();
function checkBruteForce(req, res, next) {
  const key = `${req.ip}-${req.body?.email || 'unknown'}`;
  const attempts = failedLoginTracker.get(key) || 0;
  if (attempts >= 10) {
    return res.status(429).json({ success: false, error: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.' });
  }
  res.on('finish', () => {
    if (res.statusCode === 401) {
      failedLoginTracker.set(key, (failedLoginTracker.get(key) || 0) + 1);
      setTimeout(() => {
        const current = failedLoginTracker.get(key) || 0;
        if (current > 0) failedLoginTracker.set(key, current - 1);
      }, 15 * 60 * 1000);
    } else if (res.statusCode === 200) {
      failedLoginTracker.delete(key);
    }
  });
  next();
}

module.exports = { globalLimiter, authLimiter, apiLimiter, webhookLimiter, loginLimiter, checkBruteForce, publicLimiter, agentLimiter, dashboardLimiter };
