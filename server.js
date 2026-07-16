/**
 * Vasu Realty Backend Server
 *
 * Express application entry point.
 * Serves all API routes and connects to MLS Grid API for real property data.
 * No mock/fake/hardcoded/cached property data is used.
 * All property data flows: Frontend → Backend → MLS Service → MLS Grid API
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const config = require('./config/config');
const connectDB = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// ========== WARN ABOUT DEFAULT CREDENTIALS ==========

if (!config.mls.accessToken || config.mls.accessToken === 'your-access-token-here') {
  console.warn('⚠️  WARNING: MLS Grid access token is not configured in .env');
  console.warn('   Using hardcoded development token (api-demo only)');
}

// ========== INITIALIZE APP ==========

const app = express();
const PORT = config.port || 5000;

// ========== MIDDLEWARE ==========

// Request logging
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

// CORS
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// ========== MONGODB IS OPTIONAL ==========

// MongoDB is NOT required to run the server.
// All property data comes from the MLS Grid API and works without a database.
// Auth, admin, and contact features require MongoDB — set MONGODB_URI in .env if needed.
let mongoConnected = false;

if (config.mongodbUri) {
  // MONGODB_URI is set, attempt connection for auth/admin/contact features
  connectDB()
    .then(() => {
      mongoConnected = true;
      console.log('✅ MongoDB features enabled (auth, admin, contact)');
    })
    .catch((err) => {
      console.warn('⚠️  MongoDB connection failed — auth/admin/contact features unavailable');
      console.warn(`   Error: ${err.message}`);
      console.warn('   MLS Grid property endpoints still work.');
    });
} else {
  // No MONGODB_URI set — skip database entirely
  console.log('ℹ️  MongoDB not configured — auth/admin/contact features are disabled.');
  console.log('   MLS Grid property endpoints work normally.');
  console.log('   To enable auth/admin/contact, set MONGODB_URI in your .env file.');
}

// ========== ROUTES ==========

// Import route modules
const mlsRoutes = require('./routes/mlsRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const buySellRoutes = require('./routes/buySellRoutes');
const landRoutes = require('./routes/landRoutes');
const investmentRoutes = require('./routes/investmentRoutes');
const multifamilyRoutes = require('./routes/multifamilyRoutes');
const propertyManagementRoutes = require('./routes/propertyManagementRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const contactRoutes = require('./routes/contactRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Mount routes
app.use('/api/mls', mlsRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/buy-sell', buySellRoutes);
app.use('/api/land', landRoutes);
app.use('/api/investment', investmentRoutes);
app.use('/api/multifamily', multifamilyRoutes);
app.use('/api/property-management', propertyManagementRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Vasu Realty API is running',
    timestamp: new Date().toISOString(),
    dataSource: 'MLS Grid API',
    mongoConnected,
    version: '1.0.0',
  });
});

// ========== ERROR HANDLING ==========

app.use(notFoundHandler);
app.use(errorHandler);

// ========== START SERVER ==========

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  Vasu Realty Backend Server');
  console.log(`  Environment: ${config.nodeEnv}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  MongoDB: ${mongoConnected ? 'Connected' : 'Not connected (optional)'}`);
  console.log(`  Data Source: MLS Grid API (live)`);
  console.log(`  MLS Base URL: ${config.mls.baseUrl || 'https://api-demo.mlsgrid.com/v2'}`);
  console.log('========================================');
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/mls/properties');
  console.log('  GET  /api/mls/properties/featured');
  console.log('  GET  /api/properties');
  console.log('  GET  /api/properties/featured');
  console.log('  GET  /api/buy-sell');
  console.log('  GET  /api/land');
  console.log('  GET  /api/investment');
  console.log('  GET  /api/multifamily');
  console.log('  GET  /api/property-management');
  console.log('  POST /api/contact');
  console.log('  POST /api/auth/login');
  console.log('');
});

module.exports = app;
