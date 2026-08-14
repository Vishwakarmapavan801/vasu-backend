/**
 * Redis cache with graceful in-memory fallback.
 *
 * Used for public blog responses, sitemap and RSS. When REDIS_URL is set the
 * cache lives in Redis (shared across instances, supports key patterns for
 * invalidation); otherwise a bounded in-memory Map is used so the system
 * remains fully functional in development.
 */

const IORedis = require('ioredis');

let client = null;
let memoryStore = new Map();
const MEMORY_MAX = 500;
const MEMORY_TTL_MS = 5 * 60 * 1000;

let initAttempted = false;

function getClient() {
  if (initAttempted) return client;
  initAttempted = true;
  if (!process.env.REDIS_URL) return null;
  try {
    client = new IORedis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 3000)),
    });
    client.on('error', (err) => {
      // Log once, then fall back to memory store silently.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[redisCache] Redis unavailable, using in-memory fallback:', err.message);
      }
      client = null;
    });
    client.connect().catch(() => {
      client = null;
    });
  } catch (err) {
    client = null;
  }
  return client;
}

async function get(key) {
  const c = getClient();
  if (c) {
    try {
      const raw = await c.get(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.data;
}

async function set(key, data, ttlMs = 300000) {
  const c = getClient();
  if (c) {
    try {
      await c.set(key, JSON.stringify(data), 'PX', ttlMs);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  if (memoryStore.size >= MEMORY_MAX) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey) memoryStore.delete(oldestKey);
  }
  memoryStore.set(key, { data, expiresAt: Date.now() + (ttlMs || MEMORY_TTL_MS) });
}

async function del(key) {
  const c = getClient();
  if (c) {
    try {
      await c.del(key);
    } catch {
      /* ignore */
    }
  }
  memoryStore.delete(key);
}

async function delByPattern(pattern) {
  const c = getClient();
  if (c) {
    try {
      const keys = await c.keys(pattern);
      if (keys.length) await c.del(keys);
    } catch {
      /* ignore */
    }
  }
  // Memory fallback: delete any key matching the glob pattern.
  const re = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
  for (const key of memoryStore.keys()) {
    if (re.test(key)) memoryStore.delete(key);
  }
}

/**
 * Invalidate all public blog caches (list variants, detail, sitemap, RSS).
 */
async function invalidateBlogCache(slug) {
  await Promise.all([
    delByPattern('blog:public:list:*'),
    delByPattern('blog:public:detail:*'),
    del('blog:sitemap'),
    del('blog:rss'),
  ]);
  if (slug) await del(`blog:public:detail:${slug}`);
}

module.exports = {
  get,
  set,
  del,
  delByPattern,
  invalidateBlogCache,
};
