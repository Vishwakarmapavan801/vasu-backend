/**
 * MLS Grid API Communication Service
 *
 * Core HTTP client for MLS Grid v2 OData API.
 * Features:
 * - Authentication via Bearer token
 * - Automatic retry with exponential backoff
 * - Response caching (TTL-based) to stabilize signed MediaURLs
 * - In-flight request deduplication to prevent concurrent duplicate calls
 * - Response normalization
 */

const axios = require('axios');
const crypto = require('crypto');
const { MLS_GRID_BASE_URL, MLS_GRID_ACCESS_TOKEN, MLS_GRID_TIMEOUT, MLS_GRID_MAX_RETRIES } = require('../config');
const cache = require('../utils/cache');

/**
 * TTL configuration for different query types.
 *
 * CRITICAL: These TTLs directly impact signed MediaURL stability.
 * Longer TTLs = fewer MLS Grid requests = same signed URLs for longer =
 * better browser caching = fewer 429 errors from media-demo.mlsgrid.com.
 *
 * MLS Grid signed URLs (CloudFront) typically last 1-24 hours, so
 * 5-minute backend cache TTL is very safe.
 */
const TTL = {
  LIST: 300_000,       // 5min — property list queries (stabilizes signed MediaURLs)
  DETAIL: 120_000,     // 2min — single property queries
  MEDIA: 600_000,      // 10min — media queries (stable URLs benefit from longer cache)
  STATIC: 600_000,     // 10min — lookup/member/office data (rarely changes)
};

/**
 * IMAGE BYTE CACHE (LRU with stale-while-revalidate)
 *
 * Stores fetched image bytes in memory so the browser NEVER needs to
 * directly contact media-demo.mlsgrid.com. Only ONE request per image
 * per TTL period goes to the CDN — all others serve from this cache.
 *
 * When the CDN returns 429 (rate limited) and a stale entry exists,
 * the stale entry is served to the client while the refresh is queued.
 * This ensures the user ALWAYS sees an image, never a broken placeholder.
 *
 * Key: MediaKey (e.g., "CAR1234567890-photo-1")
 * Value: { buffer: Buffer, contentType: string, expiresAt: number, lastAccessed: number }
 * TTL: 30 minutes (was 10min — reduces CDN requests 3x)
 * Max entries: 500 (was 200)
 * Eviction: LRU based on lastAccessed timestamp
 */

/** @type {Map<string, { buffer: Buffer, contentType: string, expiresAt: number, lastAccessed: number }>} */
const imageByteCache = new Map();

const IMAGE_CACHE_TTL = 1_800_000;     // 30 minutes (was 10min)
const IMAGE_CACHE_STALE_TTL = 7_200_000; // 2 hours stale grace period
const IMAGE_CACHE_MAX = 500;            // was 200

/**
 * MEDIA URL STORE
 *
 * Maps a stable MediaKey to the current signed MediaURL from MLS Grid.
 * Updated whenever properties are normalized (cache refresh).
 * Old entries are cleaned up periodically.
 *
 * Key: MediaKey
 * Value: { signedUrl: string, expiresAt: number }
 * TTL: 30 minutes (was 15min — longer = fewer signed URL refreshes)
 */

/** @type {Map<string, { signedUrl: string, expiresAt: number }>} */
const mediaUrlStore = new Map();

const MEDIA_URL_STORE_TTL = 1_800_000; // 30 minutes (was 15min)

/**
 * CONCURRENT CDN REQUEST LIMITER
 *
 * Limits the number of simultaneous fetches to the MLS Media CDN.
 * When many images are requested at once (e.g., loading a property
 * search page with 24+ cards), this prevents overwhelming the CDN
 * and triggering rate limits.
 *
 * Max concurrent: 3 (any additional requests are queued)
 */
const CDN_MAX_CONCURRENT = 3;
let cdnActiveRequests = 0;
const cdnRequestQueue = [];

/**
 * Acquire a CDN fetch slot. Waits if already at max concurrency.
 * @returns {Promise<void>}
 */
async function acquireCdnSlot() {
  if (cdnActiveRequests < CDN_MAX_CONCURRENT) {
    cdnActiveRequests++;
    return;
  }
  return new Promise(resolve => {
    cdnRequestQueue.push(resolve);
  });
}

/**
 * Release a CDN fetch slot. Dequeues the next waiting request if any.
 */
function releaseCdnSlot() {
  if (cdnRequestQueue.length > 0) {
    const next = cdnRequestQueue.shift();
    next(); // resolves the waiting acquireCdnSlot promise
  } else {
    cdnActiveRequests--;
  }
}

/**
 * LRU eviction for image byte cache.
 * Removes the least recently accessed entry.
 */
function evictLruImageCache() {
  let oldestKey = null;
  let oldestTime = Infinity;
  for (const [key, entry] of imageByteCache) {
    const accessTime = entry.lastAccessed || 0;
    if (accessTime < oldestTime) {
      oldestTime = accessTime;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    imageByteCache.delete(oldestKey);
  }
}

// Periodic cleanup of expired entries in both maps
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of imageByteCache) {
    if (entry.expiresAt + IMAGE_CACHE_STALE_TTL <= now) {
      imageByteCache.delete(key);
    }
  }
  for (const [key, entry] of mediaUrlStore) {
    if (entry.expiresAt <= now) mediaUrlStore.delete(key);
  }
}, 120_000).unref();

/** In-flight request tracker for deduplication */
const inFlightRequests = new Map();

/** Normalized MLS Grid response cache TTL — how long to keep a URL stable */
const MLS_RESPONSE_CACHE_TTL = 300_000; // 5 minutes

/**
 * Fetch data from MLS Grid with:
 *  - Response caching (same URL → same signed URLs → browser can cache images)
 *  - Request deduplication (concurrent identical calls share one MLS Grid request)
 *  - Retry with exponential backoff
 *
 * @param {string} url - Full MLS Grid API URL
 * @param {Object} [options] - Axios options (headers, etc.)
 * @param {number} [retries=MLS_GRID_MAX_RETRIES||3]
 * @returns {Promise<Object>} MLS Grid response data
 */
async function fetchWithRetry(url, options, retries = parseInt(MLS_GRID_MAX_RETRIES, 10) || 3) {
  const timeout = parseInt(MLS_GRID_TIMEOUT, 10) || 30000;

  // Generate a cache key from the URL and options
  const cacheKey = cache.makeKey(url, {
    timeout,
    headers: { Accept: 'application/json' },
  });

  // 1. Check cache first (same URL → same signed URLs → browser image cache)
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // 2. Check if request is already in-flight (deduplication)
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  // 3. Create the actual request
  const promise = executeFetch(url, options, retries, timeout, cacheKey);

  // Track the in-flight promise
  inFlightRequests.set(cacheKey, promise);

  return promise;
}

/**
 * Execute the actual MLS Grid HTTP request with retries and caching.
 *
 * @param {string} url
 * @param {Object} options
 * @param {number} retries
 * @param {number} timeout
 * @param {string} cacheKey
 * @returns {Promise<Object>}
 */
async function executeFetch(url, options, retries, timeout, cacheKey) {
  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(url, {
          ...options,
          timeout,
          headers: {
            ...options?.headers,
            Authorization: `Bearer ${MLS_GRID_ACCESS_TOKEN}`,
            Accept: 'application/json',
          },
        });

        const data = response.data;

        // Cache the response so subsequent requests reuse the same signed MediaURLs
        // This is CRITICAL for avoiding 429 from the media CDN:
        //  - Without cache: every request generates NEW signed URLs → browser cache busted
        //  - With cache: repeated requests get SAME signed URLs → browser cache hits
        const ttl = determineTTL(url);
        cache.set(cacheKey, data, ttl);

        return data;

      } catch (err) {
        // Don't cache error responses
        const isLastAttempt = attempt === retries;
        if (isLastAttempt) {
          throw err;
        }
        // Exponential backoff: 1s, 2s, 4s, ... max 10s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    // Clean up the in-flight tracker
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Determine appropriate cache TTL based on the URL path.
 *
 * @param {string} url
 * @returns {number} TTL in milliseconds
 */
function determineTTL(url) {
  if (!url) return MLS_RESPONSE_CACHE_TTL;
  const path = new URL(url).pathname;

  if (path.includes('/Media') || path.includes('/media')) {
    return TTL.MEDIA;
  }
  if (path.includes('/Member') || path.includes('/member') ||
      path.includes('/Office') || path.includes('/office') ||
      path.includes('/Lookup') || path.includes('/lookup')) {
    return TTL.STATIC;
  }
  if (path.includes('/Property(') || path.includes('/property(') ||
      path.includes("Property'") || path.includes("property'")) {
    // Single property (by key) — shorter TTL
    return TTL.DETAIL;
  }

  return MLS_RESPONSE_CACHE_TTL;
}

/**
 * REFRESH SIGNED URL: Query the MLS Grid Media endpoint to obtain
 * a fresh signed CDN URL for a given MediaKey.
 *
 * Called automatically when fetchAndCacheImage discovers that the
 * signed URL in mediaUrlStore has expired or the server was restarted.
 *
 * @param {string} mediaKey - The MLS Grid MediaKey (e.g. "CAR1234567890-photo-1")
 * @returns {Promise<string>} A valid signed CDN URL
 */
async function refreshSignedUrl(mediaKey) {
  const url = `${MLS_GRID_BASE_URL}/Media?$filter=MediaKey%20eq%20'${encodeURIComponent(mediaKey)}'&$top=1`;
  console.log(`[ImageProxy] Refreshing signed URL for ${mediaKey} from MLS...`);

  const data = await fetchWithRetry(url);
  if (data.value && data.value.length > 0) {
    const mediaItem = data.value[0];
    const signedUrl = mediaItem.MediaURL || mediaItem.MediaUrl || '';
    if (signedUrl) {
      // Store in mediaUrlStore for future use (15min TTL)
      mediaUrlStore.set(mediaKey, {
        signedUrl,
        expiresAt: Date.now() + MEDIA_URL_STORE_TTL,
      });
      console.log(`[ImageProxy] Signed URL refreshed successfully for ${mediaKey}`);
      return signedUrl;
    }
  }
  throw new Error(`Media not found in MLS: ${mediaKey}`);
}

/** In-flight fetch deduplication for image proxy */
const inFlightImageFetches = new Map();

/**
 * IMAGE PROXY: Fetch an image from the CDN using a signed URL.
 *
 * Uses the mediaUrlStore to look up the signed URL for a MediaKey.
 * If the signed URL is not found or expired, automatically refreshes
 * it from the MLS Grid Media endpoint. This makes the proxy resilient
 * to server restarts and cache expiration.
 *
 * Steps:
 *   1. Check in-memory byte cache (fast path) — serve immediately if fresh
 *   2. If stale but within grace period AND rate limited, serve stale
 *   3. If miss or stale, get signed URL from mediaUrlStore
 *   4. If signed URL missing/expired, refresh from MLS Media endpoint
 *   5. Acquire CDN concurrency slot (max 3 simultaneous CDN requests)
 *   6. Fetch image bytes from CDN with retry + exponential backoff for 429
 *   7. Cache bytes in memory (30min TTL, LRU eviction at 500 entries)
 *   8. Release CDN concurrency slot
 *
 * CRITICAL: Includes in-flight request deduplication to prevent
 * multiple simultaneous CDN requests for the same MediaKey.
 * Without this, N concurrent browser <img> requests would fire
 * N simultaneous CDN requests, defeating the proxy entirely.
 *
 * @param {string} mediaKey - The MLS Grid MediaKey
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function fetchAndCacheImage(mediaKey) {
  const now = Date.now();

  // 1. Check in-memory byte cache first (fast path)
  const cached = imageByteCache.get(mediaKey);

  // Update last accessed time for LRU tracking
  if (cached) {
    cached.lastAccessed = now;
  }

  // If the cache is fresh, serve immediately
  if (cached && cached.expiresAt > now) {
    console.log(`[ImageProxy] Cache HIT for ${mediaKey}`);
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  // 2. If stale but within the stale grace period, serve stale
  //    but still trigger a background refresh
  if (cached && cached.staleWarning !== true) {
    // Mark as warned so we don't spam the log
    cached.staleWarning = true;
    console.log(`[ImageProxy] Cache STALE but serving for ${mediaKey} — will refresh in background`);
    // Track the background refresh in inFlightImageFetches so concurrent
    // requests for the same mediaKey reuse this promise instead of
    // creating duplicate CDN requests.
    const refreshPromise = fetchAndRefreshImageBytes(mediaKey, cached.buffer, cached.contentType);
    inFlightImageFetches.set(mediaKey, refreshPromise);
    refreshPromise
      .then(() => inFlightImageFetches.delete(mediaKey))
      .catch(() => inFlightImageFetches.delete(mediaKey));
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  // 3. Deduplicate: if this MediaKey is already being fetched, reuse the promise
  if (inFlightImageFetches.has(mediaKey)) {
    console.log(`[ImageProxy] Deduplicating CDN request for ${mediaKey}`);
    return inFlightImageFetches.get(mediaKey);
  }

  // 4. Create and track the fetch promise
  const fetchPromise = fetchAndRefreshImageBytes(mediaKey, null, null);

  inFlightImageFetches.set(mediaKey, fetchPromise);

  // Clean up from in-flight tracker when done (success or error)
  fetchPromise
    .then(() => inFlightImageFetches.delete(mediaKey))
    .catch(() => inFlightImageFetches.delete(mediaKey));

  return fetchPromise;
}

/**
 * Fetch image bytes from the CDN and cache them.
 *
 * Implements:
 *   - Signed URL resolution (from cache or MLS refresh)
 *   - Concurrent CDN request limiting (max 3 simultaneous)
 *   - Retry with exponential backoff for 429 (Too Many Requests)
 *   - Retry for timeout/network errors
 *   - Image byte caching with LRU eviction
 *
 * @param {string} mediaKey
 * @param {Buffer|null} staleBuffer - Existing stale buffer to use as fallback
 * @param {string|null} staleContentType - Existing stale content type
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function fetchAndRefreshImageBytes(mediaKey, staleBuffer, staleContentType) {
  // Step A: Resolve signed URL — either from store or via MLS refresh
  let signedUrl = null;
  const entry = mediaUrlStore.get(mediaKey);
  if (entry && entry.expiresAt > Date.now()) {
    signedUrl = entry.signedUrl;
    console.log(`[ImageProxy] Signed URL found in cache for ${mediaKey}`);
  } else {
    // Signed URL is expired or not in store (server restart, etc.)
    // Automatically refresh from MLS API
    try {
      signedUrl = await refreshSignedUrl(mediaKey);
    } catch (refreshErr) {
      console.error(`[ImageProxy] Failed to refresh signed URL for ${mediaKey}:`, refreshErr.message);
      // If we have a stale buffer, serve it as a fallback
      if (staleBuffer) {
        console.log(`[ImageProxy] Using stale cached image for ${mediaKey} as fallback`);
        return { buffer: staleBuffer, contentType: staleContentType || 'image/jpeg' };
      }
      throw new Error(`Media key not found or expired: ${mediaKey}`);
    }
  }

  // Step B: If signed URL is still valid AND we have a stale buffer,
  // skip the CDN fetch entirely — the image hasn't changed on the CDN
  // and the stale cache is acceptable. Only re-fetch when the signed URL
  // itself has expired (mediaUrlStore refreshed) or no stale buffer exists.
  if (staleBuffer && entry && entry.expiresAt > Date.now() + 60000) {
    // Signed URL is still valid (more than 1 minute from expiry) and
    // we have a stale cache — no need to hit the CDN
    console.log(`[ImageProxy] Skipping CDN fetch for ${mediaKey} — signed URL still valid, serving stale cache`);
    return { buffer: staleBuffer, contentType: staleContentType || 'image/jpeg' };
  }

  // Step C: Acquire CDN concurrency slot (max 3 simultaneous CDN requests)
  await acquireCdnSlot();
  console.log(`[ImageProxy] Acquired CDN slot for ${mediaKey} (active: ${cdnActiveRequests + cdnRequestQueue.length})`);

  try {
    // Step D: Fetch image bytes from CDN with retry logic
    const { buffer, contentType } = await fetchImageBytesWithRetry(mediaKey, signedUrl);

    // Step D: Cache image bytes in memory (LRU eviction)
    if (imageByteCache.size >= IMAGE_CACHE_MAX) {
      evictLruImageCache();
    }
    imageByteCache.set(mediaKey, {
      buffer,
      contentType,
      expiresAt: Date.now() + IMAGE_CACHE_TTL,
      lastAccessed: Date.now(),
      staleWarning: false,
    });

    console.log(`[ImageProxy] Image downloaded and cached for ${mediaKey} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return { buffer, contentType };
  } catch (err) {
    // If CDN fetch failed but we have stale data, serve stale
    if (staleBuffer) {
      console.warn(`[ImageProxy] CDN fetch failed for ${mediaKey}, serving stale cache — ${err.message}`);
      return { buffer: staleBuffer, contentType: staleContentType || 'image/jpeg' };
    }
    throw err;
  } finally {
    // Step E: Release CDN concurrency slot
    releaseCdnSlot();
    console.log(`[ImageProxy] Released CDN slot for ${mediaKey} (active: ${cdnActiveRequests + cdnRequestQueue.length})`);
  }
}

/**
 * Fetch image bytes from the CDN with retry and exponential backoff.
 *
 * Retry logic:
 *   - HTTP 429 (Too Many Requests): backoff 1s, 2s, 4s, 8s (4 retries)
 *   - Timeout/Network errors: backoff 500ms, 1s, 2s (3 retries)
 *   - Other errors: throw immediately
 *
 * @param {string} mediaKey - For logging
 * @param {string} signedUrl - The signed CDN URL
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function fetchImageBytesWithRetry(mediaKey, signedUrl) {
  const MAX_RETRIES_429 = 4;
  const MAX_RETRIES_NETWORK = 3;

  let lastError = null;

  for (let attempt = 1; attempt <= Math.max(MAX_RETRIES_429, MAX_RETRIES_NETWORK); attempt++) {
    try {
      const response = await axios.get(signedUrl, {
        responseType: 'arraybuffer',
        timeout: 20000, // 20 seconds (was 15s — more lenient for slow CDN)
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';

      return { buffer, contentType };
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const is429 = status === 429 || (err.message && err.message.includes('429'));
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      const isNetworkError = err.code === 'ERR_NETWORK' || err.code === 'ERR_CONNECTION_RESET' || err.code === 'ETIMEDOUT';

      if (is429 && attempt <= MAX_RETRIES_429) {
        // Exponential backoff for 429: 1s, 2s, 4s, 8s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.warn(`[ImageProxy] CDN rate limited (429) for ${mediaKey} — retry ${attempt}/${MAX_RETRIES_429} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if ((isTimeout || isNetworkError) && attempt <= MAX_RETRIES_NETWORK) {
        // Exponential backoff for network errors: 500ms, 1s, 2s
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 2000);
        console.warn(`[ImageProxy] CDN ${isTimeout ? 'timeout' : 'network error'} for ${mediaKey} — retry ${attempt}/${MAX_RETRIES_NETWORK} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // For other errors, throw immediately
      if (is429) {
        throw new Error(`CDN rate limit exceeded after ${MAX_RETRIES_429} retries for ${mediaKey}`);
      }
      throw err;
    }
  }

  // If we exhausted all retries
  throw lastError || new Error(`Failed to fetch image after all retries: ${mediaKey}`);
}

/**
 * Get the signed CDN URL for a MediaKey.
 * Used by the image proxy controller to check validity.
 *
 * @param {string} mediaKey
 * @returns {string|null}
 */
function getSignedMediaUrl(mediaKey) {
  const entry = mediaUrlStore.get(mediaKey);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.signedUrl;
}

/**
 * Normalize a single MLS Grid property object.
 * Only keeps the first few media items and replaces direct CDN URLs
 * with proxy paths to eliminate browser-side CDN 429 errors.
 *
 * @param {Object} item - Raw MLS Grid property object
 * @param {Object} [options]
 * @param {number} [options.maxMedia=10] - Max media items to include (0=all)
 * @returns {Object|null}
 */
function normalizeProperty(item, options = {}) {
  if (!item) return null;

  const maxMedia = Math.min(50, Math.max(0, parseInt(options.maxMedia, 10) || 10));

  let media = (item.Media || [])
    .map(m => {
      // Store the signed URL in the mediaUrlStore for the proxy
      const mediaKey = m.MediaKey;
      const signedUrl = m.MediaURL || m.MediaUrl || '';
      if (mediaKey && signedUrl) {
        mediaUrlStore.set(mediaKey, {
          signedUrl,
          expiresAt: Date.now() + MEDIA_URL_STORE_TTL,
        });
      }
      return {
        MediaKey: m.MediaKey,
        // CRITICAL: Replace direct CDN URL with backend proxy path.
        // The browser will request /api/image/:mediaKey instead of
        // hitting media-demo.mlsgrid.com directly. Our backend fetches
        // the image ONCE per TTL and caches the bytes in memory.
        //
        // IMPORTANT: Only create proxy URL when BOTH mediaKey AND a valid
        // signedUrl exist. If either is missing, set MediaURL to null so
        // the frontend correctly falls through to "No Image Available"
        // instead of requesting /api/image/undefined.
        MediaURL: (mediaKey && signedUrl) ? `/api/image/${mediaKey}` : null,
        MediaCategory: m.MediaCategory || '',
        Order: m.Order || m.Ordering || 0,
        PreferredPhotoYN: m.PreferredPhotoYN,
      };
    })
    // Filter out empty/invalid media URLs to avoid 429 on garbage requests
    .filter(m => {
      if (!m.MediaURL) return false;
      // Proxy URLs start with /api/image/ — always valid
      if (m.MediaURL.startsWith('/api/image/')) return true;
      try {
        const parsed = new URL(m.MediaURL);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });

  // Sort by PreferredPhotoYN (true first), then by Order
  media.sort((a, b) => {
    if (a.PreferredPhotoYN && !b.PreferredPhotoYN) return -1;
    if (!a.PreferredPhotoYN && b.PreferredPhotoYN) return 1;
    return (a.Order || 0) - (b.Order || 0);
  });

  // Limit media to reduce signed URL generation
  if (maxMedia > 0 && media.length > maxMedia) {
    media = media.slice(0, maxMedia);
  }

  // Construct address from components if UnparsedAddress is missing
  const streetNum = item.StreetNumber && item.StreetNumber !== '000' ? item.StreetNumber : '';
  const constructedAddress = item.UnparsedAddress
    || [streetNum, item.StreetName, item.StreetSuffix].filter(Boolean).join(' ')
    || item.City
    || '';

  return {
    // === Core Identifiers ===
    ListingId: item.ListingId,
    ListingKey: item.ListingKey,
    ListingNumber: item.ListingNumber,
    MlsStatus: item.MlsStatus,
    StandardStatus: item.StandardStatus,
    MlgCanView: item.MlgCanView,
    OriginatingSystemName: item.OriginatingSystemName,
    OriginatingSystemKey: item.OriginatingSystemKey,

    // === Property Type ===
    PropertyType: item.PropertyType,
    PropertySubType: item.PropertySubType,
    PropertyTypeLabel: item.PropertyTypeLabel,
    PropertyClass: item.PropertyClass,
    OwnershipType: item.OwnershipType,

    // === Pricing ===
    ListPrice: item.ListPrice,
    OriginalListPrice: item.OriginalListPrice,
    ClosePrice: item.ClosePrice,
    LeaseAmount: item.LeaseAmount,

    // === Bed/Bath ===
    BedroomsTotal: item.BedroomsTotal,
    BathroomsTotalInteger: item.BathroomsTotalInteger,
    BathroomsFull: item.BathroomsFull,
    BathroomsHalf: item.BathroomsHalf,
    BathroomsPartial: item.BathroomsPartial,
    BathroomsTotal: item.BathroomsTotal,

    // === Square Footage & Lot ===
    LivingArea: item.LivingArea,
    LivingAreaUnits: item.LivingAreaUnits,
    AboveGradeFinishedArea: item.AboveGradeFinishedArea,
    AboveGradeFinishedAreaUnits: item.AboveGradeFinishedAreaUnits,
    BelowGradeFinishedArea: item.BelowGradeFinishedArea,
    BelowGradeFinishedAreaUnits: item.BelowGradeFinishedAreaUnits,
    BuildingAreaTotal: item.BuildingAreaTotal,
    LotSizeArea: item.LotSizeArea,
    LotSizeAcres: item.LotSizeAcres,
    LotSizeSquareFeet: item.LotSizeSquareFeet,
    LotSizeDimensions: item.LotSizeDimensions,

    // === Construction & Year ===
    YearBuilt: item.YearBuilt,
    YearBuiltEffective: item.YearBuiltEffective,
    Stories: item.Stories,
    StoriesTotal: item.StoriesTotal,
    Levels: item.Levels,
    ArchitecturalStyle: item.ArchitecturalStyle,
    ConstructionMaterials: item.ConstructionMaterials,
    ConstructionStatus: item.ConstructionStatus,
    Condition: item.Condition,
    NewConstructionYN: item.NewConstructionYN,
    Roof: item.Roof,
    FoundationDetails: item.FoundationDetails,

    // === Parking & Garage ===
    GarageSpaces: item.GarageSpaces,
    GarageYN: item.GarageYN,
    GarageLevel: item.GarageLevel,
    ParkingFeatures: item.ParkingFeatures,
    ParkingTotal: item.ParkingTotal,
    OpenParkingSpaces: item.OpenParkingSpaces,

    // === Utilities ===
    Cooling: item.Cooling,
    Heating: item.Heating,
    Utilities: item.Utilities,
    WaterSource: item.WaterSource,
    Sewer: item.Sewer,
    Electric: item.Electric,
    Gas: item.Gas,

    // === Amenities & Features ===
    Appliances: item.Appliances,
    InteriorFeatures: item.InteriorFeatures,
    ExteriorFeatures: item.ExteriorFeatures,
    Flooring: item.Flooring,
    LaundryFeatures: item.LaundryFeatures,
    WindowFeatures: item.WindowFeatures,
    DoorFeatures: item.DoorFeatures,
    Fencing: item.Fencing,
    FireplaceFeatures: item.FireplaceFeatures,
    FireplaceYN: item.FireplaceYN,
    PoolFeatures: item.PoolFeatures,
    PoolYN: item.PoolYN,
    SpaFeatures: item.SpaFeatures,
    Basement: item.Basement,
    BasementYN: item.BasementYN,
    LotFeatures: item.LotFeatures,
    PatioAndPorchFeatures: item.PatioAndPorchFeatures,
    View: item.View,
    WaterfrontFeatures: item.WaterfrontFeatures,
    WaterfrontYN: item.WaterfrontYN,
    CommunityFeatures: item.CommunityFeatures,
    SecurityFeatures: item.SecurityFeatures,
    GreenEnergyFeatures: item.GreenEnergyFeatures,
    AccessibilityFeatures: item.AccessibilityFeatures,
    AssociationAmenities: item.AssociationAmenities,

    // === HOA & Financial ===
    AssociationYN: item.AssociationYN,
    AssociationFee: item.AssociationFee,
    AssociationFeeFrequency: item.AssociationFeeFrequency,
    AssociationFeeIncludes: item.AssociationFeeIncludes,
    AssociationName: item.AssociationName,
    TaxAnnualAmount: item.TaxAnnualAmount,
    TaxYear: item.TaxYear,
    TaxLegalDescription: item.TaxLegalDescription,
    ParcelNumber: item.ParcelNumber,
    FinancialDataSource: item.FinancialDataSource,

    // === Location ===
    StreetNumber: item.StreetNumber,
    StreetName: item.StreetName,
    StreetSuffix: item.StreetSuffix,
    StreetDirPrefix: item.StreetDirPrefix,
    StreetDirSuffix: item.StreetDirSuffix,
    UnitNumber: item.UnitNumber,
    UnparsedAddress: constructedAddress,
    City: item.City,
    StateOrProvince: item.StateOrProvince,
    PostalCode: item.PostalCode,
    PostalCodePlus4: item.PostalCodePlus4,
    CountyOrParish: item.CountyOrParish,
    SubdivisionName: item.SubdivisionName,
    Directions: item.Directions,
    Latitude: item.Latitude,
    Longitude: item.Longitude,
    PostalCity: item.PostalCity,

    // === Schools ===
    ElementarySchool: item.ElementarySchool,
    ElementarySchoolDistrict: item.ElementarySchoolDistrict,
    MiddleOrJuniorSchool: item.MiddleOrJuniorSchool,
    MiddleOrJuniorSchoolDistrict: item.MiddleOrJuniorSchoolDistrict,
    HighSchool: item.HighSchool,
    HighSchoolDistrict: item.HighSchoolDistrict,

    // === Remarks ===
    PublicRemarks: item.PublicRemarks,
    PrivateRemarks: item.PrivateRemarks,
    ShowingInstructions: item.ShowingInstructions,

    // === Virtual Tours & Media ===
    Media: media,
    PhotosCount: item.PhotosCount,
    VideosCount: item.VideosCount,
    DocumentsCount: item.DocumentsCount,
    VirtualTourURL: item.VirtualTourURL,
    VirtualTourURLBranded: item.VirtualTourURLBranded,
    VirtualTourURLUnbranded: item.VirtualTourURLUnbranded,

    // === Dates & Timing ===
    ListingContractDate: item.ListingContractDate,
    OnMarketDate: item.OnMarketDate,
    OffMarketDate: item.OffMarketDate,
    CloseDate: item.CloseDate,
    OriginalEntryTimestamp: item.OriginalEntryTimestamp,
    ModificationTimestamp: item.ModificationTimestamp,
    MajorChangeTimestamp: item.MajorChangeTimestamp,
    PriceChangeTimestamp: item.PriceChangeTimestamp,
    PhotosChangeTimestamp: item.PhotosChangeTimestamp,
    DaysOnMarket: item.DaysOnMarket,
    PurchaseContractDate: item.PurchaseContractDate,
    Possession: item.Possession,

    // === Listing Agent ===
    ListAgentName: item.ListAgentName,
    ListAgentMlsId: item.ListAgentMlsId,
    ListAgentEmail: item.ListAgentEmail,
    ListAgentPreferredPhone: item.ListAgentPreferredPhone,
    ListAgentOfficePhone: item.ListAgentOfficePhone,
    ListAgentURL: item.ListAgentURL,

    // === Co-Listing Agent ===
    CoListAgentName: item.CoListAgentName,
    CoListAgentMlsId: item.CoListAgentMlsId,
    CoListAgentEmail: item.CoListAgentEmail,
    CoListAgentPreferredPhone: item.CoListAgentPreferredPhone,

    // === Buyer Agent ===
    BuyerAgentName: item.BuyerAgentName,
    BuyerAgentMlsId: item.BuyerAgentMlsId,
    BuyerAgentEmail: item.BuyerAgentEmail,
    BuyerAgentPreferredPhone: item.BuyerAgentPreferredPhone,

    // === Listing Office ===
    ListOfficeName: item.ListOfficeName,
    ListOfficeMlsId: item.ListOfficeMlsId,
    ListOfficePhone: item.ListOfficePhone,
    ListOfficeEmail: item.ListOfficeEmail,
    ListOfficeURL: item.ListOfficeURL,

    // === Buyer Office ===
    BuyerOfficeName: item.BuyerOfficeName,
    BuyerOfficeMlsId: item.BuyerOfficeMlsId,
    BuyerOfficePhone: item.BuyerOfficePhone,
    BuyerOfficeEmail: item.BuyerOfficeEmail,

    // === Co-Listing Office ===
    CoListOfficeName: item.CoListOfficeName,
    CoListOfficeMlsId: item.CoListOfficeMlsId,

    // === Syndication ===
    InternetAddressDisplayYN: item.InternetAddressDisplayYN,
    InternetEntireListingDisplayYN: item.InternetEntireListingDisplayYN,

    // === Status Flags ===
    StatusChangeTimestamp: item.StatusChangeTimestamp,
    WithdrawnDate: item.WithdrawnDate,
    StatusContractualSearchDate: item.StatusContractualSearchDate,

    // === Miscellaneous ===
    PostalCodePlus4: item.PostalCodePlus4,
    Permission: item.Permission,
    AvailabilityDate: item.AvailabilityDate,
    SyndicateTo: item.SyndicateTo,
  };
}

/**
 * Normalize an MLS Grid list response.
 *
 * @param {Object} data - Raw MLS Grid response
 * @param {Object} [options] - Options passed to normalizeProperty
 * @returns {Object}
 */
function normalizeResponse(data, options = {}) {
  return {
    success: true,
    data: (data.value || []).map(item => normalizeProperty(item, options)),
    totalCount: data['@odata.count'] || data.value?.length || 0,
    nextLink: data['@odata.nextLink'] || null,
  };
}

/**
 * Invalidate cache entries by URL pattern.
 * Useful after administrative changes.
 *
 * @param {string} urlPattern - String to match against cached URLs
 * @returns {number} Number of invalidated entries
 */
function invalidateCache(urlPattern) {
  let count = 0;
  // Note: cache internal store is not directly accessible,
  // so we just clear the whole cache for now.
  // A more targeted approach could be added if needed.
  cache.clear();
  return count;
}

/**
 * Get cache statistics.
 * @returns {object}
 */
function getCacheStats() {
  return cache.getStats();
}

module.exports = {
  fetchWithRetry,
  normalizeProperty,
  normalizeResponse,
  invalidateCache,
  getCacheStats,
  // Image proxy exports
  fetchAndCacheImage,
  getSignedMediaUrl,
  // Expose store for debugging
  imageByteCache,
  mediaUrlStore,
};
