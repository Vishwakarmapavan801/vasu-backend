const https = require('https');
const http = require('http');
const crypto = require('crypto');
const logger = require('./logger');
const metrics = require('./metrics');
const { createCircuitBreaker, STATES } = require('./circuitBreaker');
const pool = require('../config/database');

const API_KEY = process.env.JOTFORM_API_KEY || '';
const API_BASE = 'api.jotform.com';
const REQUEST_TIMEOUT = parseInt(process.env.JOTFORM_REQUEST_TIMEOUT, 10) || 15000;
const MAX_RETRIES = parseInt(process.env.JOTFORM_MAX_RETRIES, 10) || 5;
const BASE_RETRY_DELAY_MS = parseInt(process.env.JOTFORM_BASE_RETRY_DELAY_MS, 10) || 5000;
const QUEUE_POLL_INTERVAL_MS = parseInt(process.env.JOTFORM_QUEUE_POLL_INTERVAL_MS, 10) || 30000;
const DEAD_LETTER_AFTER_RETRIES = parseInt(process.env.JOTFORM_DEAD_LETTER_AFTER_RETRIES, 10) || 10;

const FORM_IDS = {
  contact: process.env.JOTFORM_FORM_ID_CONTACT || '',
  newsletter: process.env.JOTFORM_FORM_ID_NEWSLETTER || '',
  tour: process.env.JOTFORM_FORM_ID_TOUR || '',
  valuation: process.env.JOTFORM_FORM_ID_VALUATION || '',
  preApproval: process.env.JOTFORM_FORM_ID_PREAPPROVAL || '',
  buyerAgent: process.env.JOTFORM_FORM_ID_BUYER_AGENT || '',
  agentInquiry: process.env.JOTFORM_FORM_ID_AGENT_INQUIRY || '',
  callback: process.env.JOTFORM_FORM_ID_CALLBACK || '',
  quickQuestion: process.env.JOTFORM_FORM_ID_QUICK_QUESTION || '',
  career: process.env.JOTFORM_FORM_ID_CAREER || '',
  onboarding: process.env.JOTFORM_FORM_ID_ONBOARDING || '',
  sellerRequest: process.env.JOTFORM_FORM_ID_SELLER_REQUEST || '',
  aiDemo: process.env.JOTFORM_FORM_ID_AI_DEMO || '',
  aiContact: process.env.JOTFORM_FORM_ID_AI_CONTACT || '',
  cookieConsent: process.env.JOTFORM_FORM_ID_COOKIE_CONSENT || '',
};

const circuitBreaker = createCircuitBreaker();
let processorTimer = null;
let isProcessing = false;

function getFormId(formType) {
  const id = FORM_IDS[formType];
  if (!id) return null;
  return id;
}

function httpRequest(url, body, timeout = REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const reqModule = isHttps ? https : http;
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout,
    };

    const req = reqModule.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' })); });

    if (body) req.write(body);
    req.end();
  });
}

async function submitViaRestApi(formId, data) {
  if (!API_KEY) return { success: false, error: 'JotForm API key not configured', status: 0 };

  const fieldNames = Object.keys(data);
  const submission = {};
  fieldNames.forEach((name, index) => {
    submission[String(index + 1)] = data[name] !== undefined && data[name] !== null ? String(data[name]) : '';
  });

  const url = `https://${API_BASE}/form/${formId}/submissions?apiKey=${API_KEY}`;
  const body = JSON.stringify({ submission: [submission] });

  const startTime = Date.now();
  let result;

  try {
    result = await httpRequest(url, body);
  } catch (err) {
    const duration = Date.now() - startTime;
    metrics.recordTiming(duration);
    return { success: false, error: err.message, status: err.code === 'TIMEOUT' ? 408 : 0, timedOut: err.code === 'TIMEOUT' };
  }

  const duration = Date.now() - startTime;
  metrics.recordTiming(duration);

  if (result.status === 200 || result.status === 201) {
    const submissionId = result.body?.submissionID || result.body?.content?.submissionID || null;
    return { success: true, submissionId, message: 'Submitted to JotForm successfully', status: result.status };
  }

  const errorMsg = result.body?.message || result.body?.content || `JotForm API error (${result.status})`;
  return { success: false, error: errorMsg, status: result.status };
}

function shouldRetry(result) {
  const retryableStatuses = [408, 429, 500, 502, 503, 504, 0];
  if (result.timedOut) return true;
  if (result.status && retryableStatuses.includes(result.status)) return true;
  if (result.status && result.status >= 500) return true;
  return false;
}

function generateIdempotencyKey(formType, data) {
  const stable = `${formType}:${JSON.stringify(data)}:${Date.now()}`;
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 64);
}

async function enqueueForRetry(formType, data, idempotencyKey, options = {}) {
  try {
    await pool.query(
      `INSERT INTO jotform_sync_queue (form_type, idempotency_key, payload, status, max_retries, client_ip, user_agent, db_record_id)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [formType, idempotencyKey, JSON.stringify(data), MAX_RETRIES, options.clientIp || null, options.userAgent || null, options.dbRecordId || null]
    );
  } catch (err) {
    logger.error('Failed to enqueue JotForm submission for retry', {
      error: err, formType, idempotencyKey,
    });
  }
}

async function updateQueueEntry(id, updates) {
  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = $${idx++}`);
    values.push(value);
  }
  values.push(id);
  setClauses.push(`updated_at = NOW()`);

  try {
    await pool.query(
      `UPDATE jotform_sync_queue SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );
  } catch (err) {
    logger.error('Failed to update queue entry', { error: err, queueId: id });
  }
}

async function submitToJotForm(formType, data, options = {}) {
  const formId = getFormId(formType);
  if (!formId) {
    logger.warn('JotForm form ID not configured', { formType });
    return { success: false, error: 'Form ID not configured', skipped: true };
  }

  if (!API_KEY) {
    logger.warn('JotForm API key not configured');
    return { success: false, error: 'API key not configured', skipped: true };
  }

  const startTime = Date.now();
  const idempotencyKey = options.idempotencyKey || generateIdempotencyKey(formType, data);
  metrics.increment('submissionsAttempted', formType);

  if (!circuitBreaker.attempt()) {
    const status = circuitBreaker.getStatus();
    logger.warn('Circuit breaker open, queueing submission', { formType, circuitBreakerState: status.state, remainingCooldown: status.remainingCooldown });

    await enqueueForRetry(formType, data, idempotencyKey, options);
    metrics.increment('submissionsRetried', formType);

    const duration = Date.now() - startTime;
    logger.info('JotForm submission queued (circuit breaker open)', {
      formType, idempotencyKey, duration: `${duration}ms`,
    });

    return { success: false, queued: true, error: 'Service temporarily unavailable. Will retry automatically.' };
  }

  try {
    const result = await submitViaRestApi(formId, data);
    const duration = Date.now() - startTime;

    if (result.success) {
      circuitBreaker.onSuccess();
      metrics.increment('submissionsSucceeded', formType);

      logger.info('JotForm submission succeeded', {
        formType,
        submissionId: result.submissionId,
        idempotencyKey,
        jotformSubmissionId: result.submissionId,
        duration: `${duration}ms`,
        status: 'completed',
        retryCount: 0,
      });

      return {
        success: true,
        submissionId: result.submissionId,
        message: result.message,
      };
    }

    circuitBreaker.onFailure();
    metrics.increment('submissionsFailed', formType);

    const isRetryable = shouldRetry(result);
    logger.error('JotForm submission failed', {
      formType,
      idempotencyKey,
      status: result.status,
      error: result.error,
      duration: `${duration}ms`,
      retryable: isRetryable,
    });

    if (isRetryable) {
      await enqueueForRetry(formType, data, idempotencyKey, options);
      metrics.increment('submissionsRetried', formType);

      logger.info('JotForm submission queued for retry', {
        formType, idempotencyKey, status: result.status,
      });

      return { success: false, queued: true, error: result.error, status: result.status };
    }

    return { success: false, error: result.error, status: result.status };
  } catch (err) {
    const duration = Date.now() - startTime;
    circuitBreaker.onFailure();
    metrics.increment('submissionsFailed', formType);

    logger.error('JotForm submission exception', {
      formType,
      idempotencyKey,
      error: err,
      duration: `${duration}ms`,
    });

    await enqueueForRetry(formType, data, idempotencyKey, options);
    metrics.increment('submissionsRetried', formType);

    return { success: false, queued: true, error: err.message, status: 0 };
  }
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const { rows } = await pool.query(
      `SELECT id, form_type, idempotency_key, payload, retry_count, max_retries, client_ip, user_agent, db_record_id
       FROM jotform_sync_queue
       WHERE (status = 'pending' OR (status = 'retrying' AND next_retry_at <= NOW()))
       ORDER BY created_at ASC
       LIMIT 20
       FOR UPDATE SKIP LOCKED`
    );

    for (const row of rows) {
      try {
        await updateQueueEntry(row.id, { status: 'processing' });

        const formId = getFormId(row.form_type);
        if (!formId) {
          await updateQueueEntry(row.id, { status: 'dead_letter', last_error: 'Form ID not configured' });
          metrics.increment('submissionsDeadLettered');
          logger.error('Queue entry dead-lettered: no form ID', { queueId: row.id, formType: row.form_type });
          continue;
        }

        const data = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const result = await submitViaRestApi(formId, data);

        if (result.success) {
          await updateQueueEntry(row.id, {
            status: 'completed',
            jotform_submission_id: result.submissionId,
            last_error: null,
          });
          metrics.increment('submissionsSucceeded', row.form_type);
          circuitBreaker.onSuccess();
          logger.info('Queue entry processed successfully', {
            queueId: row.id, formType: row.form_type, submissionId: result.submissionId,
          });
        } else {
          const isRetryable = shouldRetry(result);
          const newRetryCount = row.retry_count + 1;

          if (isRetryable && newRetryCount < DEAD_LETTER_AFTER_RETRIES) {
            const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, newRetryCount - 1), 3600000);
            await updateQueueEntry(row.id, {
              status: 'retrying',
              retry_count: newRetryCount,
              last_error: result.error,
              next_retry_at: new Date(Date.now() + delay),
            });
            metrics.increment('submissionsRetried', row.form_type);
            circuitBreaker.onFailure();
            logger.warn('Queue entry queued for retry', {
              queueId: row.id, formType: row.form_type, retryCount: newRetryCount, delay: `${delay}ms`, error: result.error,
            });
          } else {
            await updateQueueEntry(row.id, {
              status: 'dead_letter',
              retry_count: newRetryCount,
              last_error: result.error || 'Max retries exceeded',
            });
            metrics.increment('submissionsDeadLettered');
            circuitBreaker.onFailure();
            logger.error('Queue entry dead-lettered', {
              queueId: row.id, formType: row.form_type, retryCount: newRetryCount, error: result.error,
            });
          }
        }
      } catch (err) {
        logger.error('Queue entry processing error', { queueId: row.id, error: err });
        await updateQueueEntry(row.id, { status: 'retrying', last_error: err.message, next_retry_at: new Date(Date.now() + 60000) });
      }
    }
  } catch (err) {
    if (err.code !== '42P01') {
      logger.error('Queue processor error', { error: err });
    }
  } finally {
    isProcessing = false;
  }
}

function startBackgroundProcessor() {
  if (processorTimer) return;
  logger.info('Starting JotForm sync queue background processor');
  processorTimer = setInterval(processQueue, QUEUE_POLL_INTERVAL_MS);
  processQueue();
}

function stopBackgroundProcessor() {
  if (processorTimer) {
    clearInterval(processorTimer);
    processorTimer = null;
  }
}

async function getQueueStats() {
  try {
    const { rows: statusCounts } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM jotform_sync_queue GROUP BY status`
    );
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0, retrying: 0, dead_letter: 0 };
    for (const row of statusCounts) {
      stats[row.status] = row.count;
    }
    return stats;
  } catch (err) {
    return { pending: 0, processing: 0, completed: 0, failed: 0, retrying: 0, dead_letter: 0 };
  }
}

async function getHealth() {
  const cb = circuitBreaker.getStatus();
  const queueStats = await getQueueStats();
  const metricsSnapshot = metrics.getSnapshot(queueStats.pending + queueStats.retrying, queueStats.pending);

  return {
    status: cb.state === 'OPEN' ? 'degraded' : 'ok',
    circuitBreaker: cb,
    queue: queueStats,
    metrics: metricsSnapshot,
    config: {
      requestTimeout: REQUEST_TIMEOUT,
      maxRetries: MAX_RETRIES,
      baseRetryDelayMs: BASE_RETRY_DELAY_MS,
      queuePollIntervalMs: QUEUE_POLL_INTERVAL_MS,
      deadLetterAfterRetries: DEAD_LETTER_AFTER_RETRIES,
    },
  };
}

module.exports = {
  submitToJotForm,
  startBackgroundProcessor,
  stopBackgroundProcessor,
  processQueue,
  getQueueStats,
  getHealth,
};
