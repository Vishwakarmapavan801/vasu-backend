/**
 * Blog Admin Service
 *
 * Orchestrates the production blog workflow end-to-end:
 *
 *   generate → MCP snapshot → OpenAI HTML → cover image → store (GENERATED)
 *           → admin preview/edit/approve → publish (website, Facebook,
 *             LinkedIn) → PUBLISHED
 *
 * Every step is tracked in blog_generation_jobs / blog_publish_jobs and
 * logged per blog. Nothing is mocked: generation fails loudly with a
 * structured error when AutoSocial MCP is not configured.
 */

const pool = require('../../../config/database');
const mcpClient = require('../../../services/autosocial/mcpClient');
const { fetchSnapshotBundle, getConfigStatus, MCPError } = mcpClient;
const { generateArticle, generateCoverWithFallback, buildGenerationContext } = require('./aiBlogGenerator');
const storage = require('../../../services/storage/storageService');
const publish = require('./publishService');
const { sanitizeHtml, htmlToText } = require('../../../utils/sanitize');
const redisCache = require('../../../utils/redisCache');
const logger = require('../../../services/monitoring/logger');

const BLOG_STATUSES = ['GENERATED', 'PUBLISHED', 'FAILED', 'DRAFT'];
const LIST_DEFAULT_LIMIT = 20;

// ============================================================
// helpers
// ============================================================

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
}

function estimateReadTime(text) {
  const words = htmlToText(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function inferCategory(article, topic) {
  const haystack = `${topic} ${(article.tags || []).join(' ')}`.toLowerCase();
  if (/buy|first-?time|purchase/.test(haystack)) return 'Buyer Guides';
  if (/neighborhood|where to live|community/.test(haystack)) return 'Neighborhood Guides';
  if (/market|trend|price|sell/.test(haystack)) return 'Market Trends';
  return 'Market Insights';
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureUniqueSlug(slug, excludeId = null) {
  let candidate = slugify(slug) || 'blog-post';
  let suffix = 2;
  for (;;) {
    const { rows } = excludeId
      ? await pool.query('SELECT 1 FROM blog_posts WHERE slug = $1 AND id <> $2', [candidate, excludeId])
      : await pool.query('SELECT 1 FROM blog_posts WHERE slug = $1', [candidate]);
    if (rows.length === 0) return candidate;
    candidate = `${slugify(slug)}-${suffix}`;
    suffix += 1;
  }
}

// ============================================================
// generation job tracking
// ============================================================

async function createGenerationJob({ topic, triggerType = 'admin' }) {
  const { rows } = await pool.query(
    `INSERT INTO blog_generation_jobs (topic, status, trigger_type)
     VALUES ($1, 'PENDING', $2) RETURNING *`,
    [topic, triggerType]
  );
  return rows[0];
}

async function updateGenerationJob(jobId, patch) {
  const sets = [];
  const values = [];
  const fields = ['status', 'blog_post_id', 'error_message', 'completed_at', 'started_at', 'mcp_snapshot', 'mcp_listings', 'mcp_neighborhoods', 'mcp_market', 'mcp_activity', 'logs'];
  for (const f of fields) {
    if (patch[f] !== undefined) {
      sets.push(`${f} = $${values.length + 1}`);
      values.push(patch[f]);
    }
  }
  if (sets.length === 0) return null;
  sets.push(`updated_at = NOW()`);
  const { rows } = await pool.query(
    `UPDATE blog_generation_jobs SET ${sets.join(', ')} WHERE id = $${values.length + 1} RETURNING *`,
    [...values, jobId]
  );
  return rows[0];
}

async function appendJobLog(jobId, level, message, meta = {}) {
  const entry = { ts: nowIso(), level, message, ...meta };
  try {
    await pool.query(
      `UPDATE blog_generation_jobs
       SET logs = logs || $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [jobId, JSON.stringify([entry])]
    );
  } catch (err) {
    logger.warn('blog admin: failed to append job log', { error: err.message });
  }
  if (level === 'error') logger.error(`blog generation: ${message}`, meta);
  else logger.info(`blog generation: ${message}`, meta);
}

async function markJobFailed(jobId, message, extra = {}) {
  await updateGenerationJob(jobId, {
    status: 'FAILED',
    error_message: message,
    completed_at: nowIso(),
    ...extra,
  });
  await appendJobLog(jobId, 'error', message);
}

// ============================================================
// insert / update posts
// ============================================================

const POST_INSERT_COLUMNS = `
  title, slug, excerpt, content, featured_image, published, source_type,
  status, category, city, county, state, neighborhood, listing_key, read_time,
  published_at, meta_title, meta_description, tags, metrics, author_name,
  featured, updated_at, cover_image_url, source_topic, seo_title,
  seo_description, canonical_url, og_image
`;

async function insertAiPost({ article, cover, topic, jobId, category }) {
  const slug = await ensureUniqueSlug(article.slug);
  const excerpt = (article.excerpt || '').trim() || htmlToText(article.content_html).slice(0, 160);
  const content = sanitizeHtml(article.content_html);
  const readTime = estimateReadTime(content);

  const values = [
    article.title,
    slug,
    excerpt,
    content,
    cover.url,
    false,
    'ai',
    'GENERATED',
    category,
    null,
    null,
    null,
    null,
    null,
    readTime,
    null,
    article.seo_title || article.title,
    article.meta_description || excerpt.slice(0, 158),
    article.tags || [],
    JSON.stringify({
      views: 0,
      likes: 0,
      shares: 0,
      generation: { jobId, generatedAt: nowIso() },
      approval: {},
      publish: {},
    }),
    require('../../../config').BLOG_AUTHOR_NAME || 'Vasu Realty',
    false,
    nowIso(),
    cover.url,
    topic,
    article.seo_title || article.title,
    article.meta_description || excerpt.slice(0, 158),
    null,
    cover.url,
  ];

  const { rows } = await pool.query(
    `INSERT INTO blog_posts (${POST_INSERT_COLUMNS}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    values
  );
  return rows[0];
}

async function recordAsset({ blogPostId, kind, storageResult, width, height, mimeType, source, prompt, sourceUrl, fallback = false }) {
  const { rows } = await pool.query(
    `INSERT INTO blog_assets
       (blog_post_id, kind, storage_key, storage_bucket, url, width, height, mime_type, size_bytes, source, prompt, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      blogPostId,
      kind,
      storageResult.key,
      storageResult.bucket,
      storageResult.url,
      width || null,
      height || null,
      mimeType || null,
      null,
      source || 'openai',
      prompt || null,
      JSON.stringify({ sourceUrl: sourceUrl || null, fallback }),
    ]
  );
  return rows[0];
}

// ============================================================
// main generation flow
// ============================================================

/**
 * Run the full generation pipeline and persist the result as status GENERATED.
 * @param {Object} opts
 * @param {string} opts.topic
 * @param {string} [opts.triggerType='admin']
 * @returns {Promise<{post, job}>}
 */
async function generateAndStore({ topic, triggerType = 'admin' }) {
  const startedAt = Date.now();
  if (!topic || !String(topic).trim()) {
    throw new Error('topic is required');
  }
  const cleanTopic = String(topic).trim();

  const job = await createGenerationJob({ topic: cleanTopic, triggerType });
  await updateGenerationJob(job.id, { status: 'RUNNING', started_at: nowIso() });
  await appendJobLog(job.id, 'info', 'generation job started', { triggerType });

  // 1. AutoSocial MCP live snapshot
  const mcpStatus = getConfigStatus();
  if (!mcpStatus.configured) {
    await markJobFailed(job.id, `AutoSocial MCP is not configured (missing: ${mcpStatus.missing.join(', ')}).`);
    throw new Error(`AutoSocial MCP is not configured (missing: ${mcpStatus.missing.join(', ')}).`);
  }

  let bundle;
  try {
    bundle = await fetchSnapshotBundle();
    const failedMembers = Object.keys(bundle.failures);
    if (failedMembers.length > 0) {
      await appendJobLog(job.id, 'warn', 'some MCP bundle members failed', { failures: bundle.failures });
    } else {
      await appendJobLog(job.id, 'info', 'MCP snapshot retrieved', {
        snapshot: !!bundle.results.snapshot,
        listings: Array.isArray(bundle.results.listings) ? bundle.results.listings.length : 0,
      });
    }
    if (failedMembers.length === 5) {
      // No real MCP data at all — an article built from zero snapshot data
      // would not satisfy "generated from real MCP data". Fail loudly with
      // the first error (usually the org-context requirement).
      const first = bundle.failures[Object.keys(bundle.failures)[0]];
      const detail = first && first.correlationId ? `${first.message} [correlation: ${first.correlationId}]` : (first && first.message) || 'all MCP bundle members failed';
      await markJobFailed(job.id, `MCP snapshot retrieval failed: ${detail}`);
      throw new MCPError(detail, { code: 'MCP_BUNDLE_EMPTY' });
    }
    await updateGenerationJob(job.id, {
      mcp_snapshot: JSON.stringify(bundle.results.snapshot || null),
      mcp_listings: JSON.stringify(bundle.results.listings || []),
      mcp_neighborhoods: JSON.stringify(bundle.results.neighborhoods || []),
      mcp_market: JSON.stringify(bundle.results.market || null),
      mcp_activity: JSON.stringify(bundle.results.activity || []),
    });
  } catch (err) {
    const detail = err.correlationId ? `${err.message} [correlation: ${err.correlationId}]` : err.message;
    await markJobFailed(job.id, `MCP snapshot retrieval failed: ${detail}`);
    throw err;
  }

  // 2. Enrich + generate article HTML
  let article;
  try {
    const context = buildGenerationContext({
      topic: cleanTopic,
      snapshot: bundle.results.snapshot,
      listings: bundle.results.listings,
      neighborhoods: bundle.results.neighborhoods,
      market: bundle.results.market,
      activity: bundle.results.activity,
    });
    article = await generateArticle({ topic: cleanTopic, context });
    await appendJobLog(job.id, 'info', 'OpenAI article HTML generated', {
      title: article.title,
      chars: (article.content_html || '').length,
    });
  } catch (err) {
    await markJobFailed(job.id, `AI article generation failed: ${err.message}`);
    throw err;
  }

  // 3. Cover image (with automatic MCP listing photo fallback)
  let cover;
  let coverAsset;
  try {
    const generated = await generateCoverWithFallback({
      imagePrompt: article.image_prompt,
      title: article.title,
      listings: bundle.results.listings,
    });
    const storageResult = await storage.uploadCoverImage(generated.buffer, { mimeType: generated.mimeType });
    cover = { url: storageResult.url };
    coverAsset = { storageResult, ...generated };
    await appendJobLog(job.id, 'info', 'cover image stored', {
      source: generated.source,
      url: storageResult.url,
    });
  } catch (err) {
    // Spec: fallback already attempted — if even the fallback failed, the
    // article can still be stored; the post simply has no cover.
    await appendJobLog(job.id, 'warn', 'cover image unavailable (article still stored)', { error: err.message });
    cover = { url: null };
  }

  // 4. Persist as GENERATED
  const category = inferCategory(article, cleanTopic);
  const post = await insertAiPost({ article, cover, topic: cleanTopic, jobId: job.id, category });
  await pool.query(`UPDATE blog_posts SET metrics = metrics || $2::jsonb WHERE id = $1`, [
    post.id,
    JSON.stringify({ generation: { jobId: job.id, generatedAt: nowIso(), durationMs: Date.now() - startedAt } }),
  ]);

  if (coverAsset) {
    await recordAsset({
      blogPostId: post.id,
      kind: coverAsset.source === 'mcp' ? 'listing_fallback' : 'cover',
      storageResult: coverAsset.storageResult,
      width: coverAsset.width,
      height: coverAsset.height,
      mimeType: coverAsset.mimeType,
      source: coverAsset.source,
      prompt: article.image_prompt,
      sourceUrl: coverAsset.sourceUrl,
      fallback: coverAsset.source !== 'openai',
    });
  }

  await updateGenerationJob(job.id, {
    status: 'SUCCEEDED',
    blog_post_id: post.id,
    completed_at: nowIso(),
  });
  await appendJobLog(job.id, 'info', 'generation job completed', { postId: post.id, durationMs: Date.now() - startedAt });

  logger.info('blog admin: post generated', { postId: post.id, slug: post.slug, topic: cleanTopic });

  const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [post.id]);
  return { post: rows[0], job: await getJob(job.id) };
}

// ============================================================
// reads
// ============================================================

const ADMIN_POST_FIELDS = `
  id, title, slug, excerpt, content, cover_image_url, source_type, status,
  category, city, county, state, neighborhood, read_time, published_at,
  created_at, updated_at, seo_title, seo_description, meta_title,
  meta_description, canonical_url, og_image, tags, metrics, author_name,
  source_topic, featured_image, featured
`;

async function listPosts({ status, search, category, page = 1, limit = LIST_DEFAULT_LIMIT } = {}) {
  const conditions = [`source_type = 'ai'`];
  const values = [];

  if (status && BLOG_STATUSES.includes(status.toUpperCase())) {
    conditions.push(`status = $${values.length + 1}`);
    values.push(status.toUpperCase());
  }
  if (category) {
    conditions.push(`category = $${values.length + 1}`);
    values.push(category);
  }
  if (search) {
    const term = `%${search}%`;
    conditions.push(`(title ILIKE $${values.length + 1} OR source_topic ILIKE $${values.length + 2} OR excerpt ILIKE $${values.length + 3})`);
    values.push(term, term, term);
  }

  const pageN = Math.max(1, parseInt(page, 10) || 1);
  const limitN = Math.min(100, Math.max(1, parseInt(limit, 10) || LIST_DEFAULT_LIMIT));
  const offset = (pageN - 1) * limitN;
  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows: countRows } = await pool.query(`SELECT count(*)::int AS total FROM blog_posts ${where}`, values);
  const { rows } = await pool.query(
    `SELECT ${ADMIN_POST_FIELDS} FROM blog_posts ${where}
     ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limitN, offset]
  );

  // Attach publish-job statuses for the returned posts in one query.
  const publishJobs = await getPublishJobsForPosts(rows.map((r) => r.id));

  return {
    posts: rows.map((p) => ({ ...p, publish_jobs: publishJobs[p.id] || [] })),
    pagination: {
      page: pageN,
      limit: limitN,
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / limitN) || 1,
    },
  };
}

async function getPublishJobsForPosts(postIds) {
  if (!postIds.length) return {};
  const { rows } = await pool.query(
    `SELECT * FROM blog_publish_jobs WHERE blog_post_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
    [postIds]
  );
  const map = {};
  for (const row of rows) {
    (map[row.blog_post_id] = map[row.blog_post_id] || []).push(row);
  }
  return map;
}

async function getById(id) {
  const { rows } = await pool.query(`SELECT * FROM blog_posts WHERE id = $1`, [id]);
  if (!rows.length) return null;
  const post = rows[0];

  const [genJobs, pubJobs, assets] = await Promise.all([
    pool.query(`SELECT * FROM blog_generation_jobs WHERE blog_post_id = $1 ORDER BY created_at DESC`, [id]),
    pool.query(`SELECT * FROM blog_publish_jobs WHERE blog_post_id = $1 ORDER BY created_at DESC`, [id]),
    pool.query(`SELECT * FROM blog_assets WHERE blog_post_id = $1 ORDER BY created_at DESC`, [id]),
  ]);

  return {
    ...post,
    generation_jobs: genJobs.rows,
    publish_jobs: pubJobs.rows,
    assets: assets.rows,
  };
}

async function listJobs({ status, page = 1, limit = 20 } = {}) {
  const conditions = [];
  const values = [];
  if (status) {
    conditions.push(`j.status = $${values.length + 1}`);
    values.push(String(status).toUpperCase());
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageN = Math.max(1, parseInt(page, 10) || 1);
  const limitN = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const { rows } = await pool.query(
    `SELECT j.*, p.title AS post_title, p.slug AS post_slug
     FROM blog_generation_jobs j
     LEFT JOIN blog_posts p ON p.id = j.blog_post_id
     ${where}
     ORDER BY j.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limitN, (pageN - 1) * limitN]
  );
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total FROM blog_generation_jobs j ${where}`,
    values
  );
  return {
    jobs: rows,
    pagination: { page: pageN, limit: limitN, total: countRows[0].total, totalPages: Math.ceil(countRows[0].total / limitN) || 1 },
  };
}

async function getJob(id) {
  const { rows } = await pool.query(
    `SELECT j.*, p.title AS post_title, p.slug AS post_slug
     FROM blog_generation_jobs j
     LEFT JOIN blog_posts p ON p.id = j.blog_post_id
     WHERE j.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// ============================================================
// mutations: update / approve / publish / remove
// ============================================================

async function updatePost(id, data = {}) {
  const post = await getById(id);
  if (!post) return null;

  const fields = ['title', 'excerpt', 'content', 'cover_image_url', 'og_image', 'seo_title', 'seo_description', 'meta_title', 'meta_description', 'canonical_url', 'tags', 'author_name', 'category', 'status'];
  const sets = [];
  const values = [];

  if (data.slug !== undefined && data.slug !== post.slug) {
    const uniqueSlug = await ensureUniqueSlug(data.slug, id);
    sets.push(`slug = $${values.length + 1}`);
    values.push(uniqueSlug);
  }

  for (const f of fields) {
    if (data[f] === undefined) continue;
    let value = data[f];
    if (f === 'content') value = sanitizeHtml(value);
    if (f === 'tags') value = Array.isArray(value) ? value.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : [];
    if (f === 'status' && value) value = String(value).toUpperCase();
    if (f === 'status' && value && !BLOG_STATUSES.includes(value)) continue;
    sets.push(`${f} = $${values.length + 1}`);
    values.push(value);
  }

  // Recompute read time when content changes.
  const nextContent = data.content !== undefined ? sanitizeHtml(data.content) : post.content;
  if (data.content !== undefined) {
    sets.push(`read_time = $${values.length + 1}`);
    values.push(estimateReadTime(nextContent));
  }

  // SEO fallbacks: keep seo_* in sync with meta_* unless explicitly provided.
  if (data.seo_title === undefined && data.meta_title !== undefined) {
    sets.push(`seo_title = $${values.length + 1}`);
    values.push(data.meta_title);
  }
  if (data.seo_description === undefined && data.meta_description !== undefined) {
    sets.push(`seo_description = $${values.length + 1}`);
    values.push(data.meta_description);
  }

  // Publish scheduling lives in metrics.publish.scheduled_at.
  if (data.scheduled_publish_at !== undefined) {
    const scheduledAt = data.scheduled_publish_at ? new Date(data.scheduled_publish_at).toISOString() : null;
    const metricsPatch = { publish: { ...(post.metrics?.publish || {}), scheduled_at: scheduledAt } };
    sets.push(`metrics = metrics || $${values.length + 1}::jsonb`);
    values.push(JSON.stringify(metricsPatch));
  }

  if (sets.length === 0) return getById(id);

  sets.push(`updated_at = NOW()`);
  await pool.query(`UPDATE blog_posts SET ${sets.join(', ')} WHERE id = $${values.length + 1}`, [...values, id]);

  await redisCache.invalidateBlogCache(post.slug);
  return getById(id);
}

async function removePost(id) {
  const post = await getById(id);
  if (!post) return null;
  await pool.query(`DELETE FROM blog_posts WHERE id = $1`, [id]);
  await redisCache.invalidateBlogCache(post.slug);
  return { id, slug: post.slug };
}

async function approvePost(id, { actor } = {}) {
  const post = await getById(id);
  if (!post) return null;
  if (post.status === 'PUBLISHED') return { ...post, alreadyPublished: true };

  const approval = { approved_at: nowIso(), approved_by: actor || 'admin' };
  await pool.query(
    `UPDATE blog_posts
     SET metrics = metrics || $2::jsonb, status = 'GENERATED', updated_at = NOW()
     WHERE id = $1`,
    [id, JSON.stringify({ approval })]
  );
  return getById(id);
}

/**
 * Publish a post to website + Facebook + LinkedIn.
 * Requires prior approval (approval.approved_at) unless force is set.
 */
async function publishPost(id, { actor } = {}) {
  const post = await getById(id);
  if (!post) return null;
  if (post.status === 'PUBLISHED') {
    const err = new Error('This post is already published.');
    err.code = 'ALREADY_PUBLISHED';
    throw err;
  }

  const approvedAt = post.metrics?.approval?.approved_at;
  if (!approvedAt) {
    const err = new Error('Approve this post before publishing.');
    err.code = 'NOT_APPROVED';
    throw err;
  }

  const publishedAt = nowIso();
  const canonicalUrl = post.canonical_url || `${require('../../../config').CLIENT_URL || 'https://vasurealty.com'}/blog/${post.slug}`;

  // Website: flip to PUBLISHED immediately.
  await pool.query(
    `UPDATE blog_posts
     SET status = 'PUBLISHED', published_at = $2, canonical_url = COALESCE(canonical_url, $3),
         og_image = COALESCE(og_image, cover_image_url), published = TRUE, updated_at = NOW()
     WHERE id = $1`,
    [id, publishedAt, canonicalUrl]
  );

  const publishJobs = [];
  const recordPublishResult = async (destination, result) => {
    const status = result.skipped ? 'SKIPPED' : result.ok ? 'SUCCESS' : 'FAILED';
    const { rows } = await pool.query(
      `INSERT INTO blog_publish_jobs
         (blog_post_id, destination, status, external_id, external_url, error_message, attempts, response, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7::jsonb,$8)
       ON CONFLICT (blog_post_id, destination) DO UPDATE SET
         status = EXCLUDED.status,
         external_id = EXCLUDED.external_id,
         external_url = EXCLUDED.external_url,
         error_message = EXCLUDED.error_message,
         attempts = blog_publish_jobs.attempts + 1,
         response = EXCLUDED.response,
         published_at = EXCLUDED.published_at,
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        destination,
        status,
        result.externalId || null,
        result.externalUrl || null,
        result.detail || null,
        JSON.stringify(result),
        status === 'SUCCESS' ? (result.publishedAt || publishedAt) : null,
      ]
    );
    publishJobs.push(rows[0]);
  };

  const websiteResult = await publish.publishToWebsite(post);
  await recordPublishResult('website', { ...websiteResult, publishedAt });

  const facebookResult = await publish.publishToFacebook(post);
  await recordPublishResult('facebook', facebookResult);

  const linkedinResult = await publish.publishToLinkedIn(post);
  await recordPublishResult('linkedin', linkedinResult);

  // Track publish summary in post metrics.
  await pool.query(
    `UPDATE blog_posts
     SET metrics = metrics || $2::jsonb
     WHERE id = $1`,
    [id, JSON.stringify({ publish: { published_at: publishedAt, destinations: publishJobs.map((j) => j.destination) } })]
  );

  await redisCache.invalidateBlogCache(post.slug);
  logger.info('blog admin: post published', { postId: id, slug: post.slug, jobs: publishJobs.map((j) => `${j.destination}:${j.status}`) });

  const updated = await getById(id);
  return { ...updated, publish_jobs: publishJobs };
}

/**
 * Regenerate an existing post with the same (or new) topic. Creates a new
 * generation job and updates the post in place.
 */
async function regeneratePost(id, { topic, triggerType = 'admin' } = {}) {
  const post = await getById(id);
  if (!post) return null;
  const useTopic = (topic && String(topic).trim()) || post.source_topic || post.title;
  return generateAndStore({ topic: useTopic, triggerType: `${triggerType}-regenerate` });
}

/**
 * Admin-visible MCP status including a live connectivity/auth check.
 */
async function getMcpStatusDetailed() {
  return mcpClient.getMcpStatus();
}

module.exports = {
  generateAndStore,
  regeneratePost,
  listPosts,
  getById,
  updatePost,
  removePost,
  approvePost,
  publishPost,
  listJobs,
  getJob,
  getMcpStatusDetailed,
  slugify,
  estimateReadTime,
  inferCategory,
};
