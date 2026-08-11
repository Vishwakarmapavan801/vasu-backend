/**
 * Media Warmup Job
 *
 * Background warming of the media pipeline. At boot and then on an idle
 * interval, discovers real media keys from the featured + search-result
 * listings (the hottest paths) and ensures their originals are persisted and
 * their responsive variant sets pre-generated, so the first user visit hits
 * the disk cache instead of the upstream CDN.
 *
 * Rate-limited upstream responses fast-fail (204) via the existing CDN
 * cooldown logic, so a 429'd CDN never turns this into a retry storm.
 */

const imageProcessor = require('../services/imageProcessor');
const mlsService = require('../services/mlsService');
const propertyService = require('../services/propertyService');
const imageMetrics = require('../utils/imageMetrics');
const { MEDIA_WARM_INTERVAL_MS, MEDIA_WARM_MAX_KEYS } = require('../config');

const WARM_FEATURED_LIMIT = 8;
const WARM_SEARCH_LIMIT = 12;
const WARM_BATCH_CONCURRENCY = 3;

let timer = null;
let running = false;

function extractMediaKeys(properties) {
  const keys = new Set();
  for (const p of properties || []) {
    for (const m of (p.Media || [])) {
      if (m && m.MediaKey) keys.add(m.MediaKey);
    }
  }
  return Array.from(keys);
}

async function getCandidateKeys() {
  const keys = new Set();
  try {
    const featured = await propertyService.getFeaturedProperties({ top: WARM_FEATURED_LIMIT });
    for (const k of extractMediaKeys(featured && featured.data)) keys.add(k);
  } catch {
    // Featured fetch is non-fatal; the next interval retries.
  }
  try {
    const search = await propertyService.getProperties({ top: WARM_SEARCH_LIMIT });
    for (const k of extractMediaKeys(search && search.data)) keys.add(k);
  } catch {
    // Search fetch is non-fatal; the next interval retries.
  }
  return Array.from(keys).slice(0, MEDIA_WARM_MAX_KEYS || 600);
}

async function runOnce() {
  if (running) return { skipped: true };
  running = true;
  try {
    const keys = await getCandidateKeys();
    if (keys.length === 0) return { warmed: 0 };

    let index = 0;
    const worker = async () => {
      while (index < keys.length) {
        const key = keys[index++];
        try {
          // ensureOriginal persists the original (content-addressed) and
          // enqueues background variant pre-generation; 'rate-limited' and
          // 'no-url' results are cheap fast-fails.
          await imageProcessor.ensureOriginal(key, () => mlsService.fetchMediaBuffer(key, null));
        } catch {
          // Upstream/network hiccup — the next interval retries.
        }
      }
    };
    await Promise.all(Array.from({ length: WARM_BATCH_CONCURRENCY }, worker));
    imageMetrics.recordCounter('warmupRuns');
    return { warmed: keys.length };
  } finally {
    running = false;
  }
}

function startMediaWarmup() {
  if (timer) return;
  runOnce();
  timer = setInterval(runOnce, MEDIA_WARM_INTERVAL_MS || 5 * 60 * 1000);
  timer.unref();
}

function stopMediaWarmup() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startMediaWarmup, stopMediaWarmup, runOnce, getCandidateKeys };
