module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MLS_GRID_ACCESS_TOKEN: process.env.MLS_GRID_ACCESS_TOKEN,
  MLS_GRID_BASE_URL: process.env.MLS_GRID_BASE_URL || 'https://api-demo.mlsgrid.com/v2',
  MLS_GRID_TIMEOUT: process.env.MLS_GRID_TIMEOUT || 30000,
  MLS_GRID_MAX_RETRIES: process.env.MLS_GRID_MAX_RETRIES || 3,
  CLIENT_URL: process.env.CLIENT_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  COMPANY_FOUNDED_YEAR: parseInt(process.env.COMPANY_FOUNDED_YEAR, 10) || 2019,

  JWT_SECRET: process.env.JWT_SECRET || 'vasu-realty-jwt-secret-change-in-production',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  OPENAI_MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 1024,
  OPENAI_TIMEOUT: parseInt(process.env.OPENAI_TIMEOUT, 10) || 15000,
  OPENAI_MAX_RETRIES: parseInt(process.env.OPENAI_MAX_RETRIES, 10) || 2,

  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY,

  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@vasurealty.com',
  EMAIL_TO: process.env.EMAIL_TO || 'thawaitrealty@gmail.com',
};
