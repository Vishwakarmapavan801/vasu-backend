/**
 * Public Blog Service
 *
 * Read model for /public/blog/posts — serves published posts from BOTH the
 * MLS blog (source_type 'mls') and the AI-generated blog (source_type 'ai').
 *
 * - List + detail responses are Redis-cached and invalidated on publish/edit.
 * - HTML content is sanitized server-side before it ever reaches the browser.
 * - Sitemap.xml and RSS feed are generated from published posts.
 */

const crypto = require('crypto');
const pool = require('../../../config/database');
const redisCache = require('../../../utils/redisCache');
const { sanitizeHtml } = require('../../../utils/sanitize');
const { CLIENT_URL, BROKERAGE_NAME } = require('../../../config');
const logger = require('../../../services/monitoring/logger');

const LIST_TTL_MS = 5 * 60 * 1000;
const DETAIL_TTL_MS = 10 * 60 * 1000;
const LIST_DEFAULT_LIMIT = 12;

const PUBLIC_LIST_FIELDS = `
  id, title, slug, excerpt, featured_image, cover_image_url, source_type,
  status, category, city, county, state, neighborhood, read_time,
  published_at, created_at, updated_at, seo_title, seo_description,
  meta_title, meta_description, og_image, tags, metrics, author_name,
  featured, source_topic
`;

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cacheKeyForList(params) {
  const canonical = {
    category: params.category || '',
    search: (params.search || '').trim().toLowerCase(),
    tag: params.tag || '',
    sort: params.sort || 'newest',
    page: clampInt(params.page, 1, 1, 10000),
    limit: clampInt(params.limit, LIST_DEFAULT_LIMIT, 1, 50),
  };
  const hash = crypto.createHash('md5').update(JSON.stringify(canonical)).digest('hex');
  return `blog:public:list:${hash}`;
}

/**
 * GET /public/blog/posts
 */
async function listPosts(params = {}) {
  const page = clampInt(params.page, 1, 1, 10000);
  const limit = clampInt(params.limit, LIST_DEFAULT_LIMIT, 1, 50);
  const offset = (page - 1) * limit;

  const cacheKey = cacheKeyForList(params);
  const cached = await redisCache.get(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const conditions = [`status = 'published'`, `source_type IN ('mls', 'ai')`];
  const values = [];

  if (params.featured === 'true' || params.featured === '1') {
    conditions.push(`featured = TRUE`);
  }
  if (params.category) {
    conditions.push(`category = $${values.length + 1}`);
    values.push(String(params.category));
  }
  if (params.tag) {
    conditions.push(`$${values.length + 1} = ANY(tags)`);
    values.push(String(params.tag));
  }
  if (params.city) {
    conditions.push(`city ILIKE $${values.length + 1}`);
    values.push(`%${params.city}%`);
  }
  if (params.search) {
    const term = `%${String(params.search).trim()}%`;
    conditions.push(
      `(title ILIKE $${values.length + 1} OR excerpt ILIKE $${values.length + 2} OR source_topic ILIKE $${values.length + 3} OR category ILIKE $${values.length + 4})`
    );
    values.push(term, term, term, term);
  }

  const orderByMap = {
    newest: 'COALESCE(published_at, created_at) DESC',
    popular: `COALESCE((metrics->>'views')::numeric, 0) DESC, COALESCE(published_at, created_at) DESC`,
    'market-trends': `(category = 'Market Trends') DESC, COALESCE(published_at, created_at) DESC`,
  };
  const orderBy = orderByMap[params.sort] || orderByMap.newest;
  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows: countRows } = await pool.query(`SELECT count(*)::int AS total FROM blog_posts ${where}`, values);
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_LIST_FIELDS} FROM blog_posts ${where} ORDER BY ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  const result = {
    articles: rows,
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / limit) || 1,
    },
  };
  await redisCache.set(cacheKey, result, LIST_TTL_MS);
  return result;
}

/**
 * GET /public/blog/posts/:slug
 */
async function getPostBySlug(slug) {
  const cacheKey = `blog:public:detail:${slug}`;
  const cached = await redisCache.get(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const { rows } = await pool.query(
    `SELECT ${PUBLIC_LIST_FIELDS}, content FROM blog_posts
     WHERE status = 'published' AND source_type IN ('mls', 'ai') AND slug = $1`,
    [slug]
  );
  if (!rows.length) return null;

  const post = rows[0];
  if (post.content) post.content = sanitizeHtml(post.content);

  const related = await getRelatedPosts(post, slug);
  const result = { article: post, related };
  await redisCache.set(cacheKey, result, DETAIL_TTL_MS);
  return result;
}

async function getRelatedPosts(post, slug, { limit = 4 } = {}) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_LIST_FIELDS} FROM blog_posts
     WHERE status = 'published' AND source_type IN ('mls', 'ai') AND slug <> $1
       AND (category = $2 OR (city = $3 AND city IS NOT NULL))
     ORDER BY
       (category = $2) DESC,
       (city = $3 AND city IS NOT NULL) DESC,
       COALESCE(published_at, created_at) DESC
     LIMIT $4`,
    [slug, post.category || '', post.city || '', limit]
  );
  return rows;
}

/**
 * GET /public/blog/posts/meta — filter facets (categories, cities, total).
 */
async function getMeta() {
  const cacheKey = 'blog:public:meta';
  const cached = await redisCache.get(cacheKey);
  if (cached) return cached;

  const { rows } = await pool.query(`
    SELECT
      (SELECT array_agg(DISTINCT category ORDER BY category) FROM blog_posts
        WHERE status='published' AND source_type IN ('mls','ai') AND category IS NOT NULL) AS categories,
      (SELECT array_agg(DISTINCT city ORDER BY city) FROM blog_posts
        WHERE status='published' AND source_type IN ('mls','ai') AND city IS NOT NULL) AS cities,
      (SELECT count(*)::int FROM blog_posts
        WHERE status='published' AND source_type IN ('mls','ai')) AS total
  `);
  const result = {
    categories: rows[0].categories || [],
    cities: rows[0].cities || [],
    total: rows[0].total || 0,
  };
  await redisCache.set(cacheKey, result, LIST_TTL_MS);
  return result;
}

// ============================================================
// SEO feeds
// ============================================================

function siteUrl() {
  return CLIENT_URL || 'https://vasurealty.com';
}

async function getSitemapXml() {
  const cached = await redisCache.get('blog:sitemap');
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT slug, COALESCE(published_at, created_at) AS lastmod FROM blog_posts
     WHERE status = 'published' AND source_type IN ('mls', 'ai')
     ORDER BY COALESCE(published_at, created_at) DESC`
  );

  const urls = rows
    .map((r) => {
      const lastmod = r.lastmod ? new Date(r.lastmod).toISOString().slice(0, 10) : '';
      return `  <url>\n    <loc>${siteUrl()}/blog/${escapeXml(r.slug)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  await redisCache.set('blog:sitemap', xml, LIST_TTL_MS);
  return xml;
}

async function getRssXml() {
  const cached = await redisCache.get('blog:rss');
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT title, slug, excerpt, author_name, COALESCE(published_at, created_at) AS pub_date,
            COALESCE(cover_image_url, featured_image, og_image) AS image, tags
     FROM blog_posts
     WHERE status = 'published' AND source_type IN ('mls', 'ai')
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT 50`
  );

  const items = rows
    .map((r) => {
      const link = `${siteUrl()}/blog/${escapeXml(r.slug)}`;
      const desc = escapeXml((r.excerpt || '').slice(0, 500));
      const author = escapeXml(r.author_name || BROKERAGE_NAME || 'Vasu Realty');
      const date = r.pub_date ? new Date(r.pub_date).toUTCString() : '';
      const image = r.image ? `\n      <enclosure url="${escapeXml(r.image)}" type="image/jpeg" />` : '';
      const cats = (r.tags || []).slice(0, 5).map((t) => `      <category>${escapeXml(t)}</category>`).join('\n');
      return `    <item>\n      <title>${escapeXml(r.title)}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      <pubDate>${date}</pubDate>\n      <author>${author}</author>\n      <description>${desc}</description>${image}${cats ? `\n${cats}` : ''}\n    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${escapeXml(BROKERAGE_NAME || 'Vasu Realty')} Blog</title>\n    <link>${siteUrl()}/blog</link>\n    <description>Real estate market trends, neighborhood guides and listings for the Charlotte NC metro — powered by live MLS and market data.</description>\n    <atom:link href="${siteUrl()}/api/public/blog/rss.xml" rel="self" type="application/rss+xml" />\n    <language>en-us</language>\n    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n${items}\n  </channel>\n</rss>`;

  await redisCache.set('blog:rss', xml, LIST_TTL_MS);
  return xml;
}

function escapeXml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function recordView(slug) {
  await pool.query(
    `UPDATE blog_posts SET metrics = jsonb_set(COALESCE(metrics, '{}'::jsonb), '{views}',
       to_jsonb(COALESCE((metrics->>'views')::int, 0) + 1))::jsonb
     WHERE slug = $1 AND status = 'published' AND source_type IN ('mls', 'ai')`,
    [slug]
  ).catch((err) => logger.warn('blog view increment failed', { error: err.message, slug }));
}

module.exports = {
  listPosts,
  getPostBySlug,
  getMeta,
  getSitemapXml,
  getRssXml,
  recordView,
};
