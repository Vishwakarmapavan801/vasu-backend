/**
 * Overpass (OpenStreetMap) query service.
 *
 * Serves the frontend Nearby Places section with real OpenStreetMap POI data.
 *
 * The previous implementation raced ALL mirrors in parallel and treated every
 * upstream failure as a blanket 502. Parallel racing multiplied each query by
 * 4x and instantly blew through the public mirrors' per-IP rate limits
 * (HTTP 429), and the frontend's direct-mirror fallback then hammered the
 * mirrors a second time. That is why Nearby Places regressed into repeated
 * 429/502 errors. This service now treats the public mirrors as a shared,
 * rate-limited resource and NEVER surfaces a 502 for an upstream failure:
 *
 *   1. Mirrors are tried SEQUENTIALLY with least-recently-used rotation —
 *      never in parallel — so each query costs at most ONE upstream call when
 *      everything is healthy.
 *   2. A global concurrency limit + a minimum gap between upstream calls keeps
 *      us well under the ~2 requests/s the mirrors enforce, while request
 *      coalescing (inflight) stops identical concurrent queries from running
 *      duplicate upstream work.
 *   3. HTTP 429 responses are detected, `Retry-After` is honoured (or
 *      exponential backoff applied), and the offending mirror is put into a
 *      short cooldown instead of being retried instantly.
 *   4. Network-level failures (host unreachable / timeouts) also put the
 *      mirror into a cooldown, and we bail out early after two consecutive
 *      network errors — so a fully-down Overpass network costs a couple of
 *      attempts, not minutes, and never hangs the property page.
 *   5. Successful results are cached in memory (12h TTL, bounded) AND in
 *      PostgreSQL (7 days) keyed by the query string — which embeds
 *      latitude/longitude + radius. The DB layer makes repeat property visits
 *      instant across restarts and serves the most recent cached result when
 *      the mirrors are down. Results served from cache during an outage are
 *      flagged `stale: true` so the UI can show "showing the most recent
 *      available results" instead of implying the data is live. "Unavailable"
 *      outcomes are negative-cached briefly (60s) so a down upstream is not
 *      re-queried every repeat.
 *   6. Every failure path throws a typed error (RATE_LIMITED / UNAVAILABLE /
 *      ALL_MIRRORS_FAILED) that the controller maps to a graceful empty
 *      response — never a 502.
 *
 * All data comes from OpenStreetMap. No hardcoded places.
 */

const crypto = require('crypto');
const axios = require('axios');
const pool = require('../../../config/database');

// Public Overpass mirrors, ordered so the healthiest is tried first.
// VERIFIED 2026-08-11: maps.mail.ru answered real POI data for US properties
// in ~2.6s (15s cold), while kumi.systems / private.coffee / overpass-api.de
// were rate-limiting this server (429 / 406 "too busy") and osm.jp was
// unreachable. Mirrors are rotated sequentially with per-mirror cooldowns, so
// a temporarily limited mirror is skipped (not hammered) and healthy mirrors
// carry the load. The list stays global-instances only — regional instances
// (e.g. overpass.osm.ch) would silently return empty for US properties.
const OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

// Must exceed the largest [timeout:N] declared inside the queries (25s) and
// leave room for queue wait on busy mirrors. The frontend proxy aborts at 60s
// (OVERPASS_PROXY_TIMEOUT), so keep this comfortably under that.
const OVERPASS_TIMEOUT_MS = 40000;
const OVERPASS_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h (in-memory)
const OVERPASS_DB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (PostgreSQL)
const UNAVAILABLE_CACHE_TTL_MS = 60 * 1000; // 60s negative cache when upstream is down
const OVERPASS_CACHE_MAX = 300;
const MAX_QUERY_LENGTH = 20000;

// Rate-limit / outage hygiene for the shared public mirrors.
const MAX_CONCURRENT = 1; // one upstream call at a time server-wide
const MIN_GAP_MS = 600; // at least 600ms between consecutive upstream calls
const BACKOFF_BASE_MS = 2000; // 2s, doubled per consecutive failure
const RETRY_AFTER_CEIL_MS = 60000; // never wait longer than 60s per mirror
const NETWORK_ERROR_COOLDOWN_MS = 30000; // a down mirror is not re-tried for 30s
const ALL_MIRRORS_COOL_WAIT_MS = 3000; // how long to wait before giving up when every mirror is cooling
// Hard cap for one query's upstream attempts. Equal to the per-mirror timeout
// so a query makes at most ONE full mirror attempt: a healthy mirror answers
// in 2-17s and we return data; a hanging mirror costs one timeout (40s) and we
// fail fast with a graceful empty instead of piling two 40s hangs on top of
// each other. The frontend proxy aborts at 60s, so 40s is safely under that.
const QUERY_BUDGET_MS = 40000;
const MAX_NETWORK_BEFORE_BAIL = 2; // stop after two consecutive network-level failures

const NETWORK_ERROR_CODES = /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ERR_NETWORK|ERR_SOCKET|ECONNRESET|ECONNABORTED|PING)/;

const cache = new Map(); // query hash -> { inserted, ttl, value }
const inflight = new Map(); // query hash -> Promise (dedupe concurrent identical queries)

// Rate-limit / outage state.
const mirrorCooldown = new Map(); // endpoint -> retryAt (epoch ms)
let mirrorRotation = 0;
let outageUntil = 0; // global "all mirrors are down/limited" circuit: block new queries until this epoch

// Concurrency limiter.
const pending = [];
let activeCount = 0;
let lastUpstreamAt = 0;

function isNetworkError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code);
  return typeof code === 'string' && NETWORK_ERROR_CODES.test(code);
}

function hashQuery(query) {
  return crypto.createHash('sha1').update(query).digest('hex');
}

function getCached(hash) {
  const entry = cache.get(hash);
  if (!entry) return undefined;
  if (Date.now() - entry.inserted > entry.ttl) {
    cache.delete(hash);
    return undefined;
  }
  return entry.value;
}

function setCached(hash, value, ttl = OVERPASS_CACHE_TTL_MS) {
  if (cache.size >= OVERPASS_CACHE_MAX) {
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [key, entry] of cache) {
      if (entry.inserted < oldestTs) {
        oldestTs = entry.inserted;
        oldestKey = key;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(hash, { inserted: Date.now(), ttl, value });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Persistent (PostgreSQL) cache layer for real Overpass results.
 * Lives behind the in-memory cache: repeat property visits hit the DB
 * instantly across server restarts, and when the mirrors are down the
 * most recent cached result is served instead of an empty section.
 * DB failures are never fatal — they degrade back to memory/upstream.
 */
async function getDbCached(hash, allowStale = false) {
  try {
    const { rows } = await pool.query(
      `SELECT elements, unavailable, fetched_at, accessed_at
       FROM overpass_cache WHERE query_hash = $1`,
      [hash]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const ageMs = Date.now() - new Date(row.fetched_at).getTime();
    if (!allowStale && ageMs > OVERPASS_DB_CACHE_TTL_MS) return null;
    try {
      await pool.query(
        `UPDATE overpass_cache SET accessed_at = NOW() WHERE query_hash = $1`,
        [hash]
      );
    } catch (_) {}
    return { elements: Array.isArray(row.elements) ? row.elements : [], unavailable: Boolean(row.unavailable) };
  } catch (err) {
    console.warn(`[overpass] db cache read failed (${err.message}) — continuing`);
    return null;
  }
}

async function setDbCached(hash, query, value) {
  try {
    await pool.query(
      `INSERT INTO overpass_cache (query_hash, query, elements, unavailable, fetched_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (query_hash) DO UPDATE SET
         elements = EXCLUDED.elements,
         unavailable = EXCLUDED.unavailable,
         fetched_at = NOW()`,
      [hash, query, JSON.stringify(value.elements || []), Boolean(value.unavailable)]
    );
  } catch (err) {
    console.warn(`[overpass] db cache write failed (${err.message}) — continuing`);
  }
}

/** Serialize upstream calls: at most MAX_CONCURRENT in flight at once. */
function runWithConcurrency(fn) {
  return new Promise((resolve, reject) => {
    pending.push(() => fn().then(resolve, reject));
    pump();
  });
}

function pump() {
  while (activeCount < MAX_CONCURRENT && pending.length > 0) {
    const task = pending.shift();
    activeCount += 1;
    task()
      .catch(() => {})
      .finally(() => {
        activeCount -= 1;
        pump();
      });
  }
}

function isCoolingDown(endpoint) {
  const until = mirrorCooldown.get(endpoint);
  if (!until) return false;
  if (Date.now() >= until) {
    mirrorCooldown.delete(endpoint);
    return false;
  }
  return true;
}

function earliestCooldown() {
  let earliest = Infinity;
  for (const until of mirrorCooldown.values()) {
    if (until < earliest) earliest = until;
  }
  return earliest === Infinity ? 0 : earliest;
}

/** First non-cooling mirror, rotating the start point each call. */
function chooseMirror() {
  for (let step = 0; step < OVERPASS_ENDPOINTS.length; step += 1) {
    const endpoint = OVERPASS_ENDPOINTS[(mirrorRotation + step) % OVERPASS_ENDPOINTS.length];
    if (!isCoolingDown(endpoint)) return endpoint;
  }
  return null;
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = parseInt(value, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1000;
  const asDate = Date.parse(value); // HTTP-date form
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return 0;
}

/** If every mirror is cooling down, wait briefly for the earliest to recover. */
async function waitForMirror() {
  if (chooseMirror()) return;
  const next = earliestCooldown() - Date.now();
  if (next <= 0) return;
  await delay(Math.min(next, ALL_MIRRORS_COOL_WAIT_MS));
}

async function querySingleMirror(endpoint, query) {
  const wait = Math.max(0, lastUpstreamAt + MIN_GAP_MS - Date.now());
  if (wait > 0) await delay(wait);
  lastUpstreamAt = Date.now();
  return axios.post(endpoint, `data=${encodeURIComponent(query)}`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Some instances (kumi.systems, private.coffee) reply 429 to requests
      // without a descriptive User-Agent; identify ourselves politely.
      'User-Agent': 'VasuRealty/1.0 (real-estate property page; contact: dev@vasurealty.com)',
    },
    timeout: OVERPASS_TIMEOUT_MS,
    // Inspect 4xx ourselves (429/406/503 need cooldown handling); 5xx rejects.
    validateStatus: (status) => status < 500,
  });
}

/**
 * Try the mirrors sequentially until one returns a valid response. Throws a
 * typed error: 'RATE_LIMITED' (all mirrors 429), 'UNAVAILABLE' (all cooling or
 * network-level failures), or 'ALL_MIRRORS_FAILED' for other upstream errors.
 * Never throws for a transient state that could be cached as a graceful empty.
 */
async function fetchFromMirrors(query) {
  await waitForMirror();
  if (!chooseMirror()) {
    const retryAfter = Math.max(1, Math.ceil((earliestCooldown() - Date.now()) / 1000));
    throw Object.assign(new Error('All Overpass mirrors are cooling down'), {
      code: 'UNAVAILABLE',
      retryAfter,
    });
  }

  const startedAt = Date.now();
  let attempts = 0;
  let networkErrors = 0;
  let lastError = null;
  let worstRetryAfterMs = 0;
  let sawRateLimit = false;

  while (attempts < OVERPASS_ENDPOINTS.length && Date.now() - startedAt < QUERY_BUDGET_MS) {
    const endpoint = chooseMirror();
    if (!endpoint) break; // every remaining mirror is cooling down
    attempts += 1;
    mirrorRotation += 1;

    try {
      const res = await runWithConcurrency(() => querySingleMirror(endpoint, query));

      if (res.status === 200) {
        if (!res.data || !Array.isArray(res.data.elements)) {
          throw Object.assign(new Error(`Invalid Overpass response from ${endpoint}`), {
            code: 'INVALID',
          });
        }
        // Pin rotation to the mirror that just answered so the next query tries
        // the last-known-good mirror first — otherwise a query that starts on a
        // hanging mirror would burn its whole 40s budget and never reach a
        // healthy one (with QUERY_BUDGET_MS == OVERPASS_TIMEOUT_MS only one
        // full attempt fits per query).
        mirrorRotation = OVERPASS_ENDPOINTS.indexOf(endpoint);
        return { elements: res.data.elements };
      }

      // 429 = rate limited (honour Retry-After). 406/503 = "server too busy"
      // (overpass-api.de returns 406 with an HTML error page when overloaded;
      // other instances use 503). All three put the mirror into a cooldown so
      // we try the next healthy mirror instead of re-hammering the busy one.
      if (res.status === 429 || res.status === 406 || res.status === 503) {
        sawRateLimit = true;
        const retryAfterMs = parseRetryAfter(res.headers && res.headers['retry-after']);
        const cooldown = Math.min(Math.max(retryAfterMs, BACKOFF_BASE_MS), RETRY_AFTER_CEIL_MS);
        mirrorCooldown.set(endpoint, Date.now() + cooldown);
        worstRetryAfterMs = Math.max(worstRetryAfterMs, retryAfterMs || BACKOFF_BASE_MS);
        console.warn(
          `[overpass] mirror ${endpoint} busy (HTTP ${res.status}); cooling down for ${Math.round(cooldown / 1000)}s`
        );
        lastError = Object.assign(new Error(`Overpass mirror ${endpoint} busy (HTTP ${res.status})`), {
          code: 'RATE_LIMITED',
        });
        continue;
      }

      lastError = Object.assign(
        new Error(`Overpass mirror ${endpoint} returned HTTP ${res.status}`),
        { code: 'UPSTREAM' }
      );
      continue;
    } catch (err) {
      lastError = err;
      if (isNetworkError(err)) {
        networkErrors += 1;
        const cooldown = Math.min(
          Math.max(BACKOFF_BASE_MS, NETWORK_ERROR_COOLDOWN_MS),
          RETRY_AFTER_CEIL_MS
        );
        mirrorCooldown.set(endpoint, Date.now() + cooldown);
        console.warn(
          `[overpass] mirror ${endpoint} unreachable (${err.code || err.message}); cooling down for ${Math.round(cooldown / 1000)}s`
        );
        // A network-level failure usually means ALL mirrors are unreachable —
        // bail out early instead of burning through every mirror.
        if (networkErrors >= MAX_NETWORK_BEFORE_BAIL) break;
        continue;
      }
      // Non-network throw (e.g. invalid response shape) — try the next mirror.
      continue;
    }
  }

  if (sawRateLimit) {
    const retryAfter = Math.max(1, Math.ceil(worstRetryAfterMs / 1000));
    throw Object.assign(new Error('Overpass mirrors rate limited'), {
      code: 'RATE_LIMITED',
      retryAfter,
    });
  }
  if (networkErrors > 0) {
    const retryAfter = Math.max(1, Math.ceil((earliestCooldown() - Date.now()) / 1000));
    throw Object.assign(new Error('Overpass mirrors unreachable'), {
      code: 'UNAVAILABLE',
      retryAfter,
    });
  }
  throw Object.assign(
    new Error((lastError && lastError.message) || 'All Overpass mirrors failed'),
    { code: 'ALL_MIRRORS_FAILED' }
  );
}

/**
 * Query Overpass, returning `{ elements }` on success. Cache tiers:
 *   L1 — in-memory (12h success / 60s negative)
 *   L2 — PostgreSQL (7 days) so repeat property visits are instant across
 *        restarts, and the most recent cached result is served instead of an
 *        empty section when the mirrors are down/rate-limited.
 * Failure outcomes are negative-cached briefly (so a down upstream isn't
 * hammered by repeat queries for the same location) but the typed error still
 * propagates to the caller when nothing cached exists.
 */
async function queryOverpass(query) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { elements: [] };
  }
  if (query.length > MAX_QUERY_LENGTH) return { elements: [] };

  const hash = hashQuery(query);

  // L1: in-memory cache.
  const mem = getCached(hash);
  if (mem) return mem;

  // L2: persistent cache — repeat property visits never touch the mirrors.
  const dbCached = await getDbCached(hash, false);
  if (dbCached) {
    setCached(hash, dbCached);
    return dbCached;
  }

  if (inflight.has(hash)) return inflight.get(hash);

  // Global outage circuit: if a recent query found every mirror down/limited,
  // answer new queries (any body) instantly instead of re-burning 3-28s on
  // unreachable/rate-limited upstream mirrors. Also short-circuit while ANOTHER
  // query is already probing and mirrors are demonstrably failing — that stops
  // a burst of distinct bodies from each starting their own slow probe before
  // the circuit can arm. Either way, serve the most recent cached result when
  // one exists (stale is fine when the mirrors are unreachable).
  const probeInFlight = activeCount > 0 || pending.length > 0;
  if (Date.now() < outageUntil || (probeInFlight && mirrorCooldown.size > 0)) {
    const stale = await getDbCached(hash, true);
    if (stale) {
      // Marked so the UI can say "showing the most recent available results".
      const marked = { ...stale, stale: true };
      setCached(hash, marked);
      return marked;
    }
    const until = outageUntil > Date.now() ? outageUntil : Date.now() + UNAVAILABLE_CACHE_TTL_MS;
    return {
      elements: [],
      unavailable: true,
      retryAfter: Math.max(1, Math.ceil((until - Date.now()) / 1000)),
    };
  }

  const promise = (async () => {
    try {
      const result = await fetchFromMirrors(query);
      outageUntil = 0;
      setCached(hash, result);
      setDbCached(hash, query, result);
      return result;
    } catch (err) {
      if (err && (err.code === 'RATE_LIMITED' || err.code === 'UNAVAILABLE' || err.code === 'ALL_MIRRORS_FAILED')) {
        outageUntil = Date.now() + UNAVAILABLE_CACHE_TTL_MS;
      }
      // Fallback: serve the most recent cached data instead of an empty section.
      const stale = await getDbCached(hash, true);
      if (stale) {
        // Marked so the UI can say "showing the most recent available results".
        const marked = { ...stale, stale: true };
        setCached(hash, marked);
        return marked;
      }
      if (err && (err.code === 'RATE_LIMITED' || err.code === 'UNAVAILABLE')) {
        setCached(
          hash,
          { elements: [], unavailable: true, retryAfter: err.retryAfter },
          UNAVAILABLE_CACHE_TTL_MS
        );
      }
      throw err;
    } finally {
      inflight.delete(hash);
    }
  })();

  inflight.set(hash, promise);
  return promise;
}

module.exports = { queryOverpass };
