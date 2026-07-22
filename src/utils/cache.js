/**
 * Simple In-Memory Cache
 *
 * TTL-based cache for MLS Grid API responses.
 * Prevents redundant MLS Grid requests and stabilizes
 * signed MediaURLs so the browser can cache images.
 *
 * Features:
 * - TTL per entry (configurable, default 60s)
 * - Max entries to prevent memory leaks
 * - Automatic stale entry cleanup
 * - Hit/miss tracking for observability
 */

const DEFAULT_TTL_MS = 60_000;       // 60 seconds default
const DEFAULT_MAX_ENTRIES = 500;     // max cached responses
const CLEANUP_INTERVAL_MS = 120_000; // purge stale entries every 2 min

/** @type {Map<string, { data: any, expiresAt: number }>} */
const store = new Map();

/** Track cache stats */
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
};

// Periodic cleanup of expired entries
let cleanupTimer = null;
function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      stats.evictions += evicted;
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow Node.js to exit even if timer is active
  if (cleanupTimer && cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

startCleanup();

const cache = {
  /**
   * Get a cached value by key.
   * @param {string} key
   * @returns {*|undefined} Cached data or undefined if miss/expired
   */
  get(key) {
    const entry = store.get(key);
    if (!entry) {
      stats.misses++;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      stats.misses++;
      stats.evictions++;
      return undefined;
    }
    stats.hits++;
    return entry.data;
  },

  /**
   * Set a cached value with optional TTL.
   * @param {string} key
   * @param {*} data
   * @param {number} [ttlMs=DEFAULT_TTL_MS] - Time-to-live in milliseconds
   */
  set(key, data, ttlMs = DEFAULT_TTL_MS) {
    // Enforce max entries — evict oldest if at capacity
    if (store.size >= DEFAULT_MAX_ENTRIES) {
      const oldestKey = store.keys().next().value;
      if (oldestKey) {
        store.delete(oldestKey);
        stats.evictions++;
      }
    }
    store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    stats.sets++;
  },

  /**
   * Delete a specific cache entry.
   * @param {string} key
   */
  delete(key) {
    store.delete(key);
  },

  /**
   * Clear all cached entries.
   */
  clear() {
    store.clear();
  },

  /**
   * Get current cache size.
   * @returns {number}
   */
  get size() {
    return store.size;
  },

  /**
   * Get cache statistics.
   * @returns {object}
   */
  getStats() {
    return { ...stats, size: store.size };
  },

  /**
   * Generate a consistent cache key from URL and optional params.
   * @param {string} url
   * @param {Object} [options]
   * @returns {string}
   */
  makeKey(url, options = {}) {
    // Normalize the URL — remove query params that don't affect the response
    // but keep the path and filter params as the key
    return `${url}|${JSON.stringify(options)}`;
  },
};

module.exports = cache;
