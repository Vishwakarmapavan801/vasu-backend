const pool = require('../../config/database');
const logger = require('../monitoring/logger');
const { captureException } = require('../monitoring/sentry');

const SYNC_LOCK_TTL_SECONDS = 300;
const FULL_SYNC_INTERVAL_HOURS = 4;

async function acquireSyncLock() {
  const { rows } = await pool.query(
    `SELECT pg_try_advisory_lock($1) AS acquired`,
    [hashString('mls_sync_lock')]
  );
  return rows[0].acquired;
}

async function releaseSyncLock() {
  await pool.query(
    `SELECT pg_advisory_unlock($1)`,
    [hashString('mls_sync_lock')]
  );
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

async function getLastSync() {
  const { rows } = await pool.query(
    `SELECT last_sync_at, last_full_sync_at, status, sync_count
     FROM mls_sync_status
     ORDER BY id DESC LIMIT 1`
  );
  return rows[0] || null;
}

async function updateSyncStatus(status, syncCount = 0) {
  await pool.query(
    `INSERT INTO mls_sync_status (status, sync_count, last_sync_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET status = $1, sync_count = mls_sync_status.sync_count + $2, last_sync_at = NOW()`,
    [status, syncCount]
  );
}

async function shouldRunFullSync() {
  const lastSync = await getLastSync();
  if (!lastSync) return true;
  const hoursSinceFullSync = (Date.now() - new Date(lastSync.last_full_sync_at).getTime()) / (1000 * 3600);
  return hoursSinceFullSync >= FULL_SYNC_INTERVAL_HOURS;
}

async function logSyncError(listingKey, errorMessage, stage) {
  try {
    await pool.query(
      `INSERT INTO mls_sync_errors (listing_key, error_message, stage, occurred_at)
       VALUES ($1, $2, $3, NOW())`,
      [listingKey, errorMessage, stage]
    );
  } catch (err) {
    logger.error('Failed to log sync error', { error: err.message });
  }
}

async function getSyncErrors(limit = 50, unprocessed = false) {
  let query = `SELECT * FROM mls_sync_errors ORDER BY occurred_at DESC LIMIT $1`;
  if (unprocessed) {
    query = `SELECT * FROM mls_sync_errors WHERE retry_count < 3 AND resolved_at IS NULL ORDER BY occurred_at DESC LIMIT $1`;
  }
  const { rows } = await pool.query(query, [limit]);
  return rows;
}

async function retrySyncErrors(maxRetries = 3) {
  const errors = await getSyncErrors(100, true);
  let retried = 0;

  for (const err of errors) {
    if (err.retry_count >= maxRetries) continue;
    try {
      await pool.query(
        `UPDATE mls_sync_errors SET retry_count = retry_count + 1, last_retry_at = NOW() WHERE id = $1`,
        [err.id]
      );
      retried++;
    } catch (updateErr) {
      logger.error('Failed to retry sync error', { errorId: err.id, error: updateErr.message });
    }
  }

  return retried;
}

async function resolveSyncError(errorId) {
  await pool.query(
    `UPDATE mls_sync_errors SET resolved_at = NOW() WHERE id = $1`,
    [errorId]
  );
}

async function processWebhook(payload) {
  const { event, listing_key, data } = payload;

  logger.info(`Processing MLS webhook event`, { event, listing_key });

  switch (event) {
    case 'listing.created':
      await upsertListingFromWebhook(listing_key, data);
      break;
    case 'listing.updated':
      await upsertListingFromWebhook(listing_key, data);
      break;
    case 'listing.deleted':
      await softDeleteListing(listing_key);
      break;
    case 'listing.price_changed':
      await handlePriceChange(listing_key, data);
      break;
    case 'listing.status_changed':
      await handleStatusChange(listing_key, data);
      break;
    default:
      logger.warn(`Unknown webhook event type: ${event}`);
  }
}

async function upsertListingFromWebhook(listingKey, data) {
  if (!data || !listingKey) {
    await logSyncError(listingKey || 'unknown', 'No data provided', 'webhook');
    return;
  }
  try {
    await pool.query(
      `INSERT INTO properties (listing_key, data, mls_updated_at, sources)
       VALUES ($1, $2, NOW(), ARRAY['mls_webhook'])
       ON CONFLICT (listing_key) DO UPDATE SET
         data = EXCLUDED.data,
         mls_updated_at = NOW(),
         sources = CASE WHEN NOT ARRAY['mls_webhook'] = ANY(properties.sources)
           THEN properties.sources || ARRAY['mls_webhook']
           ELSE properties.sources
         END`,
      [listingKey, JSON.stringify(data)]
    );
  } catch (err) {
    await logSyncError(listingKey, err.message, 'upsert');
    captureException(err, { extra: { listingKey } });
  }
}

async function softDeleteListing(listingKey) {
  await pool.query(
    `UPDATE properties SET status = 'deleted', mls_updated_at = NOW()
     WHERE listing_key = $1`,
    [listingKey]
  );
}

async function handlePriceChange(listingKey, data) {
  const oldPrice = data.previous_price;
  const newPrice = data.current_price;

  await pool.query(
    `INSERT INTO alert_history (alert_type, listing_key, data, created_at)
     VALUES ('price_drop', $1, $2, NOW())`,
    [listingKey, JSON.stringify({ old_price: oldPrice, new_price: newPrice })]
  );
}

async function handleStatusChange(listingKey, data) {
  await pool.query(
    `UPDATE properties SET status = $1, mls_updated_at = NOW()
     WHERE listing_key = $2`,
    [data.new_status || data.status, listingKey]
  );
}

module.exports = {
  acquireSyncLock, releaseSyncLock, getLastSync, updateSyncStatus,
  shouldRunFullSync, logSyncError, getSyncErrors, retrySyncErrors,
  resolveSyncError, processWebhook, upsertListingFromWebhook,
};
