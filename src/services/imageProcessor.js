/**
 * Media Image Processor — production media pipeline
 *
 * Produces responsive, size-capped variants of MLS media images backed by a
 * persistent, content-addressed on-disk store so each variant is generated
 * exactly once and then streamed with long-lived immutable cache headers —
 * the "poor man's image CDN".
 *
 * Supported query params (on /api/image/:mediaKey):
 *   w     target max width in px (16..2048). Presence of w = variant mode.
 *   q     output quality (1..100). Default 82 (jpeg) / 75 (webp) / 70 (avif).
 *   blur  gaussian blur sigma (0..10). Used for tiny LQIP placeholders.
 *   fm    output format: jpeg (default) | webp | avif. When omitted and an
 *         Accept header is present, the format is negotiated and the response
 *         is marked with Vary: Accept.
 *
 * Pipeline features:
 * - Persistent original store keyed by mediaKey, content-addressed via a
 *   sidecar sha1 (re-fetches with different bytes replace + invalidate).
 * - Pre-generated variant set (MEDIA_VARIANT_WIDTHS × MEDIA_VARIANT_FORMATS)
 *   built asynchronously in a bounded, deduplicated background queue so the
 *   first user hit returns fast and every later size is a disk HIT.
 * - Streaming file delivery with HTTP Range (206) and 304 ETag support.
 * - Atomic writes (temp file + rename) so concurrent readers never see a
 *   partially-written variant.
 * - Zero-dependency metrics counters/timers (cache hit/miss, generation time).
 */

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const sharp = require('sharp');

const {
  MEDIA_CACHE_DIR,
  MEDIA_PIPELINE_ENABLED,
  MEDIA_VARIANT_WIDTHS,
  MEDIA_VARIANT_FORMATS,
  MEDIA_WARM_CONCURRENCY,
  MEDIA_WARM_MAX_KEYS,
} = require('../config');
const imageMetrics = require('../utils/imageMetrics');

const CACHE_ROOT = MEDIA_CACHE_DIR || path.join(process.cwd(), '.cache', 'media');
const MAX_WIDTH = 2048;
const MAX_QUALITY = 100;
const MAX_BLUR = 10;
const FORMATS = { webp: 'webp', jpeg: 'jpeg', jpg: 'jpeg', avif: 'avif' };
const MIME = { webp: 'image/webp', jpeg: 'image/jpeg', avif: 'image/avif' };
const ORIGINAL_EXTS = ['jpeg', 'jpg', 'webp', 'png', 'avif'];

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const VARIANT_WIDTHS = Array.isArray(MEDIA_VARIANT_WIDTHS) && MEDIA_VARIANT_WIDTHS.length
  ? MEDIA_VARIANT_WIDTHS
  : [160, 320, 480, 640, 800, 1200, 1600];
const VARIANT_FORMATS = Array.isArray(MEDIA_VARIANT_FORMATS) && MEDIA_VARIANT_FORMATS.length
  ? MEDIA_VARIANT_FORMATS
  : ['webp', 'avif', 'jpeg'];
const QUALITY_BY_FORMAT = { jpeg: 82, webp: 75, avif: 70 };

// ============================================================
// BACKGROUND VARIANT PRE-GENERATION QUEUE
// Deduplicated by mediaKey, bounded by MEDIA_WARM_MAX_KEYS, processed at
// MEDIA_WARM_CONCURRENCY so the CPU/disk cost of warming never blocks
// request-serving or hammers upstream.
// ============================================================
const warmQueued = new Set();
const warmRunning = new Map();
const warmBacklog = [];
const WARM_MAX_ACTIVE = Math.max(1, MEDIA_WARM_CONCURRENCY || 2);
let warmActive = 0;

// ============================================================
// HELPERS
// ============================================================
function sanitizeKey(key) {
  return String(key || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Parse + validate image query params.
 * When `req` is passed and no explicit fm is given, the format is negotiated
 * from the Accept header (response is then marked Vary: Accept).
 * Returns { isVariant, width, quality, blur, fm, varyAccept }.
 */
function parseVariant(query = {}, req) {
  const rawW = parseInt(query.w, 10);
  const rawQ = parseInt(query.q, 10);
  const rawBlur = parseFloat(query.blur);
  const explicitFm = String(query.fm || '').toLowerCase();

  let fm = FORMATS[explicitFm] || null;
  let varyAccept = false;
  if (!fm && req && req.headers && req.headers.accept) {
    fm = negotiateFormat(req.headers.accept);
    varyAccept = true;
  }
  if (!fm) fm = 'jpeg';

  return {
    isVariant: Number.isFinite(rawW) && rawW > 0,
    width: Number.isFinite(rawW) && rawW > 0 ? Math.min(rawW, MAX_WIDTH) : null,
    quality: Number.isFinite(rawQ) && rawQ > 0 ? Math.min(rawQ, MAX_QUALITY) : (QUALITY_BY_FORMAT[fm] || 82),
    blur: Number.isFinite(rawBlur) && rawBlur > 0 ? Math.min(rawBlur, MAX_BLUR) : 0,
    fm,
    varyAccept,
  };
}

function negotiateFormat(acceptHeader) {
  const accepts = String(acceptHeader).split(',').map(a => a.trim().split(';')[0].toLowerCase());
  if (accepts.some(a => a.includes('avif'))) return 'avif';
  if (accepts.some(a => a.includes('webp'))) return 'webp';
  return 'jpeg';
}

function variantFileName(mediaKey, opts) {
  const safe = sanitizeKey(mediaKey);
  const parts = [safe, `w${opts.width || 'full'}`];
  if (opts.blur) parts.push(`b${opts.blur}`);
  parts.push(`q${opts.quality}`);
  parts.push(opts.fm);
  return `${parts.join('_')}.${opts.fm}`;
}

function variantPath(mediaKey, opts) {
  return path.join(CACHE_ROOT, sanitizeKey(mediaKey), variantFileName(mediaKey, opts));
}

function mediaDir(mediaKey) {
  return path.join(CACHE_ROOT, sanitizeKey(mediaKey));
}

async function fileExists(file) {
  try { await fsp.access(file); return true; } catch { return false; }
}

async function readFileMaybe(file) {
  try { return await fsp.readFile(file); } catch { return null; }
}

async function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

function originalExtFromContentType(contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('png')) return 'png';
  if (ct.includes('avif')) return 'avif';
  return 'jpeg';
}

// ============================================================
// PERSISTENT ORIGINAL STORE
// Content-addressed: `original.<ext>` holds the current bytes and a
// `original.sha1` sidecar records their hash. A re-fetch whose bytes differ
// replaces the original and invalidates pre-generated variants so nothing
// stale is ever served.
// ============================================================
async function getOriginalEntry(mediaKey) {
  const dir = mediaDir(mediaKey);
  for (const ext of ORIGINAL_EXTS) {
    const p = path.join(dir, `original.${ext}`);
    if (await fileExists(p)) {
      const contentType = ext === 'webp' ? 'image/webp'
        : ext === 'avif' ? 'image/avif'
          : ext === 'png' ? 'image/png'
            : 'image/jpeg';
      return { file: p, ext, contentType };
    }
  }
  return null;
}

/**
 * Persist the full-resolution original for a mediaKey.
 * @returns {Promise<string|null>} path to the stored original, or null.
 */
async function persistOriginal(mediaKey, buffer, contentType, etag) {
  if (!buffer || !MEDIA_PIPELINE_ENABLED) return null;
  const dir = mediaDir(mediaKey);
  await fsp.mkdir(dir, { recursive: true });

  const ext = originalExtFromContentType(contentType);
  const file = path.join(dir, `original.${ext}`);
  const sidecar = path.join(dir, 'original.sha1');
  const hash = crypto.createHash('sha1').update(buffer).digest('hex');

  let existingHash = null;
  try { existingHash = (await fsp.readFile(sidecar, 'utf8')).trim(); } catch { /* no sidecar yet */ }

  if (existingHash === hash && (await fileExists(file))) {
    return file;
  }

  // New (or changed) bytes — persist atomically, then invalidate stale variants.
  await atomicWrite(file, buffer);
  await fsp.writeFile(sidecar, `${hash}\n`);
  await invalidateVariants(mediaKey);

  if (MEDIA_PIPELINE_ENABLED) enqueueWarm(mediaKey);
  return file;
}

async function invalidateVariants(mediaKey) {
  const dir = mediaDir(mediaKey);
  try {
    const names = await fsp.readdir(dir);
    await Promise.all(
      names
        .filter(n => !n.startsWith('original.') && /\.(webp|avif|jpe?g)$/i.test(n))
        .map(n => fsp.unlink(path.join(dir, n)).catch(() => {}))
    );
  } catch { /* dir may not exist */ }
}

/**
 * Read the persisted original buffer for a mediaKey.
 * @returns {{ buffer: Buffer, contentType: string } | null}
 */
async function getPersistedOriginal(mediaKey) {
  const entry = await getOriginalEntry(mediaKey);
  if (!entry) return null;
  const buffer = await readFileMaybe(entry.file);
  if (!buffer) return null;
  return { buffer, contentType: entry.contentType };
}

// ============================================================
// ENCODING
// ============================================================
/**
 * Resize/encode an input buffer into the requested variant.
 * AVIF is attempted first-class; if the installed libvips cannot encode it
 * (graceful fallback), webp is returned instead.
 */
async function encodeVariant(input, opts) {
  try {
    return await processVariant(input, opts);
  } catch (err) {
    if (opts.fm === 'avif') {
      return processVariant(input, { ...opts, fm: 'webp' });
    }
    throw err;
  }
}

async function processVariant(input, opts) {
  const pipeline = sharp(input, { failOn: 'none' }).rotate();
  if (opts.width) {
    pipeline.resize({ width: opts.width, withoutEnlargement: true });
  }
  if (opts.blur > 0) pipeline.blur(opts.blur);
  if (opts.fm === 'avif') {
    return pipeline.avif({ quality: opts.quality, effort: 4 }).toBuffer();
  }
  if (opts.fm === 'webp') {
    return pipeline.webp({ quality: opts.quality, effort: 4 }).toBuffer();
  }
  return pipeline.jpeg({ quality: opts.quality, mozjpeg: true, progressive: true }).toBuffer();
}

function etagFor(file, size) {
  return `"${crypto.createHash('sha1').update(`${path.basename(file)}:${size}`).digest('hex')}"`;
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m) return null;
  const [, startStr, endStr] = m;
  if (startStr === '') {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;
  const end = endStr === '' ? size - 1 : Math.min(parseInt(endStr, 10), size - 1);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end };
}

/**
 * Stream a cached file to the response with HTTP caching semantics.
 * Supports If-None-Match → 304 and Range → 206. Resolves once headers have
 * been written; body streaming continues without holding the request handler.
 */
async function streamFile(res, file, {
  cacheStatus, contentType, varyAccept, ifNoneMatch, range, addHeaders,
}) {
  let stat;
  try { stat = await fsp.stat(file); } catch { return null; }
  const etag = etagFor(file, stat.size);

  res.setHeader('Content-Type', contentType || 'image/jpeg');
  res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  res.setHeader('ETag', etag);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Cache', cacheStatus);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (varyAccept) res.setHeader('Vary', 'Accept');
  if (addHeaders) {
    for (const [k, v] of Object.entries(addHeaders)) res.setHeader(k, v);
  }

  if (ifNoneMatch && ifNoneMatch.split(/\s*,\s*/).includes(etag)) {
    res.statusCode = 304;
    res.end();
    return { status: 304, size: stat.size, bytes: 0 };
  }

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range) {
    const parsed = parseRange(range, stat.size);
    if (parsed) {
      start = parsed.start;
      end = parsed.end;
      status = 206;
    }
  }
  res.statusCode = status;
  res.setHeader('Content-Length', status === 206 ? end - start + 1 : stat.size);
  if (status === 206) {
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }

  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  if (typeof res.on === 'function') {
    res.on('close', () => stream.destroy());
  }
  stream.pipe(res);
  return { status, size: stat.size, bytes: status === 206 ? end - start + 1 : stat.size };
}

// ============================================================
// VARIANT SET GENERATION + BACKGROUND QUEUE
// ============================================================
async function generateVariantSet(mediaKey) {
  const entry = await getOriginalEntry(mediaKey);
  if (!entry) return { generated: 0, skipped: 0 };
  const buffer = await readFileMaybe(entry.file);
  if (!buffer) return { generated: 0, skipped: 0 };

  let generated = 0;
  let skipped = 0;
  for (const width of VARIANT_WIDTHS) {
    for (const fm of VARIANT_FORMATS) {
      const opts = { width, quality: QUALITY_BY_FORMAT[fm] || 82, blur: 0, fm };
      const vPath = variantPath(mediaKey, opts);
      if (await fileExists(vPath)) { skipped++; continue; }
      try {
        const out = await encodeVariant(buffer, opts);
        await fsp.mkdir(path.dirname(vPath), { recursive: true });
        await atomicWrite(vPath, out);
        generated++;
      } catch {
        // Skip problematic encodings (e.g. unsupported source format).
      }
    }
  }
  if (generated > 0) imageMetrics.recordCounter('variantsGenerated', generated);
  return { generated, skipped };
}

/** Enqueue pre-generation of the full variant set for a mediaKey (dedup). */
function enqueueWarm(mediaKey) {
  if (!MEDIA_PIPELINE_ENABLED) return;
  if (!mediaKey || warmQueued.has(mediaKey) || warmRunning.has(mediaKey)) return;
  if (warmQueued.size >= (MEDIA_WARM_MAX_KEYS || 600)) {
    const oldest = warmBacklog.shift();
    if (oldest) warmQueued.delete(oldest);
  }
  warmQueued.add(mediaKey);
  warmBacklog.push(mediaKey);
  pumpWarm();
}

function pumpWarm() {
  while (warmActive < WARM_MAX_ACTIVE && warmBacklog.length > 0) {
    const mediaKey = warmBacklog.shift();
    if (!mediaKey || !warmQueued.has(mediaKey)) continue;
    warmQueued.delete(mediaKey);
    warmActive++;
    const p = generateVariantSet(mediaKey)
      .catch(() => ({ generated: 0, skipped: 0 }))
      .finally(() => {
        warmRunning.delete(mediaKey);
        warmActive--;
        pumpWarm();
      });
    warmRunning.set(mediaKey, p);
  }
}

/**
 * Ensure an original is persisted for a mediaKey, enqueueing variant
 * pre-generation. Used by the background warmup job.
 */
async function ensureOriginal(mediaKey, fetchOriginal) {
  const existing = await getOriginalEntry(mediaKey);
  if (existing) {
    enqueueWarm(mediaKey);
    return { from: 'disk' };
  }
  const fetched = await fetchOriginal();
  if (fetched && fetched.status === 'ok') {
    await persistOriginal(mediaKey, fetched.buffer, fetched.contentType, fetched.etag);
    imageMetrics.recordCounter('warmed');
    return { from: 'upstream' };
  }
  if (fetched && fetched.status === 'rate-limited') {
    imageMetrics.recordCounter('rateLimited');
  }
  return { from: fetched ? fetched.status : 'unknown' };
}

function warmStats() {
  return {
    queued: warmQueued.size,
    backlog: warmBacklog.length,
    running: warmRunning.size,
    active: warmActive,
    maxActive: WARM_MAX_ACTIVE,
    widths: VARIANT_WIDTHS,
    formats: VARIANT_FORMATS,
  };
}

// ============================================================
// SERVING
// ============================================================
/**
 * Serve a responsive variant.
 *
 * @param {string} mediaKey - stable MLS media key
 * @param {object} opts - result of parseVariant()
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} deps
 * @param {() => Promise<{status: string, buffer?: Buffer, contentType?: string}>} deps.fetchOriginal
 */
async function serveVariant(mediaKey, opts, req, res, { fetchOriginal }) {
  imageMetrics.recordCounter('requests');
  const vPath = variantPath(mediaKey, opts);

  // 1. Disk cache hit — instant, no upstream contact.
  if (await fileExists(vPath)) {
    imageMetrics.recordCounter('hits');
    imageMetrics.recordCounter('variantsServed');
    return streamFile(res, vPath, {
      cacheStatus: 'HIT',
      contentType: MIME[opts.fm] || 'image/jpeg',
      varyAccept: opts.varyAccept,
      ifNoneMatch: req.headers['if-none-match'],
      range: req.headers.range,
    });
  }

  // 2. Source: persisted original, else upstream fetch.
  let source = await getPersistedOriginal(mediaKey);
  if (!source) {
    const fetched = await fetchOriginal();
    if (fetched && fetched.status === 'ok') {
      source = { buffer: fetched.buffer, contentType: fetched.contentType };
      await persistOriginal(mediaKey, fetched.buffer, fetched.contentType, fetched.etag);
    } else {
      imageMetrics.recordCounter(fetched && fetched.status === 'rate-limited' ? 'rateLimited' : fetched && fetched.status === 'no-url' ? 'notFound' : 'misses');
    }
  }
  if (!source) {
    // Upstream unavailable (rate-limited, missing, network). Keep the failure
    // fast and uncached so the client can retry its fallback chain.
    if (!res.headersSent) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(204).end();
    }
    return;
  }

  // 3. Encode the variant, persist, serve. Kick off background warming of the
  //    rest of the variant set so later srcset widths hit disk.
  const stopTimer = imageMetrics.timer('variant_generate_ms');
  const out = await encodeVariant(source.buffer, opts);
  stopTimer();
  try {
    await fsp.mkdir(path.dirname(vPath), { recursive: true });
    await atomicWrite(vPath, out);
  } catch {
    // Cache write failure is non-fatal; still serve the bytes.
  }
  imageMetrics.recordCounter('misses');
  imageMetrics.recordCounter('variantsServed');
  enqueueWarm(mediaKey);

  return streamFile(res, vPath, {
    cacheStatus: 'MISS',
    contentType: MIME[opts.fm] || 'image/jpeg',
    varyAccept: opts.varyAccept,
    ifNoneMatch: req.headers['if-none-match'],
    range: req.headers.range,
  });
}

/**
 * Serve the full-resolution original (no width param) with streaming, Range,
 * and 304 support. Falls back to the persisted store before touching upstream.
 */
async function serveOriginal(mediaKey, req, res, { fetchOriginal }) {
  imageMetrics.recordCounter('requests');
  const entry = await getOriginalEntry(mediaKey);
  if (entry) {
    imageMetrics.recordCounter('hits');
    return streamFile(res, entry.file, {
      cacheStatus: 'HIT',
      contentType: entry.contentType,
      ifNoneMatch: req.headers['if-none-match'],
      range: req.headers.range,
    });
  }

  const fetched = await fetchOriginal();
  if (!fetched || fetched.status !== 'ok' || !fetched.buffer) {
    imageMetrics.recordCounter(fetched && fetched.status === 'rate-limited' ? 'rateLimited' : fetched && fetched.status === 'no-url' ? 'notFound' : 'misses');
    if (!res.headersSent) {
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 204;
      res.end();
    }
    return;
  }

  const file = MEDIA_PIPELINE_ENABLED
    ? await persistOriginal(mediaKey, fetched.buffer, fetched.contentType, fetched.etag)
    : null;
  if (file) {
    imageMetrics.recordCounter('misses');
    return streamFile(res, file, {
      cacheStatus: 'MISS',
      contentType: fetched.contentType || 'image/jpeg',
      ifNoneMatch: req.headers['if-none-match'],
      range: req.headers.range,
    });
  }

  // Pipeline disabled — serve the fetched bytes directly (legacy behavior).
  imageMetrics.recordCounter('misses');
  res.setHeader('Content-Type', fetched.contentType || 'image/jpeg');
  res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Cache', 'MISS');
  if (fetched.etag) res.setHeader('ETag', fetched.etag);
  if (req.headers['if-none-match'] && fetched.etag && req.headers['if-none-match'].split(/\s*,\s*/).includes(fetched.etag)) {
    res.statusCode = 304;
    return res.end();
  }
  return res.end(fetched.buffer);
}

module.exports = {
  parseVariant,
  serveVariant,
  serveOriginal,
  persistOriginal,
  processVariant,
  encodeVariant,
  enqueueWarm,
  ensureOriginal,
  generateVariantSet,
  invalidateVariants,
  getPersistedOriginal,
  getOriginalEntry,
  warmStats,
  VARIANT_WIDTHS,
  VARIANT_FORMATS,
  QUALITY_BY_FORMAT,
};
