if (!process.env.RENDER) {
  require('dotenv').config();
}

const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const pool = require('./config/database');

const { PORT, CLIENT_URL, NODE_ENV } = require('./config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const compression = require('./middleware/compression');

const mlsRoutes = require('./routes/mls');
const preApprovalRoutes = require('./routes/preApproval');
const formRoutes = require('./routes/formRoutes');
const authRoutes = require('./routes/auth');
const favoritesRoutes = require('./routes/favorites');

const app = express();

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
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/image/')) {
    return next();
  }
  if (req.path === '/health' || req.path === '/debug' || req.path === '/db-check') {
    return next();
  }
  return apiLimiter(req, res, next);
});

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

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/db-check', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, timestamp: result.rows[0].now });
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
app.use('/api/mls', mlsRoutes);
app.use('/api', mlsRoutes);

// Form submission routes (POST) — database-backed
app.use('/api', formRoutes);

// Legacy pre-approval (in-memory fallback, kept for backward compatibility)
app.use('/api/pre-approval', preApprovalRoutes);

// Authentication routes (register, login, logout, me)
app.use('/api/auth', authRoutes);

// Favorites routes (CRUD for saved properties)
app.use('/api/favorites', favoritesRoutes);

// AI Chat routes (OpenAI-powered property search)
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

// 404 handler
app.use('/api', notFoundHandler);
app.use(errorHandler);

const serverPort = PORT || process.env.PORT || 5000;

app.listen(serverPort, () => {
  const dbCfg = pool._dbConfig || {};
  const dbHost = dbCfg.host || 'not set';
  const dbName = dbCfg.database || (dbCfg.useDatabaseUrl ? new URL(dbCfg.connectionString).pathname.replace('/', '') : process.env.DB_NAME) || 'not set';

  console.log(`\n  Vasu Realty MLS API Server`);
  console.log(`  ─────────────────────────`);
  console.log(`  Environment : ${NODE_ENV}`);
  console.log(`  Port        : ${serverPort}`);
  console.log(`  MLS Grid    : ${process.env.MLS_GRID_BASE_URL || 'not set'}`);
  console.log(`  Database    : ${dbName}`);
  console.log(`  Host        : ${dbHost}`);
  console.log(`  Connection  : ${dbCfg.type || 'unknown'}`);
  console.log(`  CORS Origin : ${CLIENT_URL}`);
  console.log(`  ─────────────────────────`);
  console.log(`  Server running at http://localhost:${serverPort}\n`);
});
