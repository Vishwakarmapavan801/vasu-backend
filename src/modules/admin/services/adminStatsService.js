/**
 * Admin Dashboard Statistics
 *
 * Every number is real data:
 *  - Listing counts come from live MLS Grid ($count queries, short-TTL cached)
 *  - Platform counts come from PostgreSQL
 *  - Sync status comes from mls_sync_status / mls_sync_errors
 *
 * No hardcoded or mock values are ever returned.
 */

const pool = require('../../../config/database');
const { fetchWithRetry } = require('../../../services/mlsService');
const { buildQuery } = require('../../../services/odataBuilder');
const { MLS_GRID_BASE_URL } = require('../../../config');
const cache = require('../../../utils/cache');

const MLS_COUNT_TTL_MS = 60_000;

/**
 * Live MLS Grid listing count for a given filter set.
 * Uses $count=true + top=1 so we never download the full result set.
 */
async function getMlsCount(filters) {
  const key = `admin:mls-count:${JSON.stringify(filters)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const queryString = buildQuery(filters, { top: 1, count: true });
  const url = `${MLS_GRID_BASE_URL}/Property?${queryString}`;
  const data = await fetchWithRetry(url);

  const count = data['@odata.count'] || data.value?.length || 0;
  cache.set(key, count, MLS_COUNT_TTL_MS);
  return count;
}

async function countRows(query, params = []) {
  const { rows } = await pool.query(query, params);
  return parseInt(rows[0].count, 10) || 0;
}

async function getMlsCounts() {
  const pairs = [
    ['total', { standardStatus: 'Active', mlgCanView: true }],
    ['active', { standardStatus: 'Active', mlgCanView: true }],
    ['pending', { standardStatus: 'Pending', mlgCanView: true }],
    ['sold', { standardStatus: 'Closed', mlgCanView: true }],
    ['comingSoon', { standardStatus: 'ComingSoon', mlgCanView: true }],
    ['rentals', { standardStatus: 'Active', propertyType: 'Residential Lease', mlgCanView: true }],
    ['commercial', { standardStatus: 'Active', propertyType: ['Commercial Lease', 'Commercial Sale'], mlgCanView: true }],
    ['land', { standardStatus: 'Active', propertyType: 'Land', mlgCanView: true }],
    ['residential', { standardStatus: 'Active', propertyType: 'Residential', mlgCanView: true }],
    ['multiFamily', { standardStatus: 'Active', propertyType: 'Residential Income', mlgCanView: true }],
    ['openHouses', { standardStatus: 'Active' }],
  ];

  const results = {};
  for (const [name, filters] of pairs) {
    try {
      results[name] = await getMlsCount(filters);
    } catch (_) {
      results[name] = null;
    }
  }

  return { available: Object.values(results).some((v) => v !== null), ...results };
}

async function getPlatformCounts() {
  const [
    agents,
    verifiedAgents,
    pendingAgents,
    users,
    newUsersWeek,
    activeSessions,
    posts,
    socialPosts,
    leads,
    newLeadsWeek,
    inquiries,
    tours,
    offers,
    transactions,
    featuredListings,
    featuredAgents,
    reviews,
    avgRating,
  ] = await Promise.all([
    countRows('SELECT COUNT(*)::text AS count FROM agents'),
    countRows('SELECT COUNT(*)::text AS count FROM agents WHERE is_verified = TRUE'),
    countRows(`SELECT COUNT(*)::text AS count FROM agents WHERE status = 'pending'`),
    countRows('SELECT COUNT(*)::text AS count FROM users'),
    countRows(`SELECT COUNT(*)::text AS count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`),
    countRows('SELECT COUNT(*)::text AS count FROM user_sessions WHERE revoked_at IS NULL AND expires_at > NOW()'),
    countRows('SELECT COUNT(*)::text AS count FROM agent_posts'),
    countRows('SELECT COUNT(*)::text AS count FROM agent_posts WHERE post_type = \'reel\''),
    countRows('SELECT COUNT(*)::text AS count FROM agent_leads'),
    countRows(`SELECT COUNT(*)::text AS count FROM agent_leads WHERE created_at >= NOW() - INTERVAL '7 days'`),
    countRows('SELECT COUNT(*)::text AS count FROM property_inquiries'),
    countRows('SELECT COUNT(*)::text AS count FROM tour_schedules'),
    countRows('SELECT COUNT(*)::text AS count FROM offer_inquiries'),
    countRows('SELECT COUNT(*)::text AS count FROM transactions'),
    countRows('SELECT COUNT(*)::text AS count FROM featured_listings WHERE is_active = TRUE'),
    countRows('SELECT COUNT(*)::text AS count FROM featured_agents WHERE is_active = TRUE'),
    countRows('SELECT COUNT(*)::text AS count FROM agent_reviews'),
    (async () => {
      const { rows } = await pool.query('SELECT COALESCE(AVG(rating), 0)::float AS avg FROM agent_reviews');
      return rows[0]?.avg || 0;
    })(),
  ]);

  return {
    agents,
    verifiedAgents,
    pendingAgents,
    users,
    newUsersWeek,
    activeSessions,
    posts,
    socialPosts,
    leads,
    newLeadsWeek,
    inquiries,
    tours,
    offers,
    transactions,
    featuredListings,
    featuredAgents,
    reviews,
    avgRating,
  };
}

async function getSyncStatus() {
  // mls_sync_status / mls_sync_errors come from migration v11. Environments
  // on a different migration lineage (e.g. older local DBs) may not have them
  // yet — the dashboard degrades gracefully instead of crashing.
  try {
    const lastSync = await pool.query(
      `SELECT id, status, sync_count, last_sync_at, last_full_sync_at, created_at
       FROM mls_sync_status ORDER BY id DESC LIMIT 1`
    );
    const unresolvedErrors = await countRows(
      'SELECT COUNT(*)::text AS count FROM mls_sync_errors WHERE resolved_at IS NULL'
    );
    const totalErrors = await countRows('SELECT COUNT(*)::text AS count FROM mls_sync_errors');

    return {
      lastSync: lastSync.rows[0] || null,
      unresolvedErrors,
      totalErrors,
    };
  } catch (_) {
    return { lastSync: null, unresolvedErrors: 0, totalErrors: 0, unavailable: true };
  }
}

async function getDashboard() {
  const [mls, platform, sync] = await Promise.all([getMlsCounts(), getPlatformCounts(), getSyncStatus()]);

  return {
    success: true,
    listings: mls,
    platform,
    sync,
  };
}

module.exports = { getDashboard, getMlsCount, getMlsCounts, getSyncStatus };
