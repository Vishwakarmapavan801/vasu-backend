const helmet = require('helmet');

module.exports = function securityMiddleware(app) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://js.stripe.com', 'https://maps.googleapis.com', 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com', 'https://www.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.mlsgrid.com', 'https://*.cloudinary.com', 'https://maps.gstatic.com', 'https://*.googleapis.com', 'https://www.gstatic.com', 'https://*.googleusercontent.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://www.gstatic.com'],
        connectSrc: ["'self'", 'https://api.stripe.com', 'https://*.sentry.io', 'https://maps.googleapis.com', 'https://accounts.google.com', 'https://oauth2.googleapis.com'],
        frameSrc: ["'self'", 'https://js.stripe.com', 'https://accounts.google.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), interest-cohort=()');
    next();
  });
};
