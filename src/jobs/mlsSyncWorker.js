const { Worker } = require('bullmq');
const logger = require('../services/monitoring/logger');
const { captureException } = require('../services/monitoring/sentry');
const mlsSyncService = require('../services/mls/mlsSyncService');

function createMLSSyncWorker(connection) {
  const worker = new Worker('mls-sync', async (job) => {
    const { name, data } = job;
    logger.info(`Processing MLS sync job: ${name}`, { jobId: job.id });

    switch (name) {
      case 'full-sync':
        const syncCount = await runFullSync();
        await mlsSyncService.updateSyncStatus('completed', syncCount);
        return { syncCount };
      case 'incremental-sync':
        return await runIncrementalSync(data);
      case 'process-webhook':
        return await mlsSyncService.processWebhook(data);
      case 'retry-errors':
        return await mlsSyncService.retrySyncErrors();
      default:
        logger.warn(`Unknown MLS sync job: ${name}`);
    }
  }, { connection, concurrency: 2 });

  worker.on('failed', (job, err) => {
    logger.error(`MLS sync job ${job?.id} failed`, { error: err.message });
    captureException(err, { extra: { jobId: job?.id, jobName: job?.name } });
  });

  return worker;
}

async function runFullSync() {
  logger.warn('Full MLS sync requested but no bulk sync pipeline is configured');
  throw new Error(
    'Full MLS sync is not configured. Listings are served live from MLS Grid; ' +
    'no bulk import pipeline exists yet.'
  );
}

async function runIncrementalSync(data) {
  logger.warn('Incremental MLS sync requested but no bulk sync pipeline is configured', { since: data?.since });
  throw new Error(
    'Incremental MLS sync is not configured. Listings are served live from MLS Grid; ' +
    'only webhook-based updates are supported.'
  );
}

module.exports = { createMLSSyncWorker };
