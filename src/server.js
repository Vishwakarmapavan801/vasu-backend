if (!process.env.RENDER) {
  require('dotenv').config();
}

const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const pool = require('./config/database');

const { PORT, CLIENT_URL, NODE_ENV } = require('./config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const compression = require('./middleware/compression');

// Production Services
const { initSentry, captureException } = require('./services/monitoring/sentry');
const logger = require('./services/monitoring/logger');
const { getHealth, getReadiness } = require('./services/monitoring/healthCheck');
const { initEmail } = require('./services/email/emailService');
const { initSMS } = require('./services/sms/smsService');
const { initStripe } = require('./services/billing/stripeService');
const { initQueue } = require('./services/queue/queueService');
const { initCalendar } = require('./services/calendar/calendarService');
const { initBackup } = require('./services/backup/backupService');

// ============================================================
// JotForm Integration – start after DB is ready
// ============================================================
const jotformService = require('./services/jotformService');

const mlsRoutes = require('./routes/mls');
const preApprovalRoutes = require('./routes/preApproval');
const formRoutes = require('./routes/formRoutes');
const authRoutes = require('./routes/auth');
const favoritesRoutes = require('./routes/favorites');
const agentRoutes = require('./routes/agent');
const propertyInteractionRoutes = require('./routes/propertyInteraction');
const agentModuleRoutes = require('./modules/agent/routes/agentRoutes');
const socialRoutes = require('./modules/social/routes/socialRoutes');
const marketRoutes = require('./modules/market/routes/marketRoutes');
const blogRoutes = require('./modules/blog/routes/blogRoutes');
const crmRoutes = require('./modules/crm/routes/crmRoutes');
const insightsRoutes = require('./modules/insights/routes/insightsRoutes');
const operationsRoutes = require('./modules/operations/routes/operationsRoutes');
const growthRoutes = require('./modules/growth/routes/growthRoutes');
const monetizationRoutes = require('./modules/monetization/routes/monetizationRoutes');
const auditRoutes = require('./routes/audit');

const securityMiddleware = require('./middleware/security/securityHeaders');
const { publicLimiter, agentLimiter, dashboardLimiter } = require('./middleware/security/rateLimiters');

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = new Set([
  CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
].filter(Boolean));

if (process.env.CORS_ALLOWED_ORIGINS) {
  process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean).forEach((origin) => allowedOrigins.add(origin));
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
    if (allowedOrigins.has(normalizedOrigin) || isLocalhost) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// ============================================================
// Core Middlewares
// ============================================================
app.use(compression);
app.use(helmet({ crossOriginOpenerPolicy: false }));
app.use(cors(corsOptions));
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
securityMiddleware(app);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
});
app.post('/api/auth/login', loginLimiter);

// Stripe webhook needs raw body — mount before JSON parsers
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), require('./routes/webhooks/stripeWebhook'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Production Service Initializations
// ============================================================
initSentry(app);
initEmail();
initSMS();
initStripe();
initQueue();
initCalendar();
initBackup();

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/image/')) {
    return next();
  }
  if (req.path === '/health' || req.path === '/healthz' || req.path === '/readyz' || req.path === '/debug' || req.path === '/db-check') {
    return next();
  }
  return apiLimiter(req, res, next);
});

// ============================================================
// JotForm environment validation at startup
// ============================================================
const JOTFORM_REQUIRED_VARS = [
  'JOTFORM_API_KEY',
  'JOTFORM_FORM_ID_CONTACT', 'JOTFORM_FORM_ID_TOUR', 'JOTFORM_FORM_ID_VALUATION',
  'JOTFORM_FORM_ID_NEWSLETTER', 'JOTFORM_FORM_ID_PREAPPROVAL', 'JOTFORM_FORM_ID_BUYER_AGENT',
  'JOTFORM_FORM_ID_AGENT_INQUIRY', 'JOTFORM_FORM_ID_CALLBACK', 'JOTFORM_FORM_ID_QUICK_QUESTION',
  'JOTFORM_FORM_ID_CAREER', 'JOTFORM_FORM_ID_ONBOARDING', 'JOTFORM_FORM_ID_SELLER_REQUEST',
  'JOTFORM_FORM_ID_AI_DEMO', 'JOTFORM_FORM_ID_AI_CONTACT', 'JOTFORM_FORM_ID_COOKIE_CONSENT',
];
const missingVars = JOTFORM_REQUIRED_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`\n  ⚠ JotForm environment variables not set:\n    - ${missingVars.join('\n    - ')}\n  JotForm submissions will be skipped until these are configured.\n`);
}

// ============================================================
// Cache-Control Headers for MLS Grid API Responses
// ============================================================
app.use('/api', (req, res, next) => {
  const path = req.path;
  if (path.includes('/cities/')) {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  } else if (path.includes('/properties/featured') || path.includes('/properties/sold') || path === '/properties') {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  } else if (path.includes('/properties/listing/') || path.includes('/properties/key/') || path.includes('/properties/')) {
    res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=30');
  } else if (path.includes('/members') || path.includes('/offices') || path.includes('/lookup')) {
    res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=120');
  } else {
    res.set('Cache-Control', 'public, max-age=60');
  }
  next();
});

app.get('/health', async (_req, res, next) => {
  try {
    const health = await getHealth();
    res.json({ success: true, ...health });
  } catch (err) {
    next(err);
  }
});

app.get('/healthz', async (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/readyz', async (_req, res, next) => {
  try {
    const readiness = await getReadiness();
    if (readiness.ready) {
      res.status(200).json({ status: 'ready', ...readiness });
    } else {
      res.status(503).json({ status: 'not ready', ...readiness });
    }
  } catch (err) {
    next(err);
  }
});

app.get('/db-check', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, timestamp: result.rows[0].now });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health/jotform', async (_req, res, next) => {
  try {
    const health = await jotformService.getHealth();
    res.json({ success: true, ...health });
  } catch (error) {
    next(error);
  }
});

app.get('/api/debug', (_req, res) => {
  res.json({
    success: true,
    environment: NODE_ENV,
    mlsBaseUrl: process.env.MLS_GRID_BASE_URL,
    clientUrl: CLIENT_URL,
    nodeVersion: process.version,
  });
});

// MLS Grid property routes (GET only)
app.use('/api/mls', publicLimiter, mlsRoutes);
app.use('/api', publicLimiter, mlsRoutes);

// Public MLS blog (production editorial content from real MLS listings)
app.use('/api/blog', blogRoutes);

// Public AI + MLS blog API (posts, sitemap, RSS)
const publicBlogRoutes = require('./modules/blog/routes/publicBlogRoutes');
app.use('/api/public/blog', publicBlogRoutes);

// Form submission routes (POST) — database-backed
app.use('/api', formRoutes);

// Legacy pre-approval (in-memory fallback, kept for backward compatibility)
app.use('/api/pre-approval', preApprovalRoutes);

// Authentication routes (register, login, logout, me)
app.use('/api/auth', authRoutes);

// Admin panel module (RBAC-gated: every route uses requireAuth + requireRole).
// Mounted early so the /api-mounted agent/crm/social module routers (which
// run router-level auth + resolveAgent) never shadow /api/admin/* paths.
const adminRoutes = require('./modules/admin/routes');
app.use('/api/admin', adminRoutes);

// Favorites routes (CRUD for saved properties)
app.use('/api/favorites', favoritesRoutes);

// Agent contact & saved agents routes (specific prefix, mounted before agent/:id wildcard)
const agentContactsRoutes = require('./routes/agentContacts');

app.use('/api/agents', agentContactsRoutes);

// Agent profile routes
app.use('/api', agentLimiter, agentRoutes);

// Property interaction routes (recently viewed, comparisons, history)
app.use('/api', publicLimiter, propertyInteractionRoutes);

// Saved search routes (CRUD for saved property searches)
const savedSearchesRoutes = require('./routes/savedSearches');
const notificationsRoutes = require('./routes/notifications');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/saved-searches', savedSearchesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/dashboard', dashboardLimiter, dashboardRoutes);

// AI Chat routes (OpenAI-powered property search)
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

// Testimonials route (featured agent reviews)
const testimonialsRoutes = require('./routes/testimonials');
app.use('/api/testimonials', testimonialsRoutes);

// Agent Module routes (v6 - production-grade agent system)
app.use('/api', agentModuleRoutes);

// Social Module routes (v8 - Instagram-style social platform)
app.use('/api', socialRoutes);

// Market Module routes (v9 - neighborhoods, schools, commute, ZIP stats)
app.use('/api', marketRoutes);

// Insights Module routes (v9 - comparisons, mortgage, AI, analytics, listing metadata)
// Mounted before the auth-gated /api routers (CRM) so their router-level
// requireAuth doesn't shadow the public AI/analytics endpoints.
app.use('/api', insightsRoutes);

// CRM Module routes (v9 - agent lead management)
app.use('/api', crmRoutes);

// Operations Module routes (v10 - lead capture, tours, offers, transactions, attribution)
app.use('/api', operationsRoutes);

// Growth Module routes (v10 - agent growth, feed scoring)
app.use('/api', growthRoutes);

// Monetization Module routes (v10 - featured listings/agents, subscriptions)
app.use('/api', monetizationRoutes);

// Upload routes (image/video/file uploads with multer)
const uploadRoutes = require('./routes/upload');
app.use('/api/upload', uploadRoutes);

// Admin audit log routes
app.use('/api/admin', auditRoutes);

// Serve uploaded files as static (development) or production
const uploadsPath = path.join(__dirname, '../uploads');
if (NODE_ENV === 'production') {
  app.use('/uploads', express.static(uploadsPath));
} else {
  app.use('/uploads', express.static(uploadsPath));
}

// Production static file serving with immutable cache headers
if (NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (/\.(js|css|avif|svg|woff2?|png|jpg|jpeg|gif|webp|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\.html$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));
}

// 404 handler
app.use('/api', notFoundHandler);
app.use(errorHandler);

// SPA fallback for production
if (NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist', 'index.html'));
  });
}

const serverPort = PORT || process.env.PORT || 5000;

app.listen(serverPort, () => {
  const dbCfg = pool._dbConfig || {};
  const dbHost = dbCfg.host || 'not set';
  const dbName = dbCfg.database || (dbCfg.useDatabaseUrl ? new URL(dbCfg.connectionString).pathname.replace('/', '') : process.env.DB_NAME) || 'not set';

  console.log(`\n  Vasu Realty MLS API Server`);
  console.log(`  ───────────────────────────────`);
  console.log(`  Environment    : ${NODE_ENV}`);
  console.log(`  Port           : ${serverPort}`);
  console.log(`  MLS Grid       : ${process.env.MLS_GRID_BASE_URL || 'not set'}`);
  console.log(`  Database       : ${dbName}`);
  console.log(`  Host           : ${dbHost}`);
  console.log(`  Connection     : ${dbCfg.type || 'unknown'}`);
  console.log(`  CORS Origin    : ${CLIENT_URL}`);
  console.log(`  Email          : ${process.env.SENDGRID_API_KEY ? 'SendGrid' : 'disabled'}`);
  console.log(`  SMS            : ${process.env.TWILIO_ACCOUNT_SID ? 'Twilio' : 'disabled'}`);
  console.log(`  Stripe         : ${process.env.STRIPE_SECRET_KEY ? 'enabled' : 'disabled'}`);
  console.log(`  Redis          : ${process.env.REDIS_URL || 'disabled'}`);
  console.log(`  Calendar       : ${process.env.GOOGLE_CALENDAR_CLIENT_EMAIL ? 'Google' : 'disabled'}`);
  console.log(`  Sentry         : ${process.env.SENTRY_DSN ? 'enabled' : 'disabled'}`);
  console.log(`  Backup         : ${process.env.AWS_ACCESS_KEY_ID ? 'S3 + local' : 'local only'}`);
  console.log(`  ───────────────────────────────`);
  console.log(`  Server running at http://localhost:${serverPort}\n`);

  // Start JotForm background processor after DB is confirmed ready
  console.log('  Starting JotForm sync queue processor...');
  jotformService.startBackgroundProcessor();

  // Start media pipeline warmup (persist originals + pre-generate variants
  // for the hottest featured/search media keys at idle).
  const { startMediaWarmup } = require('./jobs/mediaWarmup');
  startMediaWarmup();
  console.log('  Media warmup started (featured + search result images)\n');

  // Start daily AI blog generation cron (default 8:00 AM local).
  const { startBlogCron } = require('./jobs/blogCron');
  startBlogCron();

  // Start production background workers if Redis is available
  if (process.env.REDIS_URL) {
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    const { createMLSSyncWorker } = require('./jobs/mlsSyncWorker');
    const { createEmailWorker } = require('./jobs/emailWorker');
    const { createSMSWorker } = require('./jobs/smsWorker');
    const { createAnalyticsWorker } = require('./jobs/analyticsWorker');

    createMLSSyncWorker(connection);
    createEmailWorker(connection);
    createSMSWorker(connection);
    createAnalyticsWorker(connection);

    console.log('  Background workers started (MLS sync, email, SMS, analytics)\n');
  }
});
