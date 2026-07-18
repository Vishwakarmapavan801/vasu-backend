require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { PORT, CLIENT_URL } = require('./config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const mlsRoutes = require('./routes/mls');

const app = express();

app.use(helmet());
app.use(cors({
  origin: [CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000'].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
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

app.use('/api/mls', mlsRoutes);

app.get('/api/mls/demo', async (_req, res, next) => {
  try {
    const { getProperties } = require('./services/propertyService');
    const result = await getProperties({ status: 'Active', mlgCanView: true, top: 10 });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/mls/media-listings', async (req, res, next) => {
  try {
    const { getProperties } = require('./services/propertyService');
    const result = await getProperties({ ...require('./utils/parseQueryParams').parseQueryParams(req), top: 10 });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  Vasu Realty MLS API Server`);
  console.log(`  ─────────────────────────`);
  console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port        : ${PORT}`);
  console.log(`  MLS Grid    : ${process.env.MLS_GRID_BASE_URL}`);
  console.log(`  CORS Origin : ${CLIENT_URL}`);
  console.log(`  ─────────────────────────`);
  console.log(`  Server running at http://localhost:${PORT}\n`);
});
