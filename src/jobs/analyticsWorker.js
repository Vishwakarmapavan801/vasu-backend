const { Worker } = require('bullmq');
const logger = require('../services/monitoring/logger');
const { captureException } = require('../services/monitoring/sentry');
const pool = require('../config/database');

function createAnalyticsWorker(connection) {
  const worker = new Worker('analytics', async (job) => {
    const { name, data } = job;
    logger.info(`Processing analytics job: ${name}`, { jobId: job.id });

    switch (name) {
      case 'aggregate-daily':
        return await aggregateDailyStats(data?.date);
      case 'compute-feed-scores':
        return await computeFeedScores();
      case 'cleanup-events':
        return await cleanupOldEvents(data?.retentionDays || 90);
      default:
        logger.warn(`Unknown analytics job: ${name}`);
    }
  }, { connection, concurrency: 1 });

  worker.on('failed', (job, err) => {
    logger.error(`Analytics job ${job?.id} failed`, { error: err.message });
    captureException(err, { extra: { jobId: job?.id, jobName: job?.name } });
  });

  return worker;
}

async function aggregateDailyStats(date) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  logger.info(`Aggregating daily stats for ${targetDate}`);

  await pool.query(`
    INSERT INTO analytics_daily (date, metric, value, created_at)
    SELECT $1, 'page_views', COUNT(*)::int, NOW()
    FROM analytics_events
    WHERE event_type = 'page_view' AND DATE(created_at) = $1::date
    ON CONFLICT (date, metric) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [targetDate]);
}

async function computeFeedScores() {
  logger.info('Computing feed scores');
  await pool.query(`
    UPDATE feed_events SET score = score * 0.95 + COALESCE(
      (SELECT COUNT(*)::int * 10 FROM feed_likes WHERE feed_event_id = feed_events.id AND created_at > NOW() - INTERVAL '7 days')
    , 0)
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
}

async function cleanupOldEvents(retentionDays) {
  logger.info(`Cleaning up analytics events older than ${retentionDays} days`);
  const { rowCount } = await pool.query(
    `DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [retentionDays]
  );
  logger.info(`Cleaned up ${rowCount} analytics events`);
}

module.exports = { createAnalyticsWorker };
