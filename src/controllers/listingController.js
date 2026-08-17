const propertyService = require('../services/propertyService');
const mlsService = require('../services/mlsService');
const imageProcessor = require('../services/imageProcessor');
const complianceService = require('../services/compliance/complianceService');
const { parseQueryParams } = require('../utils/parseQueryParams');

async function getListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getProperties(params);
    if (result.data) {
      result.data = complianceService.buildCompliantResponse(result.data, req.user?.id);
    }
    result._disclaimer = complianceService.getDisclaimer();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getFeaturedListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getFeaturedProperties(params);
    if (result.data) {
      result.data = complianceService.buildCompliantResponse(result.data, req.user?.id);
    }
    result._disclaimer = complianceService.getDisclaimer();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getListingById(req, res, next) {
  try {
    // Support both /properties/:id (via req.params.id) and /properties/listing/:listingId
    const listingId = req.params.listingId || req.params.id;
    // Use getAllMedia variant for detail pages so MLS provides all images
    const result = await propertyService.getPropertyByIdWithAllMedia(listingId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `Listing with ID '${listingId}' not found`,
      });
    }

    const compliant = complianceService.buildCompliantResponse([result], req.user?.id);
    return res.json({ success: true, data: compliant[0], _disclaimer: complianceService.getDisclaimer() });
  } catch (err) {
    next(err);
  }
}

async function getListingByKey(req, res, next) {
  try {
    const { listingKey } = req.params;
    const result = await propertyService.getPropertyByKey(listingKey);

    if (!result.data) {
      return res.status(404).json({
        success: false,
        error: `Listing with key '${listingKey}' not found`,
      });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getListingsByOffice(req, res, next) {
  try {
    const { officeId } = req.params;
    const params = parseQueryParams(req);
    const result = await propertyService.getPropertiesByOffice(officeId, params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getListingsByAgent(req, res, next) {
  try {
    const { memberId } = req.params;
    const params = parseQueryParams(req);
    const result = await propertyService.getPropertiesByAgent(memberId, params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getListingsByStatus(req, res, next) {
  try {
    const { status } = req.params;
    const params = parseQueryParams(req);
    const result = await propertyService.getPropertiesByStatus(status, params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getListingsByType(req, res, next) {
  try {
    const { type } = req.params;
    const params = parseQueryParams(req);
    const result = await propertyService.getPropertiesByType(type, params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function searchListings(req, res, next) {
  try {
    const { q } = req.query;
    const params = parseQueryParams(req);
    const result = await propertyService.searchProperties(q, params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getSoldListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getSoldProperties(params);
    if (result.data) {
      result.data = complianceService.buildCompliantResponse(result.data, req.user?.id);
    }
    result._disclaimer = complianceService.getDisclaimer();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getActiveListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getActiveListings(params);
    if (result.data) {
      result.data = complianceService.buildCompliantResponse(result.data, req.user?.id);
    }
    result._disclaimer = complianceService.getDisclaimer();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMembers(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getMembers(params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMemberByMlsId(req, res, next) {
  try {
    const result = await propertyService.getMemberByMlsId(req.params.memberMlsId);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getOffices(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getOffices(params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getOpenHouses(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getOpenHouses(params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getOpenHouseListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getOpenHouseProperties(params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getLookupData(req, res, next) {
  try {
    const result = await propertyService.getLookupData();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMedia(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getMedia(params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function verifyConnection(req, res, next) {
  try {
    const result = await propertyService.verifyConnection();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Get listings for a specific city.
 * Uses optimized broader fetch + local city filtering.
 */
async function getCityListings(req, res, next) {
  try {
    const { city } = req.params;
    if (!city) {
      return res.status(400).json({ success: false, error: 'City parameter is required' });
    }

    // Validate city name
    const supportedCities = ['charlotte', 'waxhaw', 'concord', 'gastonia', 'rock hill', 'fort mill', 'tega cay'];
    const cityLower = city.toLowerCase().trim().replace(/-/g, ' ');
    const isValid = supportedCities.some(c => c === cityLower);
    if (!isValid) {
      return res.status(404).json({
        success: false,
        error: `City '${city}' is not supported. Supported cities: ${supportedCities.join(', ')}`,
      });
    }

    const params = parseQueryParams(req);
    // Map city param names: "rock-hill" → "Rock Hill"
    const cityName = cityLower.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const result = await propertyService.getPropertiesByCity(cityName, params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Serve a media image via backend streaming proxy.
 *
 * Streams image data from MLS CDN directly to the browser response
 * without buffering the entire image in memory. Implements:
 *  - Memory cache (instant serve)
 *  - Disk cache (survives server restart)
 *  - Automatic MediaURL refresh on 403
 *  - Graceful client disconnect handling
 *  - KeepAlive connection reuse
 *  - Concurrency limiting (max 3 simultaneous CDN streams)
 */
async function serveMediaImage(req, res, next) {
  const { mediaKey } = req.params;
  const startTime = Date.now();

  try {
    if (!mediaKey) {
      return res.status(400).json({ success: false, error: 'Media key required' });
    }

    const opts = imageProcessor.parseVariant(req.query, req);
    if (opts.isVariant) {
      // Responsive variant (srcset sizes, thumbnails, LQIP). Ignore the
      // browser's conditional headers when producing the source bytes — the
      // variant itself is disk-cached with its own immutable ETag.
      await imageProcessor.serveVariant(mediaKey, opts, req, res, {
        fetchOriginal: () => mlsService.fetchMediaBuffer(mediaKey, null),
      });
    } else {
      // Full-resolution original — streamed from the persistent store with
      // Range (206) + conditional (304) support.
      await imageProcessor.serveOriginal(mediaKey, req, res, {
        fetchOriginal: () => mlsService.fetchMediaBuffer(mediaKey, null),
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ImageProxy] Served ${mediaKey} in ${elapsed}ms (cache=${res.getHeader('X-Cache') || '-'})`);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const msg = err.message || '';
    const statusCode = err.response?.status || 0;

    console.error(`[ImageProxy] ERROR ${mediaKey} (${elapsed}ms): ${msg}`);

    if (res.headersSent) {
      res.end();
      return;
    }

    // IMPORTANT: never respond 200 with a placeholder and cache it.
    // A cached 1x1/blank image makes the browser treat the failure as success,
    // so the frontend's fallback chain (raw CDN MediaURL) never runs and the
    // card stays a gray block for the cache lifetime. Return a real error with
    // no-store so the browser fires onerror and the listing falls back to the
    // direct MLS CDN image.
    if (msg.includes('not found in MLS') || msg.includes('Media key not found')) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).end();
    }
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNABORTED')) {
      res.set('Cache-Control', 'no-store');
      return res.status(504).end();
    }
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('503')) {
      res.set('Cache-Control', 'no-store');
      return res.status(503).end();
    }

    res.set('Cache-Control', 'no-store');
    res.status(502).end();
  }
}

async function getImageMetrics(req, res) {
  const metrics = require('../utils/imageMetrics');
  const warm = imageProcessor.warmStats();
  return res.json({
    success: true,
    warm,
    ...metrics.snapshot(),
  });
}

const SUPPORTED_CITIES_MAP = {
  charlotte: { name: 'Charlotte', state: 'NC', path: '/nc/charlotte' },
  waxhaw: { name: 'Waxhaw', state: 'NC', path: '/nc/waxhaw' },
  concord: { name: 'Concord', state: 'NC', path: '/nc/concord' },
  gastonia: { name: 'Gastonia', state: 'NC', path: '/nc/gastonia' },
  'rock hill': { name: 'Rock Hill', state: 'SC', path: '/sc/rock-hill' },
  'fort mill': { name: 'Fort Mill', state: 'SC', path: '/sc/fort-mill' },
  'tega cay': { name: 'Tega Cay', state: 'SC', path: '/sc/tega-cay' },
};

async function getCities(req, res, next) {
  try {
    const cityNames = Object.values(SUPPORTED_CITIES_MAP).map(c => c.name);
    const aggregated = await propertyService.getCitiesAggregated(cityNames);

    const cities = Object.entries(SUPPORTED_CITIES_MAP).map(([slug, info]) => {
      const key = info.name.toLowerCase();
      const data = aggregated[key] || { count: 0, image: '' };
      return { ...info, count: data.count, image: data.image };
    });
    return res.json({ success: true, data: cities });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Open Houses for a specific property by ListingKey.
 * Queries MLS OpenHouse resource filtered by the property's ListingKey.
 * Returns hasOpenHouse, upcoming dates, times, and status.
 */
async function getPropertyOpenHouse(req, res, next) {
  try {
    const { listingKey } = req.params;
    if (!listingKey) {
      return res.status(400).json({ success: false, error: 'ListingKey parameter required' });
    }
    const result = await propertyService.getOpenHousesByProperty(listingKey);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Get comparable properties for a listing.
 * Fetches real MLS properties in the same ZIP/city with similar characteristics.
 */
async function getComparableProperties(req, res, next) {
  try {
    const { listingKey } = req.params;
    if (!listingKey) {
      return res.status(400).json({ success: false, error: 'ListingKey parameter required' });
    }
    const result = await propertyService.getComparableProperties(listingKey);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getListings,
  getFeaturedListings,
  getListingById,
  getListingByKey,
  getListingsByOffice,
  getListingsByAgent,
  getListingsByStatus,
  getListingsByType,
  getCityListings,
  getCities,
  searchListings,
  getSoldListings,
  getActiveListings,
  getMembers,
  getMemberByMlsId,
  getOffices,
  getOpenHouses,
  getOpenHouseListings,
  getPropertyOpenHouse,
  getComparableProperties,
  getLookupData,
  getMedia,
  verifyConnection,
  serveMediaImage,
  getImageMetrics,
};
