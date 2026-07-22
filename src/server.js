// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const helmet = require('helmet');
// const morgan = require('morgan');
// const rateLimit = require('express-rate-limit');
// const { PORT, CLIENT_URL } = require('./config');
// const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
// const mlsRoutes = require('./routes/mls');
// const preApprovalRoutes = require('./routes/preApproval');

// const app = express();

// app.use(helmet());
// app.use(cors({
//   origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'].filter(Boolean),
//   credentials: true,
// }));
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true }));
// app.use(morgan('dev'));

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { success: false, error: 'Too many requests, please try again later.' },
// });
// app.use('/api/', limiter);


// require("dotenv").config();

// const express = require("express");
// const pool = require("./config/database");

// const app = express();

// app.use(express.json());

// app.get("/", async (req, res) => {
//     const result = await pool.query("SELECT NOW()");
//     res.json(result.rows);
// });

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//     console.log(`Server Running On Port ${PORT}`);
// });


// // ============================================================
// // Cache-Control Headers for MLS Grid API Responses
// //
// // CRITICAL: These headers tell the browser how long to cache
// // the JSON response. Without them, every page navigation or
// // tab switch re-fetches from the backend, which re-fetches
// // from MLS Grid, generating NEW signed MediaURLs each time.
// //
// // Property list cache: 5 minutes  (max-age=300)
// // Property detail cache: 2 minutes (max-age=120)
// // Static data (members, offices): 10 minutes (max-age=600)
// // Other API responses: 1 minute (max-age=60)
// // ============================================================
// // NOTE: Mounted on '/api' only (not also '/api/mls') because
// // Express middleware matching is prefix-based — '/api' covers
// // both '/api/properties/*' and '/api/mls/properties/*' paths.
// // A separate '/api/mls' mount would process the same request twice.
// app.use('/api', (req, res, next) => {
//   const path = req.path;
//   if (path.includes('/cities/')) {
//     res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
//   } else if (path.includes('/properties/featured') || path.includes('/properties/sold') || path === '/properties') {
//     res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
//   } else if (path.includes('/properties/listing/') || path.includes('/properties/key/') || path.includes('/properties/')) {
//     res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=30');
//   } else if (path.includes('/members') || path.includes('/offices') || path.includes('/lookup')) {
//     res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=120');
//   } else {
//     res.set('Cache-Control', 'public, max-age=60');
//   }
//   next();
// });

// app.get('/health', (_req, res) => {
//   res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
// });

// app.get('/api/debug', (_req, res) => {
//   res.json({
//     success: true,
//     environment: process.env.NODE_ENV || 'development',
//     mlsBaseUrl: process.env.MLS_GRID_BASE_URL,
//     clientUrl: CLIENT_URL,
//     nodeVersion: process.version,
//   });
// });

// app.use('/api/mls', mlsRoutes);
// app.use('/api', mlsRoutes);

// app.use('/api/pre-approval', preApprovalRoutes);

// app.use('/api', notFoundHandler);
// app.use(errorHandler);

// app.listen(PORT, () => {
//   console.log(`\n  Vasu Realty MLS API Server`);
//   console.log(`  ─────────────────────────`);
//   console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
//   console.log(`  Port        : ${PORT}`);
//   console.log(`  MLS Grid    : ${process.env.MLS_GRID_BASE_URL}`);
//   console.log(`  CORS Origin : ${CLIENT_URL}`);
//   console.log(`  ─────────────────────────`);
//   console.log(`  Server running at http://localhost:${PORT}\n`);
// });











require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Database Connection
const pool = require('./config/database');

// Configuration & Middlewares
const { PORT, CLIENT_URL } = require('./config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Routes
const mlsRoutes = require('./routes/mls');
const preApprovalRoutes = require('./routes/preApproval');
const formRoutes = require('./routes/formRoutes');
const app = express();

// ============================================================
// Core Middlewares
// ============================================================
app.use(helmet());
app.use(cors({
  origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate Limiter for API Endpoints
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

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

// Database Test Endpoint
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
    environment: process.env.NODE_ENV || 'development',
    mlsBaseUrl: process.env.MLS_GRID_BASE_URL,
    clientUrl: CLIENT_URL,
    nodeVersion: process.version,
  });
});



// MLS Grid property routes (GET only)
app.use('/api/mls', mlsRoutes);
app.use('/api', mlsRoutes); // Also mount at /api so /api/properties/featured works without /mls prefix

// Form submission routes (POST) — database-backed
app.use('/api', formRoutes);

// Legacy pre-approval (in-memory fallback, kept for backward compatibility)
// New submissions go through formRoutes (/api/pre-approval) and are stored in PostgreSQL
app.use('/api/pre-approval', preApprovalRoutes);

// 404 handler
app.use('/api', notFoundHandler);
app.use(errorHandler);


const serverPort = PORT || process.env.PORT || 5000;

app.listen(serverPort, () => {
  console.log(`\n  Vasu Realty MLS API Server`);
  console.log(`  ─────────────────────────`);
  console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port        : ${serverPort}`);
  console.log(`  MLS Grid    : ${process.env.MLS_GRID_BASE_URL}`);
  console.log(`  CORS Origin : ${CLIENT_URL}`);
  console.log(`  ─────────────────────────`);
  console.log(`  Server running at http://localhost:${serverPort}\n`);
});