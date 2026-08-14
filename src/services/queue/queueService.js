const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../monitoring/logger');

let connection = null;
const queues = {};

function initQueue() {
  if (!process.env.REDIS_URL) {
    logger.info('REDIS_URL not set — Redis/BullMQ disabled (queues run degraded)');
    return false;
  }

  const redisUrl = process.env.REDIS_URL;

  try {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 10) {
          logger.error('Redis connection failed after 10 retries');
          return null;
        }
        return Math.min(times * 200, 5000);
      },
    });

    connection.on('connect', () => logger.info('Redis connected'));
    connection.on('error', (err) => logger.error('Redis error', { error: err.message }));

    // Define queues
    const queueDefinitions = {
      'mls-sync': { defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 } } },
      'email': { defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } },
      'sms': { defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } },
      'analytics': { defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 10000 } } },
      'ai': { defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 5000 } } },
      'alerts': { defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 3000 } } },
      'billing': { defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } } },
      'feed-ranking': { defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 10000 } } },
    };

    for (const [name, opts] of Object.entries(queueDefinitions)) {
      queues[name] = new Queue(name, { connection, ...opts });
    }

    logger.info('BullMQ queues initialized', { queues: Object.keys(queues) });
    return true;
  } catch (err) {
    logger.error('Failed to initialize Redis/BullMQ', { error: err.message });
    return false;
  }
}

async function addJob(queueName, jobName, data, opts = {}) {
  if (!queues[queueName]) {
    logger.warn(`Queue "${queueName}" not found, running synchronously`);
    return null;
  }

  const job = await queues[queueName].add(jobName, data, {
    removeOnComplete: { age: 3600 * 24 * 7 },
    removeOnFail: { age: 3600 * 24 * 30 },
    ...opts,
  });

  return job;
}

async function getQueueMetrics(queueName) {
  if (!queues[queueName]) return null;
  const queue = queues[queueName];
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

async function getFailedJobs(queueName, start = 0, end = 20) {
  if (!queues[queueName]) return [];
  const queue = queues[queueName];
  const jobs = await queue.getFailed(start, end);
  return jobs.map(j => ({
    id: j.id,
    name: j.name,
    data: j.data,
    failedReason: j.failedReason,
    attemptsMade: j.attemptsMade,
    timestamp: j.timestamp,
    processedOn: j.processedOn,
    finishedOn: j.finishedOn,
  }));
}

async function retryFailedJob(queueName, jobId) {
  if (!queues[queueName]) return null;
  const queue = queues[queueName];
  const job = await queue.getJob(jobId);
  if (job) {
    await job.retry();
    return true;
  }
  return false;
}

async function closeAll() {
  if (!connection) return;
  for (const queue of Object.values(queues)) {
    await queue.close();
  }
  await connection.quit();
}

module.exports = {
  initQueue, addJob, getQueueMetrics, getFailedJobs, retryFailedJob, closeAll, queues,
};
