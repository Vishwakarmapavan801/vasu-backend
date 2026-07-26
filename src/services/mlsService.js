/**
 * MLS Grid API Communication Service
 *
 * Core HTTP client for MLS Grid v2 OData API.
 *
 * Performance Optimizations:
 * - In-memory CDN image buffer cache (5 second TTL) prevents duplicate CDN fetches
 * - In-flight request deduplication prevents concurrent duplicate requests
 * - KeepAlive HTTPS agent reuses TCP/TLS connections
 * - Browser-level caching (304/ETag) supported via conditional request forwarding
 * - 6 parallel CDN streams with 50ms inter-request gap for fast batch loading
 */

const axios = require('axios');
const https = require('https');
const { MLS_GRID_BASE_URL, MLS_GRID_ACCESS_TOKEN, MLS_GRID_TIMEOUT, MLS_GRID_MAX_RETRIES } = require('../config');

// ============================================================
// MEDIA URL STORE
// Maps a stable MediaKey to the current signed MediaURL from MLS Grid.
// ============================================================
/** @type {Map<string, { signedUrl: string, expiresAt: number }>} */
const mediaUrlStore = new Map();
const MEDIA_URL_STORE_TTL = 14_400_000; // 4 hours

// ============================================================
// CDN IMAGE BUFFER CACHE
// Stores recently fetched image buffers in memory.
// TTL is 5 seconds to prevent duplicate CDN requests within a single page load.
// ============================================================
const imageBufferCache = new Map();
const IMAGE_CACHE_TTL = 5_000; // 5 seconds

// Periodic cache cleanups
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of imageBufferCache) {
    if (entry.expiresAt <= now) imageBufferCache.delete(key);
  }
  for (const [key, entry] of mediaUrlStore) {
    if (entry.expiresAt <= now) mediaUrlStore.delete(key);
  }
}, 60_000).unref();

// ============================================================
// CONCURRENT CDN REQUEST LIMITER
// 6 concurrent connections with 50ms gap between requests.
// Adaptively reduces concurrency when 429s are detected.
// ============================================================
const CDN_MAX_CONCURRENT = 6;
const CDN_INTER_REQUEST_DELAY = 50;
const CDN_COOLDOWN_MS = 10_000;
const MAX_QUEUE_SIZE = 50;
const QUEUE_TIMEOUT_MS = 15_000;

let cdnActiveDownloads = 0;
const cdnDownloadQueue = [];
let cdnCooldownUntil = 0;
let consecutive429Count = 0;
let lastCdnRequestTime = 0;
let adaptiveConcurrency = CDN_MAX_CONCURRENT;
let adaptiveConcurrencyRestoreAt = 0;

async function acquireCdnSlot() {
  if (cdnCooldownUntil > Date.now()) {
    await new Promise(r => setTimeout(r, cdnCooldownUntil - Date.now()));
  }
  const gap = CDN_INTER_REQUEST_DELAY - (Date.now() - lastCdnRequestTime);
  if (gap > 0) {
    await new Promise(r => setTimeout(r, gap));
  }
  if (cdnActiveDownloads < adaptiveConcurrency) {
    cdnActiveDownloads++;
    return;
  }
  return new Promise(resolve => {
    if (cdnDownloadQueue.length < MAX_QUEUE_SIZE) {
      cdnDownloadQueue.push({ resolve, addedAt: Date.now() });
    } else {
      cdnActiveDownloads++;
      resolve();
    }
  });
}

function releaseCdnSlot() {
  const now = Date.now();
  if (adaptiveConcurrency < CDN_MAX_CONCURRENT && now >= adaptiveConcurrencyRestoreAt) {
    adaptiveConcurrency = Math.min(CDN_MAX_CONCURRENT, adaptiveConcurrency + 1);
    if (adaptiveConcurrency < CDN_MAX_CONCURRENT) {
      adaptiveConcurrencyRestoreAt = now + 30_000;
    }
  }
  while (cdnDownloadQueue.length > 0 && (now - cdnDownloadQueue[0].addedAt) > QUEUE_TIMEOUT_MS) {
    cdnDownloadQueue.shift();
  }
  if (cdnDownloadQueue.length > 0) {
    cdnDownloadQueue.shift().resolve();
  } else {
    cdnActiveDownloads--;
  }
}

function recordCdn429() {
  consecutive429Count++;
  if (consecutive429Count >= 3) {
    cdnCooldownUntil = Date.now() + CDN_COOLDOWN_MS;
    adaptiveConcurrency = Math.max(1, Math.floor(adaptiveConcurrency / 2));
    adaptiveConcurrencyRestoreAt = Date.now() + CDN_COOLDOWN_MS;
    consecutive429Count = 0;
  }
}

function recordCdnSuccess() {
  consecutive429Count = Math.max(0, consecutive429Count - 1);
}

// ============================================================
// MLS GRID API — DIRECT FETCH (no data caching)
// Every request goes to MLS Grid live API for fresh data.
// ============================================================
const inFlightRequests = new Map();

async function fetchWithRetry(url, options, retries = parseInt(MLS_GRID_MAX_RETRIES, 10) || 3) {
  const timeout = parseInt(MLS_GRID_TIMEOUT, 10) || 30000;
  if (inFlightRequests.has(url)) return inFlightRequests.get(url);

  const promise = (async () => {
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
          return response.data;
        } catch (err) {
          if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') throw err;
          if (attempt === retries) throw err;
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 10000)));
        }
      }
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, promise);
  return promise;
}

/**
 * REFRESH SIGNED URL from MLS Grid.
 */
async function refreshSignedUrl(mediaKey) {
  try {
    const url = `${MLS_GRID_BASE_URL}/Property?$expand=Media&$filter=Media/any(m: m/MediaKey%20eq%20'${encodeURIComponent(mediaKey)}')&$top=1`;
    const data = await fetchWithRetry(url);
    if (data.value && data.value.length > 0) {
      const media = (data.value[0].Media || []).find(m => m.MediaKey === mediaKey);
      if (media && (media.MediaURL || media.MediaUrl)) {
        const signedUrl = media.MediaURL || media.MediaUrl;
        mediaUrlStore.set(mediaKey, { signedUrl, expiresAt: Date.now() + MEDIA_URL_STORE_TTL });
        return signedUrl;
      }
    }
  } catch (err) {
    // Fall through to return null
  }
  return null;
}

// ============================================================
// KEEP-ALIVE HTTPS AGENT
// Reuses TCP/TLS connections for CDN requests.
// ============================================================
let keepAliveAgent = null;
function getKeepAliveAgent() {
  if (!keepAliveAgent) {
    keepAliveAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 30000,
      freeSocketTimeout: 10000,
      scheduling: 'lifo',
    });
  }
  return keepAliveAgent;
}

const imageAxios = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  decompress: true,
  headers: {
    'Accept': 'image/webp,image/avif,image/*,*/*;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  },
});

imageAxios.interceptors.request.use(config => {
  if (!config.agent) config.agent = getKeepAliveAgent();
  return config;
});

// ============================================================
// IMAGE PROXY — Serve image from CDN with in-memory buffer cache
// ============================================================

/**
 * Serve an image. Checks 5-second in-memory buffer cache first,
 * then fetches from CDN if not cached.
 */
async function streamMediaImage(mediaKey, req, res) {
  // 1. Get signed URL
  let signedUrl = null;
  const entry = mediaUrlStore.get(mediaKey);
  if (entry && entry.expiresAt > Date.now()) {
    signedUrl = entry.signedUrl;
  } else {
    signedUrl = await refreshSignedUrl(mediaKey);
  }

  if (!signedUrl) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache');
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    }
    return;
  }

  // 2. Check in-memory image buffer cache
  const cacheKey = `${mediaKey}:${signedUrl}`;
  const cachedImage = imageBufferCache.get(cacheKey);
  if (cachedImage && cachedImage.expiresAt > Date.now()) {
    const { buffer, contentType, etag, lastModified } = cachedImage;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=600, immutable');
    res.setHeader('Last-Modified', lastModified);
    if (etag) res.setHeader('ETag', etag);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'HIT');
    res.end(buffer);
    return;
  }

  // 3. Acquire CDN slot and fetch from CDN
  await acquireCdnSlot();
  try {
    const result = await doFetchFromCdn(mediaKey, signedUrl, req);
    if (!result) {
      // 304 — browser already has the image
      if (!res.headersSent) {
        res.status(304).end();
      }
      return;
    }

    const { buffer, contentType, etag, lastModified } = result;

    // Store in cache for subsequent requests (max 200 entries to prevent memory leak)
    if (imageBufferCache.size >= 200) {
      const oldestKey = imageBufferCache.keys().next().value;
      if (oldestKey) imageBufferCache.delete(oldestKey);
    }
    imageBufferCache.set(cacheKey, {
      buffer, contentType, etag, lastModified,
      expiresAt: Date.now() + IMAGE_CACHE_TTL,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=600, immutable');
    res.setHeader('Last-Modified', lastModified);
    if (etag) res.setHeader('ETag', etag);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'MISS');
    res.end(buffer);
  } catch (err) {
    if (err.message && (err.message.includes('429') || err.message.includes('503'))) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'no-cache');
        res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
      }
      return;
    }
    throw err;
  } finally {
    releaseCdnSlot();
  }
}

/**
 * Fetch an image from CDN and accumulate it into a buffer with retry logic.
 */
async function doFetchFromCdn(mediaKey, signedUrl, req) {
  let currentUrl = signedUrl;
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAYS = [1000, 2000, 4000];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let cdnRes;
    try {
      lastCdnRequestTime = Date.now();
      const cdnHeaders = {};
      if (req.headers['if-none-match']) cdnHeaders['If-None-Match'] = req.headers['if-none-match'];
      if (req.headers['if-modified-since']) cdnHeaders['If-Modified-Since'] = req.headers['if-modified-since'];

      cdnRes = await imageAxios.get(currentUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: cdnHeaders,
        validateStatus: status => status < 400 || status === 403 || status === 304,
      });
    } catch (err) {
      const status = err.response?.status;
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];

      if ((status === 429 || status === 503) && attempt < MAX_ATTEMPTS) {
        if (status === 429) recordCdn429();
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (status === 403 && attempt < MAX_ATTEMPTS) {
        currentUrl = await refreshSignedUrl(mediaKey);
        continue;
      }
      if ((err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (status === 429) throw new Error(`CDN 429 retries exhausted for ${mediaKey}`);
      if (status === 503) throw new Error(`CDN 503 retries exhausted for ${mediaKey}`);
      throw err;
    }

    if (cdnRes.status === 403) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`CDN 403 exhausted for ${mediaKey}`);
      currentUrl = await refreshSignedUrl(mediaKey);
      continue;
    }

    if (cdnRes.status === 304) {
      recordCdnSuccess();
      return null; // Browser has the image
    }

    recordCdnSuccess();
    return {
      buffer: Buffer.from(cdnRes.data),
      contentType: cdnRes.headers['content-type'] || 'image/jpeg',
      lastModified: cdnRes.headers['last-modified'] || new Date().toUTCString(),
      etag: cdnRes.headers['etag'] || '',
    };
  }
  throw new Error(`CDN fetch exhausted for ${mediaKey}`);
}

/**
 * Get the signed CDN URL for a MediaKey.
 */
function getSignedMediaUrl(mediaKey) {
  const entry = mediaUrlStore.get(mediaKey);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.signedUrl;
}

// ============================================================
// PROPERTY NORMALIZATION
// ============================================================

/**
 * Normalize a single MLS Grid property object.
 * Converts direct CDN URLs to proxy paths (/api/image/:mediaKey).
 * Limits media to reduce signed URL generation on list views.
 */
function normalizeProperty(item, options = {}) {
  if (!item) return null;

  // maxMedia = 0 means unlimited (used for detail pages).
  // Use !== undefined check instead of || to avoid the falsy-0 bug.
  const rawMax = parseInt(options.maxMedia, 10);
  const maxMedia = Math.min(50, Math.max(0, rawMax !== undefined && !isNaN(rawMax) ? rawMax : 10));

  let media = (item.Media || [])
    .map(m => {
      const mediaKey = m.MediaKey;
      const signedUrl = m.MediaURL || m.MediaUrl || '';
      if (mediaKey && signedUrl) {
        mediaUrlStore.set(mediaKey, {
          signedUrl,
          expiresAt: Date.now() + MEDIA_URL_STORE_TTL,
        });
      }
      const transformedUrl = (mediaKey && signedUrl) ? `/api/image/${mediaKey}` : null;

      return {
        MediaKey: m.MediaKey,
        MediaURL: transformedUrl,
        MediaCategory: m.MediaCategory || '',
        Order: m.Order || m.Ordering || 0,
        PreferredPhotoYN: m.PreferredPhotoYN,
      };
    })
    .filter(m => {
      if (!m.MediaURL) return false;
      if (m.MediaURL.startsWith('/api/image/')) return true;
      try {
        const parsed = new URL(m.MediaURL);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });

  media.sort((a, b) => {
    if (a.PreferredPhotoYN && !b.PreferredPhotoYN) return -1;
    if (!a.PreferredPhotoYN && b.PreferredPhotoYN) return 1;
    return (a.Order || 0) - (b.Order || 0);
  });

  if (maxMedia > 0 && media.length > maxMedia) {
    media = media.slice(0, maxMedia);
  }

  const streetNum = item.StreetNumber && item.StreetNumber !== '000' ? item.StreetNumber : '';
  const constructedAddress = item.UnparsedAddress
    || [streetNum, item.StreetName, item.StreetSuffix].filter(Boolean).join(' ')
    || item.City
    || '';

  return {
    // Core Identifiers
    ListingId: item.ListingId,
    ListingKey: item.ListingKey,
    ListingNumber: item.ListingNumber,
    MlsStatus: item.MlsStatus,
    StandardStatus: item.StandardStatus,
    MlgCanView: item.MlgCanView,
    OriginatingSystemName: item.OriginatingSystemName,
    OriginatingSystemKey: item.OriginatingSystemKey,

    // Property Type
    PropertyType: item.PropertyType,
    PropertySubType: item.PropertySubType,
    PropertyTypeLabel: item.PropertyTypeLabel,
    PropertyClass: item.PropertyClass,
    OwnershipType: item.OwnershipType,

    // Pricing
    ListPrice: item.ListPrice,
    OriginalListPrice: item.OriginalListPrice,
    ClosePrice: item.ClosePrice,
    LeaseAmount: item.LeaseAmount,

    // Bed/Bath
    BedroomsTotal: item.BedroomsTotal,
    BathroomsTotalInteger: item.BathroomsTotalInteger,
    BathroomsFull: item.BathroomsFull,
    BathroomsHalf: item.BathroomsHalf,
    BathroomsPartial: item.BathroomsPartial,
    BathroomsTotal: item.BathroomsTotal,

    // Square Footage & Lot
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

    // Construction & Year
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

    // Parking & Garage
    GarageSpaces: item.GarageSpaces,
    GarageYN: item.GarageYN,
    GarageLevel: item.GarageLevel,
    ParkingFeatures: item.ParkingFeatures,
    ParkingTotal: item.ParkingTotal,
    OpenParkingSpaces: item.OpenParkingSpaces,

    // Utilities
    Cooling: item.Cooling,
    Heating: item.Heating,
    Utilities: item.Utilities,
    WaterSource: item.WaterSource,
    Sewer: item.Sewer,
    Electric: item.Electric,
    Gas: item.Gas,

    // Amenities & Features
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

    // HOA & Financial
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

    // Location
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

    // Schools
    ElementarySchool: item.ElementarySchool,
    ElementarySchoolDistrict: item.ElementarySchoolDistrict,
    MiddleOrJuniorSchool: item.MiddleOrJuniorSchool,
    MiddleOrJuniorSchoolDistrict: item.MiddleOrJuniorSchoolDistrict,
    HighSchool: item.HighSchool,
    HighSchoolDistrict: item.HighSchoolDistrict,

    // Remarks
    PublicRemarks: item.PublicRemarks,
    PrivateRemarks: item.PrivateRemarks,
    ShowingInstructions: item.ShowingInstructions,

    // Virtual Tours & Media
    Media: media,
    PhotosCount: item.PhotosCount,
    VideosCount: item.VideosCount,
    DocumentsCount: item.DocumentsCount,
    VirtualTourURL: item.VirtualTourURL,
    VirtualTourURLBranded: item.VirtualTourURLBranded,
    VirtualTourURLUnbranded: item.VirtualTourURLUnbranded,

    // Dates & Timing
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

    // Listing Agent
    ListAgentName: item.ListAgentName,
    ListAgentMlsId: item.ListAgentMlsId,
    ListAgentEmail: item.ListAgentEmail,
    ListAgentPreferredPhone: item.ListAgentPreferredPhone,
    ListAgentOfficePhone: item.ListAgentOfficePhone,
    ListAgentURL: item.ListAgentURL,

    // Co-Listing Agent
    CoListAgentName: item.CoListAgentName,
    CoListAgentMlsId: item.CoListAgentMlsId,
    CoListAgentEmail: item.CoListAgentEmail,
    CoListAgentPreferredPhone: item.CoListAgentPreferredPhone,

    // Buyer Agent
    BuyerAgentName: item.BuyerAgentName,
    BuyerAgentMlsId: item.BuyerAgentMlsId,
    BuyerAgentEmail: item.BuyerAgentEmail,
    BuyerAgentPreferredPhone: item.BuyerAgentPreferredPhone,

    // Listing Office
    ListOfficeName: item.ListOfficeName,
    ListOfficeMlsId: item.ListOfficeMlsId,
    ListOfficePhone: item.ListOfficePhone,
    ListOfficeEmail: item.ListOfficeEmail,
    ListOfficeURL: item.ListOfficeURL,

    // Buyer Office
    BuyerOfficeName: item.BuyerOfficeName,
    BuyerOfficeMlsId: item.BuyerOfficeMlsId,
    BuyerOfficePhone: item.BuyerOfficePhone,
    BuyerOfficeEmail: item.BuyerOfficeEmail,

    // Co-Listing Office
    CoListOfficeName: item.CoListOfficeName,
    CoListOfficeMlsId: item.CoListOfficeMlsId,

    // Syndication
    InternetAddressDisplayYN: item.InternetAddressDisplayYN,
    InternetEntireListingDisplayYN: item.InternetEntireListingDisplayYN,

    // Status Flags
    StatusChangeTimestamp: item.StatusChangeTimestamp,
    WithdrawnDate: item.WithdrawnDate,
    StatusContractualSearchDate: item.StatusContractualSearchDate,

    // Miscellaneous
    PostalCodePlus4: item.PostalCodePlus4,
    Permission: item.Permission,
    AvailabilityDate: item.AvailabilityDate,
    SyndicateTo: item.SyndicateTo,
  };
}

function normalizeResponse(data, options = {}) {
  return {
    success: true,
    data: (data.value || []).map(item => normalizeProperty(item, options)),
    totalCount: data['@odata.count'] || data.value?.length || 0,
    nextLink: data['@odata.nextLink'] || null,
  };
}

function invalidateCache(urlPattern) {
  return 0;
}

function getCacheStats() {
  return { size: 0, hits: 0, misses: 0 };
}

module.exports = {
  fetchWithRetry,
  normalizeProperty,
  normalizeResponse,
  invalidateCache,
  getCacheStats,
  getSignedMediaUrl,
  streamMediaImage,
  imageByteCache: new Map(),
  mediaUrlStore,
};
