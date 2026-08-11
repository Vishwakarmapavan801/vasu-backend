if (!process.env.JWT_SECRET) {
  console.error('\n  ✘ JWT_SECRET environment variable is required in production.');
  console.error('  Generate one: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

if (!process.env.MLS_GRID_BASE_URL) {
  console.warn('\n  ⚠ MLS_GRID_BASE_URL not set. Using api-demo.mlsgrid.com (not for production).\n');
}

const config = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MEDIA_CACHE_DIR: process.env.MEDIA_CACHE_DIR,

  // Media pipeline (variant pre-generation + persistent cache)
  MEDIA_PIPELINE_ENABLED: process.env.MEDIA_PIPELINE_ENABLED !== 'false',
  MEDIA_VARIANT_WIDTHS: (process.env.MEDIA_VARIANT_WIDTHS || '160,320,480,640,800,1200,1600')
    .split(',').map(w => parseInt(w, 10)).filter(w => Number.isFinite(w) && w > 0),
  MEDIA_VARIANT_FORMATS: (process.env.MEDIA_VARIANT_FORMATS || 'webp,avif,jpeg')
    .split(',').map(f => f.trim().toLowerCase()).filter(f => ['webp', 'avif', 'jpeg'].includes(f)),
  MEDIA_WARM_CONCURRENCY: parseInt(process.env.MEDIA_WARM_CONCURRENCY, 10) || 2,
  MEDIA_WARM_INTERVAL_MS: parseInt(process.env.MEDIA_WARM_INTERVAL_MS, 10) || 5 * 60 * 1000,
  MEDIA_WARM_MAX_KEYS: parseInt(process.env.MEDIA_WARM_MAX_KEYS, 10) || 600,
  MEDIA_METRICS_ENABLED: process.env.MEDIA_METRICS_ENABLED !== 'false',
  MLS_GRID_ACCESS_TOKEN: process.env.MLS_GRID_ACCESS_TOKEN,
  MLS_GRID_BASE_URL: process.env.MLS_GRID_BASE_URL,
  MLS_GRID_TIMEOUT: parseInt(process.env.MLS_GRID_TIMEOUT) || 30000,
  MLS_GRID_MAX_RETRIES: parseInt(process.env.MLS_GRID_MAX_RETRIES) || 3,
  CLIENT_URL: process.env.CLIENT_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  COMPANY_FOUNDED_YEAR: parseInt(process.env.COMPANY_FOUNDED_YEAR, 10) || 2019,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  OPENAI_MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 1024,
  OPENAI_TIMEOUT: parseInt(process.env.OPENAI_TIMEOUT, 10) || 15000,
  OPENAI_MAX_RETRIES: parseInt(process.env.OPENAI_MAX_RETRIES, 10) || 2,

  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY,

  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@vasurealty.com',
  EMAIL_TO: process.env.EMAIL_TO || 'thawaitrealty@gmail.com',

  FIRM_LICENSE: process.env.FIRM_LICENSE,
  SECONDARY_FIRM_LICENSE: process.env.SECONDARY_FIRM_LICENSE,
  LIST_OFFICE_MLS_ID: process.env.LIST_OFFICE_MLS_ID || process.env.FIRM_LICENSE,
  NC_AGENT_LICENSE: process.env.NC_AGENT_LICENSE,
  SC_AGENT_LICENSE: process.env.SC_AGENT_LICENSE,

  BROKERAGE_ADDRESS: process.env.BROKERAGE_ADDRESS,
  BROKERAGE_SECONDARY_ADDRESS: process.env.BROKERAGE_SECONDARY_ADDRESS,
  BROKERAGE_NAME: process.env.BROKERAGE_NAME || 'Vasu Realty',
};

module.exports = config;
