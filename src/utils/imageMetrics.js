/**
 * Image Pipeline Metrics
 *
 * Zero-dependency counters + rolling timers for the media pipeline:
 * cache hits/misses, upstream CDN latency, variant generation time, and
 * request counts. Exposed via GET /api/image/metrics for ops visibility.
 */

const counters = {
  requests: 0,
  hits: 0,
  misses: 0,
  upstreamFetches: 0,
  upstreamErrors: 0,
  rateLimited: 0,
  variantsServed: 0,
  variantsGenerated: 0,
  warmed: 0,
  notFound: 0,
};

/** @type {Map<string, { count: number, sum: number, min: number, max: number }>} */
const samples = new Map();

function recordCounter(name, delta = 1) {
  counters[name] = (counters[name] || 0) + delta;
}

function recordSample(name, ms) {
  const s = samples.get(name) || { count: 0, sum: 0, min: Infinity, max: 0 };
  s.count++;
  s.sum += ms;
  if (ms < s.min) s.min = ms;
  if (ms > s.max) s.max = ms;
  samples.set(name, s);
}

/** Start a named timer; call the returned fn to record its duration in ms. */
function timer(name) {
  const start = Date.now();
  return () => recordSample(name, Date.now() - start);
}

function snapshot() {
  const timings = {};
  for (const [name, s] of samples) {
    timings[name] = {
      count: s.count,
      avg_ms: s.count ? +(s.sum / s.count).toFixed(2) : 0,
      min_ms: s.count ? s.min : 0,
      max_ms: s.count ? s.max : 0,
    };
  }
  return { counters: { ...counters }, timings };
}

function reset() {
  for (const key of Object.keys(counters)) counters[key] = 0;
  samples.clear();
}

module.exports = { recordCounter, recordSample, timer, snapshot, reset };
