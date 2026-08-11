/**
 * Blog Service
 *
 * Read model for the public MLS blog. Every query is hard-scoped to
 * source_type = 'mls' AND status = 'published' — agent-authored posts
 * (agent_posts) are NEVER returned by these endpoints.
 */

const pool = require('../../../config/database');
const cache = require('../../../utils/cache');
const { fetchWithRetry, normalizeProperty } = require('../../../services/mlsService');
const { MLS_GRID_BASE_URL } = require('../../../config');
const logger = require('../../../services/monitoring/logger');

const ARTICLE_FIELDS = `
  id, title, slug, excerpt, featured_image, category, city, county, state,
  neighborhood, read_time, published_at, meta_title, meta_description, tags,
  metrics, author_name, featured, created_at, updated_at
`;

const LIST_MAX_LIMIT = 30;
const MARKET_INSIGHTS_TTL_MS = 10 * 60 * 1000;

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ============================================================
// listing queries
// ============================================================

async function listArticles(params = {}) {
  const {
    category, city, county, state, search, sort = 'newest',
    featured, page = 1, limit = LIST_MAX_LIMIT,
  } = params;

  const conditions = [`source_type = 'mls'`, `status = 'published'`];
  const values = [];
  const where = () => `WHERE ${conditions.join(' AND ')}`;

  if (category) { conditions.push(`category = $${values.length + 1}`); values.push(category); }
  if (city) { conditions.push(`city ILIKE $${values.length + 1}`); values.push(`%${city}%`); }
  if (county) { conditions.push(`county ILIKE $${values.length + 1}`); values.push(`%${county}%`); }
  if (state) { conditions.push(`state = $${values.length + 1}`); values.push(state); }
  if (featured === 'true' || featured === '1') { conditions.push(`featured = TRUE`); }
  if (search) {
    const term = `%${String(search).trim()}%`;
    conditions.push(
      `(title ILIKE $${values.length + 1} OR excerpt ILIKE $${values.length + 2} OR city ILIKE $${values.length + 3} OR neighborhood ILIKE $${values.length + 4})`
    );
    values.push(term, term, term, term);
  }

  const orderByMap = {
    newest: 'published_at DESC NULLS LAST, created_at DESC',
    popular: `COALESCE((metrics->>'views')::numeric, 0) DESC, published_at DESC NULLS LAST`,
    'market-trends': `(category = 'Market Trends') DESC, published_at DESC NULLS LAST`,
    'neighborhood-guides': `(category = 'Neighborhood Guides') DESC, published_at DESC NULLS LAST`,
  };
  const orderBy = orderByMap[sort] || orderByMap.newest;

  const limitN = clampInt(limit, LIST_MAX_LIMIT, 1, LIST_MAX_LIMIT);
  const pageN = clampInt(page, 1, 1, 10000);
  const offset = (pageN - 1) * limitN;

  const countQuery = `SELECT count(*)::int AS total FROM blog_posts ${where()}`;
  const { rows: countRows } = await pool.query(countQuery, values);

  const dataQuery = `
    SELECT ${ARTICLE_FIELDS} FROM blog_posts ${where()}
    ORDER BY ${orderBy}
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;
  const { rows } = await pool.query(dataQuery, [...values, limitN, offset]);

  return {
    articles: rows,
    pagination: {
      page: pageN,
      limit: limitN,
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / limitN) || 1,
    },
  };
}

async function getArticleBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT ${ARTICLE_FIELDS}, content FROM blog_posts
     WHERE source_type = 'mls' AND status = 'published' AND slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

async function getRelatedArticles(slug, { limit = 4 } = {}) {
  const article = await getArticleBySlug(slug);
  if (!article) return [];
  const { rows } = await pool.query(
    `SELECT ${ARTICLE_FIELDS} FROM blog_posts
     WHERE source_type = 'mls' AND status = 'published' AND slug <> $1
       AND (category = $2 OR (city = $3 AND city IS NOT NULL))
     ORDER BY
       (category = $2) DESC,
       (city = $3 AND city IS NOT NULL) DESC,
       published_at DESC NULLS LAST
     LIMIT $4`,
    [slug, article.category || '', article.city || '', limit]
  );
  return rows;
}

async function getBlogMeta() {
  const { rows } = await pool.query(
    `SELECT
       (SELECT array_agg(DISTINCT category ORDER BY category) FROM blog_posts WHERE source_type='mls' AND status='published' AND category IS NOT NULL) AS categories,
       (SELECT array_agg(DISTINCT city ORDER BY city) FROM blog_posts WHERE source_type='mls' AND status='published' AND city IS NOT NULL) AS cities,
       (SELECT array_agg(DISTINCT county ORDER BY county) FROM blog_posts WHERE source_type='mls' AND status='published' AND county IS NOT NULL) AS counties,
       (SELECT count(*)::int FROM blog_posts WHERE source_type='mls' AND status='published') AS total`
  );
  return {
    categories: rows[0].categories || [],
    cities: rows[0].cities || [],
    counties: rows[0].counties || [],
    total: rows[0].total || 0,
  };
}

async function getFeaturedArticles({ limit = 5 } = {}) {
  const { rows } = await pool.query(
    `SELECT ${ARTICLE_FIELDS} FROM blog_posts
     WHERE source_type = 'mls' AND status = 'published' AND featured = TRUE
     ORDER BY published_at DESC NULLS LAST
     LIMIT $1`,
    [clampInt(limit, 5, 1, 10)]
  );
  return rows;
}

// ============================================================
// live market insights (from MLS Grid — no local stats tables)
// ============================================================

function aggregateMarketInsights(listings, totalInventory) {
  const prices = listings.map((l) => Number(l.ListPrice)).filter((v) => Number.isFinite(v) && v > 0);
  const doms = listings.map((l) => Number(l.DaysOnMarket)).filter((v) => Number.isFinite(v) && v >= 0);
  const psf = listings
    .map((l) => (Number(l.ListPrice) && Number(l.LivingArea) ? Number(l.ListPrice) / Number(l.LivingArea) : null))
    .filter((v) => Number.isFinite(v) && v > 0);
  const median = (arr) => {
    if (!arr.length) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const now = Date.now();
  const newToday = listings.filter((l) => {
    const d = new Date(l.OnMarketDate);
    if (Number.isNaN(d.getTime())) return false;
    return now - d.getTime() <= 24 * 60 * 60 * 1000;
  }).length;

  const cityCounts = new Map();
  for (const l of listings) {
    const city = String(l.City || 'Unknown').trim();
    cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
  }
  const topCities = Array.from(cityCounts.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const avgDom = doms.length ? Math.round(doms.reduce((a, b) => a + b, 0) / doms.length) : null;

  return {
    totalInventory: Number(totalInventory) || listings.length,
    sampleCount: listings.length,
    medianListPrice: prices.length ? Math.round(median(prices)) : null,
    avgDaysOnMarket: avgDom,
    medianPricePerSqFt: psf.length ? Math.round(median(psf) * 100) / 100 : null,
    newListingsToday: newToday,
    priceRange: {
      min: prices.length ? Math.round(Math.min(...prices)) : null,
      max: prices.length ? Math.round(Math.max(...prices)) : null,
    },
    topCities,
    computedAt: new Date().toISOString(),
  };
}

async function getMarketInsights({ forceRefresh = false } = {}) {
  const CACHE_KEY = 'blog:market-insights';
  if (!forceRefresh) {
    const cached = cache.get(CACHE_KEY);
    if (cached) return { ...cached, fromCache: true };
  }

  try {
    const url = `${MLS_GRID_BASE_URL}/Property?$filter=StandardStatus%20eq%20'Active'&$orderby=ModificationTimestamp%20desc&$expand=Media&$top=500&$count=true`;
    const data = await fetchWithRetry(url, { noCache: true });
    const listings = (data.value || []).map((item) => normalizeProperty(item, { maxMedia: 2 }));
    const insights = aggregateMarketInsights(listings.filter(Boolean), data['@odata.count']);
    cache.set(CACHE_KEY, insights, MARKET_INSIGHTS_TTL_MS);
    return { ...insights, fromCache: false };
  } catch (err) {
    logger.error('blog market insights MLS fetch failed', { error: err.message });
    const fallback = cache.get('blog:market-insights-stale');
    if (fallback) return { ...fallback, stale: true };
    throw err;
  }
}

// ============================================================
// reads
// ============================================================

async function recordView(slug) {
  await pool.query(
    `UPDATE blog_posts SET metrics = jsonb_set(COALESCE(metrics, '{}'::jsonb), '{views}',
       to_jsonb(COALESCE((metrics->>'views')::int, 0) + 1))::jsonb
     WHERE slug = $1 AND source_type = 'mls' AND status = 'published'`,
    [slug]
  ).catch((err) => logger.warn('blog view increment failed', { error: err.message, slug }));
}

module.exports = {
  listArticles,
  getArticleBySlug,
  getRelatedArticles,
  getBlogMeta,
  getFeaturedArticles,
  getMarketInsights,
  recordView,
};
