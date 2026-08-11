const pool = require('../../config/database');
const logger = require('./logger');

let startTime = Date.now();

async function getHealth() {
  const checks = {
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.RELEASE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  let dbOk = false;
  let dbLatency = 0;

  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    dbLatency = Date.now() - dbStart;
    dbOk = true;
  } catch (err) {
    logger.error('Health check — DB failed', { error: err.message });
  }

  checks.database = { status: dbOk ? 'healthy' : 'unhealthy', latencyMs: dbLatency };
  checks.overall = Object.values(checks).every(c => c === true || c?.status === 'healthy') ? 'healthy' : 'degraded';

  return checks;
}

async function getReadiness() {
  const health = await getHealth();
  const redisOk = checkRedis();

  return {
    ...health,
    redis: { status: redisOk ? 'healthy' : 'degraded' },
    ready: health.database.status === 'healthy',
  };
}

function checkRedis() {
  try {
    const redisUrl = process.env.REDIS_URL;
    return !!redisUrl;
  } catch {
    return false;
  }
}

module.exports = { getHealth, getReadiness };
