require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MLS_GRID_ACCESS_TOKEN: process.env.MLS_GRID_ACCESS_TOKEN,
  MLS_GRID_BASE_URL: process.env.MLS_GRID_BASE_URL || 'https://api-demo.mlsgrid.com/v2',
  MLS_GRID_TIMEOUT: process.env.MLS_GRID_TIMEOUT || 30000,
  MLS_GRID_MAX_RETRIES: process.env.MLS_GRID_MAX_RETRIES || 3,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
};
