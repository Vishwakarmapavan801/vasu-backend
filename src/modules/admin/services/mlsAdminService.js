/**
 * Admin MLS Service
 *
 * A read-only control surface for the live MLS Grid integration:
 *  - Sync status + history from mls_sync_status / mls_sync_errors
 *  - Enqueue a manual full/incremental sync on the existing mls-sync BullMQ queue
 *  - Data-quality queries straight from MLS Grid ($count only, cached)
 *
 * Admin MLS controls NEVER modify MLS Grid source data — they only trigger
 * the same sync pipeline the public integration already runs.
 */

const pool = require('../../../config/database');
const { addJob } = require('../../../services/queue/queueService');
const mlsService = require('../../../services/mlsService');
const { fetchWithRetry } = require('../../../services/mlsService');
const { buildQuery } = require('../../../services/odataBuilder');
const { MLS_GRID_BASE_URL } = require('../../../config');
const cache = require('../../../utils/cache');

const STATUS_TTL_MS = 60_000;

async function getStatus() {
  const key = 'admin:mls-status';
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // mls_sync_status / mls_sync_errors exist only on v11+ migration lineage.
  // Degrade gracefully when absent (older local DBs).
  let current = null;
  let history = [];
  let errors = [];
  let unresolvedErrors = 0;
  let tablesAvailable = true;
  try {
    const status = await pool.query(
      `SELECT id, status, sync_count, last_sync_at, last_full_sync_at, created_at
       FROM mls_sync_status ORDER BY id DESC LIMIT 1`
    );
    current = status.rows[0] || null;

    const historyRows = await pool.query(
      `SELECT id, status, sync_count, last_sync_at, last_full_sync_at, created_at
       FROM mls_sync_status ORDER BY id DESC LIMIT 20`
    );
    history = historyRows.rows;

    const errorRows = await pool.query(
      `SELECT id, listing_key, error_message, stage, retry_count, resolved_at, occurred_at AS created_at
       FROM mls_sync_errors ORDER BY occurred_at DESC LIMIT 100`
    );
    errors = errorRows.rows;

    const unresolved = await pool.query(
      `SELECT COUNT(*)::text AS count FROM mls_sync_errors WHERE resolved_at IS NULL`
    );
    unresolvedErrors = parseInt(unresolved.rows[0].count, 10) || 0;
  } catch (_) {
    tablesAvailable = false;
  }

  const result = {
    success: true,
    current,
    history,
    errors,
    unresolvedErrors,
    tablesAvailable,
    queue: { name: 'mls-sync' },
  };
  cache.set(key, result, STATUS_TTL_MS);
  return result;
}

async function triggerSync(type, adminId) {
  const syncType = type === 'full' ? 'full-sync' : 'incremental-sync';
  const job = await addJob('mls-sync', syncType, { triggeredBy: adminId, source: 'admin' });
  return { enqueued: !!job, job: syncType };
}

async function getQuality() {
  const key = 'admin:mls-quality';
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let total = null;
  try {
    const queryString = buildQuery(
      { standardStatus: 'Active', mlgCanView: true },
      { top: 1, count: true }
    );
    const url = `${MLS_GRID_BASE_URL}/Property?${queryString}`;
    const data = await fetchWithRetry(url);
    total = data['@odata.count'] || 0;
  } catch (_) {
    total = null;
  }

  // A live sample of recently modified active listings for admin spot-checks.
  // Media is expanded by buildQuery so each row carries its photo keys.
  let sample = [];
  try {
    const sampleUrl = `${MLS_GRID_BASE_URL}/Property?${buildQuery(
      { standardStatus: 'Active', mlgCanView: true },
      { top: 10, orderby: 'ModificationTimestamp desc' }
    )}`;
    const sampleData = await fetchWithRetry(sampleUrl);
    sample = (sampleData.value || []).map((raw) => {
      const p = mlsService.normalizeProperty(raw);
      return {
        listingKey: p.ListingKey,
        listingId: p.ListingId,
        address: p.UnparsedAddress,
        city: p.City,
        listPrice: p.ListPrice,
        propertyType: p.PropertyType,
        modificationTimestamp: p.ModificationTimestamp,
        photoCount: (p.Media || []).length,
      };
    });
  } catch (_) {
    sample = [];
  }

  const result = {
    success: true,
    total,
    sample,
    note: 'Data-quality counts are computed live from MLS Grid; only sync status (DB) is stored locally.',
    generatedAt: new Date().toISOString(),
  };
  cache.set(key, result, 5 * 60_000);
  return result;
}

/**
 * Delete a pending sync error record (retry bookkeeping only — never touches
 * MLS Grid). Optionally re-enqueues an incremental sync for that listing.
 */
async function clearError(errorId, { retryListing } = {}) {
  const { rows } = await pool.query('SELECT id, listing_key FROM mls_sync_errors WHERE id = $1', [errorId]);
  if (!rows[0]) {
    throw Object.assign(new Error('Sync error not found'), { statusCode: 404 });
  }
  await pool.query('DELETE FROM mls_sync_errors WHERE id = $1', [errorId]);
  if (retryListing && rows[0].listing_key) {
    await addJob('mls-sync', 'retry-errors', { listingKey: rows[0].listing_key, source: 'admin' });
  }
  return { cleared: true, listingKey: rows[0].listing_key || null };
}

module.exports = { getStatus, triggerSync, getQuality, clearError };
