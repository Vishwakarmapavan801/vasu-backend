const propertyService = require('../services/propertyService');
const mlsService = require('../services/mlsService');
const { parseQueryParams } = require('../utils/parseQueryParams');

async function getListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getProperties(params);
    // Service already returns correct hasMore for local-filtered responses.
    // Do NOT overwrite with MLS nextLink - it's invalid after local filtering.
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getFeaturedListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getFeaturedProperties(params);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getListingById(req, res, next) {
  try {
    // Support both /properties/:id (via req.params.id) and /properties/listing/:listingId
    const listingId = req.params.listingId || req.params.id;
    const result = await propertyService.getPropertyById(listingId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `Listing with ID '${listingId}' not found`,
      });
    }

    return res.json({ success: true, data: result });
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
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getActiveListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getActiveListings(params);
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
    const cityLower = city.toLowerCase().trim();
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
 * Serve a media image via backend proxy.
 *
 * Instead of sending the browser directly to media-demo.mlsgrid.com
 * (which rate-limits aggressively), the backend fetches the image
 * ONCE per TTL period using the signed URL stored in mediaUrlStore,
 * caches the bytes in memory, and serves them to all subsequent
 * browser requests.
 *
 * Response includes Cache-Control headers so browsers and CDNs
 * cache the response for 10 minutes.
 */
async function serveMediaImage(req, res, next) {
  const { mediaKey } = req.params;
  console.log(`[ImageProxy] Request received for mediaKey: ${mediaKey}`);

  try {
    if (!mediaKey) {
      return res.status(400).json({ success: false, error: 'Media key required' });
    }

    const { buffer, contentType } = await mlsService.fetchAndCacheImage(mediaKey);

    res.set('Content-Type', contentType);
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'public, max-age=600, immutable');
    res.set('X-Proxy-Cache', 'MLS-Grid-Image-Proxy');

    console.log(`[ImageProxy] Served ${mediaKey} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return res.end(buffer);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('not found or expired') || msg.includes('not found in MLS')) {
      console.warn(`[ImageProxy] Media not found: ${mediaKey} — ${msg}`);
      return res.status(404).json({ success: false, error: 'Media not found or expired' });
    }
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNABORTED')) {
      console.warn(`[ImageProxy] CDN timeout for ${mediaKey}: ${msg}`);
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=300');
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      console.warn(`[ImageProxy] CDN rate limited for ${mediaKey}: ${msg}`);
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=300');
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    }
    console.error(`[ImageProxy] Failed to fetch image ${mediaKey}:`, msg);
    // Return a transparent SVG pixel so the browser never shows a broken image icon.
    // The error is still logged server-side for debugging.
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=300');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  }
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
    const results = await Promise.allSettled(
      Object.entries(SUPPORTED_CITIES_MAP).map(async ([slug, info]) => {
        const cityName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const data = await propertyService.getPropertiesByCity(cityName, { top: 1 });
        return { ...info, count: data.totalCount || 0 };
      })
    );
    const cities = results.map((r, i) => {
      const slug = Object.keys(SUPPORTED_CITIES_MAP)[i];
      const info = SUPPORTED_CITIES_MAP[slug];
      return r.status === 'fulfilled' ? r.value : { ...info, count: 0 };
    });
    return res.json({ success: true, data: cities });
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
  getOffices,
  getOpenHouses,
  getOpenHouseListings,
  getLookupData,
  getMedia,
  verifyConnection,
  serveMediaImage,
};
