const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  // CORS
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],

  // MongoDB (used for admin, auth, contacts only — NOT properties)
  // Set MONGODB_URI env var if you need auth/admin features. MLS Grid works without it.
  mongodbUri: process.env.MONGODB_URI || null,

  // MLS API (all property data comes from here)
  mls: {
    baseUrl: process.env.MLS_GRID_BASE_URL || process.env.MLS_BASE_URL,
    apiKey: process.env.MLS_API_KEY,
    clientId: process.env.MLS_CLIENT_ID,
    clientSecret: process.env.MLS_CLIENT_SECRET,
    // MLS Grid OData API Bearer token
    accessToken: process.env.MLS_GRID_ACCESS_TOKEN,
  },

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'vasu-realty-jwt-secret',
  jwtExpire: process.env.JWT_EXPIRE || '30d',
  jwtCookieExpire: parseInt(process.env.JWT_COOKIE_EXPIRE, 10) || 30,

  // File uploads
  fileUploadPath: process.env.FILE_UPLOAD_PATH || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024,
};

module.exports = config;
