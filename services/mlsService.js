/**
 * MLS Grid API Service
 *
 * Handles all communication with the MLS Grid OData API v2.
 * All data flows through this service: Frontend → Backend → MLS Service → MLS API
 *
 * ZIP SEARCH STRATEGY:
 *   The MLS Grid documentation states that PostalCode is a filterable field via $filter.
 *   However, some MLS feeds (like the carolina demo) do NOT support PostalCode in $filter.
 *
 *   We use a dual-strategy approach:
 *   1. PRIMARY: Include PostalCode eq 'ZIP' in the $filter parameter.
 *      If the API accepts it, the MLS itself returns only matching properties.
 *   2. FALLBACK: If the API returns "Invalid filter field 'PostalCode'" (400),
 *      we retry WITHOUT PostalCode in $filter and WITHOUT $search for the ZIP.
 *      Instead, we fetch the maximum batch (200) and post-filter by exact ZIP.
 *
 *   This ensures correct ZIP filtering regardless of which MLS feed is used.
 *
 * Valid PropertyType values for carolina system:
 *   - Residential, Land, CommercialSale, ResidentialLease
 *
 * Uses Axios with Bearer token authentication.
 * Implements detailed request/response logging per the project requirements.
 */

const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

// ========== CONFIGURATION ==========

const BASE_URL = config.mls.baseUrl || 'https://api-demo.mlsgrid.com/v2';
const ACCESS_TOKEN = config.mls.accessToken || '758cf7862bff6f450006e8c74a11c941e381b2b5';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Map of valid PropertyType values for the carolina system
// Frontend uses different naming; map to API-valid values
const PROPERTY_TYPE_MAP = {
  'single-family': 'Residential',
  'singlefamily': 'Residential',
  'residential': 'Residential',
  'condo': 'Residential',
  'townhouse': 'Residential',
  'apartment': 'Residential',
  'multi-family': null, // Not a valid filter value - use $search instead
  'multifamily': null,
  'commercial': 'CommercialSale',
  'commercialsale': 'CommercialSale',
  'land': 'Land',
  'farm': 'Land',
  'luxury': 'Residential',
  'vacation-rental': 'ResidentialLease',
  'residentiallease': 'ResidentialLease',
};

/**
 * Map a frontend PropertyType to the API's valid value
 * Returns null if the type should be handled via $search instead
 */
function mapPropertyType(type) {
  if (!type) return null;
  const key = type.toLowerCase().replace(/[\s_-]/g, '');
  return PROPERTY_TYPE_MAP[key] || type;
}

// ========== AXIOS INSTANCE ==========

const mlsClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'VasuRealty/1.0 (Property Search App; +https://vasurealty.com)',
  },
});

// ========== UTILITY FUNCTIONS ==========

/**
 * Build an OData $filter string from structured filter parameters.
 * Only includes fields that are filterable in the carolina MLS system.
 *
 * Filterable fields: MlgCanView, ModificationTimestamp, OriginatingSystemName,
 *                    StandardStatus, ListingId, PropertyType, ListOfficeMlsId
 *
 * @param {Object} filters - Filter criteria
 * @param {number} [filters.minPrice] - Minimum ListPrice (not filterable, handled in-code)
 * @param {number} [filters.maxPrice] - Maximum ListPrice (not filterable, handled in-code)
 * @param {number} [filters.minBedrooms] - Minimum BedroomsTotal
 * @param {number} [filters.minBathrooms] - Minimum BathroomsTotalInteger
 * @param {string} [filters.propertyType] - PropertyType filter
 * @param {string} [filters.status] - StandardStatus filter
 * @param {boolean} [filters.canView] - MlgCanView filter
 * @param {string} [filters.listOfficeMlsId] - ListOfficeMlsId filter
 * @returns {string} OData $filter string
 */
function buildFilter(filters = {}) {
  const conditions = [];

  // Always filter by the carolina system
  conditions.push("OriginatingSystemName eq 'carolina'");

  // MlgCanView — always filter for viewable listings
  if (filters.canView !== false) {
    conditions.push('MlgCanView eq true');
  }

  // Property type (only if it maps to a valid filter value)
  if (filters.propertyType) {
    const types = filters.propertyType.split(',').map(t => t.trim()).filter(Boolean);
    // Check if each type maps to a valid API value
    const apiTypes = types.map(t => mapPropertyType(t)).filter(Boolean);
    if (apiTypes.length === 1) {
      conditions.push(`PropertyType eq '${apiTypes[0]}'`);
    } else if (apiTypes.length > 1) {
      const typeConditions = apiTypes.map(t => `PropertyType eq '${t}'`);
      conditions.push(`(${typeConditions.join(' or ')})`);
    }
  }

  // Status
  if (filters.status) {
    const statuses = filters.status.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(`StandardStatus eq '${statuses[0]}'`);
    } else if (statuses.length > 1) {
      const statusConditions = statuses.map(s => `StandardStatus eq '${s}'`);
      conditions.push(`(${statusConditions.join(' or ')})`);
    }
  }

  // ListOfficeMlsId
  if (filters.listOfficeMlsId) {
    conditions.push(`ListOfficeMlsId eq '${filters.listOfficeMlsId}'`);
  }

  // PostalCode filter — the PRIMARY mechanism for ZIP filtering.
  // The official MLS Grid RESO API supports filtering by PostalCode via $filter.
  // Some feeds (e.g., carolina demo) may reject this with a 400.
  // The calling function (getMlsGridListings) handles that fallback.
  if (filters.zip && filters.usePostalCodeFilter !== false) {
    const zip = String(filters.zip).trim();
    conditions.push(`PostalCode eq '${zip}'`);
  }

  return conditions.join(' and ');
}

/**
 * Build an OData $search string for free-text search terms.
 *
 * IMPORTANT: ZIP codes are NOT included in $search.
 * - ZIP is handled primarily via $filter (PostalCode eq 'ZIP')
 * - If the API rejects $filter on PostalCode, the caller falls back to
 *   fetching a large batch and post-filtering (see getMlsGridListings).
 * - Including numeric ZIP codes in $search causes unreliable results
 *   because the number can match prices, descriptions, or other fields.
 *
 * @param {Object} filters - Filter criteria
 * @param {string} [filters.searchText] - Free-text search query
 * @param {string} [filters.propertyType] - For types that map to null (multi-family)
 * @returns {string|null} $search query string or null
 */
function buildSearchQuery(filters = {}) {
  const searchParts = [];

  // Free-text search query (from search endpoint or explicit searchText)
  if (filters.searchText) {
    const text = filters.searchText.trim();
    if (text) searchParts.push(text);
  }

  // City search (City is NOT filterable, use $search)
  if (filters.city && !filters.searchText) {
    const city = filters.city.trim();
    searchParts.push(city);
  }

  // For property types that don't have a direct filter value
  if (filters.propertyType) {
    const apiType = mapPropertyType(filters.propertyType);
    if (apiType === null) {
      // Map frontend type names to searchable terms
      const searchTerms = {
        'multi-family': 'multifamily',
        'multifamily': 'multifamily',
        'multi family': 'multifamily',
      };
      const term = searchTerms[filters.propertyType.toLowerCase()];
      if (term) searchParts.push(term);
    }
  }

  if (searchParts.length === 0) return null;
  return searchParts.join(' ');
}

/**
 * Normalize MLS Grid API response to a consistent property format
 */
function normalizeProperty(item) {
  if (!item) return null;

  let primaryPhoto = '';
  let allPhotos = [];
  if (item.Media && Array.isArray(item.Media) && item.Media.length > 0) {
    allPhotos = item.Media
      .filter(m => m.MediaURL)
      .map(m => ({
        url: m.MediaURL,
        alt: m.MediaCaption || 'Property photo',
        isFeatured: m.Order === 1 || m.MediaCategory === 'Photo',
        mediaKey: m.MediaKey,
        mediaType: m.MediaType || 'Photo',
        order: m.Order || 0,
        category: m.MediaCategory || 'Photo',
        largeFilePath: m.LargeFilePath,
        thumbFilePath: m.ThumbFilePath,
      }));

    const featuredPhoto = allPhotos.find(p => p.isFeatured) || allPhotos[0];
    primaryPhoto = featuredPhoto?.url || '';
  }

  return {
    _id: item.ListingKey || item.ListingId,
    ListingId: item.ListingId || '',
    ListingKey: item.ListingKey || '',
    address: item.UnparsedAddress || item.FullStreetAddress || '',
    streetNumber: item.StreetNumber || '',
    streetName: item.StreetName || '',
    streetSuffix: item.StreetSuffix || '',
    city: item.City || '',
    state: item.StateOrProvince || '',
    zip: item.PostalCode || '',
    county: item.CountyOrParish || '',
    neighborhood: item.SubdivisionName || '',
    latitude: item.Latitude,
    longitude: item.Longitude,
    price: item.ListPrice || 0,
    listPrice: item.ListPrice || 0,
    originalPrice: item.OriginalListPrice,
    bedrooms: item.BedroomsTotal || 0,
    bathrooms: item.BathroomsTotalInteger || item.BathroomsFull || 0,
    halfBathrooms: item.BathroomsHalf || 0,
    squareFeet: item.LivingArea || 0,
    lotSize: item.LotSizeAcres || item.LotSizeSquareFeet,
    yearBuilt: item.YearBuilt,
    propertyType: item.PropertyType || '',
    propertySubType: item.PropertySubType || '',
    status: item.StandardStatus || item.ListingStatus || '',
    mlsStatus: item.StandardStatus || '',
    isActive: item.MlgCanView !== false,
    isDeleted: false,
    description: item.PublicRemarks || '',
    title: `${item.BedroomsTotal || '?'} bed, ${item.BathroomsTotalInteger || '?'} bath - ${item.City || ''}`.trim(),
    images: allPhotos,
    photo: primaryPhoto,
    Media: allPhotos,
    primaryPhoto,
    listedDate: item.ListingContractDate || item.OriginalEntryTimestamp,
    modificationTimestamp: item.ModificationTimestamp,
    statusChangeTimestamp: item.StatusChangeTimestamp,
    listAgentMlsId: item.ListAgentMlsId,
    listAgentFullName: item.ListAgentFullName,
    listOfficeMlsId: item.ListOfficeMlsId,
    listOfficeName: item.ListOfficeName,
    _mlsRaw: {
      OriginatingSystemName: item.OriginatingSystemName,
      MlgCanView: item.MlgCanView,
      StandardStatus: item.StandardStatus,
    },
  };
}

function normalizeProperties(items = []) {
  return items.map(normalizeProperty).filter(Boolean);
}

function extractCount(responseData) {
  if (responseData && typeof responseData['@odata.count'] === 'number') {
    return responseData['@odata.count'];
  }
  if (responseData && responseData.value && Array.isArray(responseData.value)) {
    return responseData.value.length;
  }
  return 0;
}

/**
 * Post-filter normalized properties by criteria that can't use $filter
 * (price range, bedrooms, bathrooms, ZIP, city, etc.)
 */
function postFilterProperties(properties, filters = {}) {
  return properties.filter(p => {
    // ZIP code filter
    if (filters.zip) {
      const zip = String(filters.zip).trim();
      if (p.zip !== zip) return false;
    }

    // City filter
    if (filters.city) {
      if (!p.city || p.city.toLowerCase() !== filters.city.toLowerCase()) return false;
    }

    // Price range
    if (filters.minPrice !== undefined && filters.minPrice !== null) {
      if (p.price < Number(filters.minPrice)) return false;
    }
    if (filters.maxPrice !== undefined && filters.maxPrice !== null) {
      if (p.price > Number(filters.maxPrice)) return false;
    }

    // Bedrooms
    if (filters.minBedrooms !== undefined && filters.minBedrooms !== null) {
      if (p.bedrooms < Number(filters.minBedrooms)) return false;
    }

    // Bathrooms
    if (filters.minBathrooms !== undefined && filters.minBathrooms !== null) {
      if (p.bathrooms < Number(filters.minBathrooms)) return false;
    }

    // Property type - for types not filterable via $filter
    if (filters.propertyType) {
      const apiType = mapPropertyType(filters.propertyType);
      if (apiType === null) {
        // Multi-family: check propertySubType or propertyType contains 'multi'
        const typeLower = (p.propertyType + ' ' + (p.propertySubType || '')).toLowerCase();
        if (!typeLower.includes('multi')) return false;
      }
    }

    return true;
  });
}

// ========== MAIN API METHODS ==========

/**
 * Get MLS Grid listings with filters, pagination, and sorting
 *
 * ZIP SEARCH STRATEGY (dual approach):
 *
 * 1. PRIMARY: Include PostalCode eq 'ZIP' in $filter.
 *    The official MLS Grid RESO API supports this. When the feed accepts it,
 *    the MLS itself returns only matching listings — clean and efficient.
 *
 * 2. FALLBACK: If the feed rejects PostalCode in $filter (400 error),
 *    we retry WITHOUT PostalCode filter and WITHOUT $search for ZIP.
 *    Instead, we fetch the maximum batch (200) and post-filter by exact ZIP.
 *    This ensures correct results even on restricted demo feeds.
 *
 * @param {Object} options - Query options
 * @param {Object} [options.filters={}] - Filter criteria
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Items per page
 * @param {string} [options.orderBy='ModificationTimestamp desc'] - OData $orderby
 * @param {string} [options.expand='Media'] - OData $expand
 * @returns {Promise<{data: Array, total: number, page: number, limit: number}>}
 */
async function getMlsGridListings({
  filters = {},
  page = 1,
  limit = 10,
  orderBy = 'ModificationTimestamp desc',
  expand = 'Media',
} = {}) {
  const startTime = Date.now();
  const log = logger.forRequest({ method: 'GET', url: '/Property', originalUrl: '/Property' });

  // ========== FETCH ATTEMPT 1: Try with PostalCode in $filter ==========

  // Build $filter WITH PostalCode (the official RESO way)
  const filterWithZip = buildFilter({ ...filters, usePostalCodeFilter: true });
  const searchQuery = buildSearchQuery(filters);

  // Fetch a larger batch for post-filter fallback (max 200 per API call)
  const fallbackFetchTop = 200;
  const top = Math.min(Math.max(1, Number(limit)), 200);
  const skip = (Math.max(1, Number(page)) - 1) * top;

  // Build URL params for the primary attempt
  const params = new URLSearchParams();
  params.append('$filter', filterWithZip);
  if (searchQuery) {
    params.append('$search', searchQuery);
  }
  params.append('$top', String(fallbackFetchTop));
  params.append('$orderby', orderBy);
  params.append('$count', 'true');
  if (expand) {
    params.append('$expand', expand);
  }

  const primaryUrl = `${BASE_URL}/Property?${params.toString()}`;

  // Log the primary attempt
  log.info('MLS Grid API request (primary)', {
    zip: filters.zip || 'not specified',
    city: filters.city || 'not specified',
    filter: filterWithZip,
    search: searchQuery || 'none',
    fullUrl: primaryUrl,
    method: 'GET',
    page,
    limit: top,
    expand,
    propertyType: filters.propertyType || 'not specified',
    status: filters.status || 'not specified',
    strategy: 'PostalCode in $filter',
  });

  console.log('');
  console.log('========================================');
  console.log('  MLS Grid API Request (Primary)');
  console.log('========================================');
  console.log(`  Strategy:         PostalCode in \$filter`);
  console.log(`  Incoming ZIP:     ${filters.zip || 'none'}`);
  console.log(`  Incoming City:    ${filters.city || 'none'}`);
  console.log(`  Property Type:    ${filters.propertyType || 'any'}`);
  console.log(`  Status:           ${filters.status || 'any'}`);
  console.log(`  MLS \$filter:      ${filterWithZip}`);
  console.log(`  MLS \$search:      ${searchQuery || 'none'}`);
  console.log(`  Request URL:      ${primaryUrl.substring(0, 250)}`);
  console.log(`  Request Method:   GET`);
  console.log('========================================');

  try {
    const response = await mlsClient.get('/Property', {
      params: params.toString(),
      paramsSerializer: p => p,
    });

    const duration = Date.now() - startTime;
    const items = response.data?.value || [];
    const totalRaw = extractCount(response.data);
    const normalized = normalizeProperties(items);

    // Even with PostalCode in $filter, we still post-filter for other criteria
    // (price, bedrooms, bathrooms, city string normalization, etc.)
    const filtered = postFilterProperties(normalized, filters);

    // Apply client-side pagination
    const paginatedData = filtered.slice(skip, skip + top);

    // Log the response
    log.info('MLS Grid API response (primary)', {
      status: response.status,
      zip: filters.zip || 'not specified',
      city: filters.city || 'not specified',
      propertyType: filters.propertyType || 'not specified',
      filterType: 'PostalCode in $filter',
      totalFromMls: totalRaw,
      afterNormalize: normalized.length,
      afterPostFilter: filtered.length,
      listingsReturned: paginatedData.length,
      duration: `${duration}ms`,
    });

    console.log('----------------------------------------');
    console.log(`  Status:             ${response.status}`);
    console.log(`  Filter Strategy:    PostalCode in \$filter`);
    console.log(`  Listings from MLS:  ${totalRaw}`);
    console.log(`  After normalize:    ${normalized.length}`);
    console.log(`  After post-filter:  ${filtered.length}`);
    console.log(`  Listings Returned:  ${paginatedData.length}`);
    console.log(`  Execution Time:     ${duration}ms`);
    console.log('========================================');
    console.log('');

    return {
      data: paginatedData,
      total: filtered.length,
      page: Number(page),
      limit: top,
    };
  } catch (error) {
    const errorStatus = error.response?.status || 0;
    const errorBody = error.response?.data;
    const errorMessage = errorBody ? errorBody.error?.message || JSON.stringify(errorBody) : error.message;

    // Check if this is a "PostalCode not filterable" error (expected fallback trigger)
    const isPostalCodeNotFilterable = errorStatus === 400 &&
      (errorMessage.includes('Invalid filter field') || errorMessage.includes('PostalCode'));

    if (isPostalCodeNotFilterable && filters.zip) {
      // ========== FETCH ATTEMPT 2: Fallback — post-filter without $filter PostalCode ==========
      console.log('----------------------------------------');
      console.log('  PRIMARY FAILED: PostalCode not filterable on this feed.');
      console.log('  FALLBACK: Fetching batch and post-filtering by ZIP.');
      console.log('----------------------------------------');

      const fallbackStartTime = Date.now();

      // Build $filter WITHOUT PostalCode
      const filterWithoutZip = buildFilter({ ...filters, usePostalCodeFilter: false });

      // Build URL params for fallback — NO $search for ZIP, fetch full 200
      const fallbackParams = new URLSearchParams();
      fallbackParams.append('$filter', filterWithoutZip);
      // Only add $search if there's actual search text (not ZIP)
      if (searchQuery) {
        fallbackParams.append('$search', searchQuery);
      }
      fallbackParams.append('$top', String(fallbackFetchTop));
      fallbackParams.append('$orderby', orderBy);
      fallbackParams.append('$count', 'true');
      if (expand) {
        fallbackParams.append('$expand', expand);
      }

      const fallbackUrl = `${BASE_URL}/Property?${fallbackParams.toString()}`;

      log.info('MLS Grid API request (fallback)', {
        zip: filters.zip || 'not specified',
        filter: filterWithoutZip,
        search: 'none (ZIP handled by post-filter)',
        fullUrl: fallbackUrl,
        strategy: 'PostalCode NOT in $filter (post-filter fallback)',
      });

      console.log('');
      console.log('========================================');
      console.log('  MLS Grid API Request (Fallback)');
      console.log('========================================');
      console.log(`  Strategy:         Post-filter (no \$filter on PostalCode)`);
      console.log(`  Incoming ZIP:     ${filters.zip}`);
      console.log(`  MLS \$filter:      ${filterWithoutZip}`);
      console.log(`  MLS \$search:      none (ZIP handled by post-filter)`);
      console.log(`  Fetch up to:      ${fallbackFetchTop} properties`);
      console.log(`  Request URL:      ${fallbackUrl.substring(0, 250)}`);
      console.log(`  Request Method:   GET`);
      console.log('========================================');

      try {
        const fallbackResponse = await mlsClient.get('/Property', {
          params: fallbackParams.toString(),
          paramsSerializer: p => p,
        });

        const fallbackDuration = Date.now() - fallbackStartTime;
        const fallbackItems = fallbackResponse.data?.value || [];
        const fallbackTotalRaw = extractCount(fallbackResponse.data);
        const fallbackNormalized = normalizeProperties(fallbackItems);

        // Post-filter by ALL criteria including exact ZIP
        const fallbackFiltered = postFilterProperties(fallbackNormalized, filters);

        // Apply client-side pagination
        const fallbackPaginatedData = fallbackFiltered.slice(skip, skip + top);

        log.info('MLS Grid API response (fallback)', {
          status: fallbackResponse.status,
          zip: filters.zip || 'not specified',
          filterType: 'Post-filter fallback',
          totalFromMls: fallbackTotalRaw,
          afterNormalize: fallbackNormalized.length,
          afterPostFilter: fallbackFiltered.length,
          listingsReturned: fallbackPaginatedData.length,
          duration: `${fallbackDuration}ms`,
        });

        console.log('----------------------------------------');
        console.log(`  Status:             ${fallbackResponse.status}`);
        console.log(`  Filter Strategy:    Post-filter on ${fallbackNormalized.length} properties`);
        console.log(`  Listings from MLS:  ${fallbackTotalRaw}`);
        console.log(`  After normalize:    ${fallbackNormalized.length}`);
        console.log(`  After ZIP filter:   ${fallbackFiltered.length}`);
        console.log(`  Listings Returned:  ${fallbackPaginatedData.length}`);
        console.log(`  Execution Time:     ${fallbackDuration}ms`);
        console.log('========================================');
        console.log('');

        return {
          data: fallbackPaginatedData,
          total: fallbackFiltered.length,
          page: Number(page),
          limit: top,
        };
      } catch (fallbackError) {
        const fallbackDuration = Date.now() - fallbackStartTime;
        const fallbackStatus = fallbackError.response?.status || 0;
        const fallbackErrorMsg = fallbackError.response?.data
          ? JSON.stringify(fallbackError.response.data)
          : fallbackError.message;

        log.error('MLS Grid API error (fallback also failed)', {
          zip: filters.zip || 'not specified',
          status: fallbackStatus,
          error: fallbackErrorMsg,
          duration: `${fallbackDuration}ms`,
        });

        console.error('--- MLS Grid API Error (Fallback Failed) ---');
        console.error(`  Incoming ZIP:     ${filters.zip || 'none'}`);
        console.error(`  Status:           ${fallbackStatus}`);
        console.error(`  Error:            ${fallbackErrorMsg}`);
        console.error(`  Duration:         ${fallbackDuration}ms`);
        console.error('--------------------------------------------');

        throw new Error(`MLS Grid API error (${fallbackStatus}): ${fallbackErrorMsg}`);
      }
    }

    // Not a PostalCode error — throw normally
    const duration = Date.now() - startTime;
    log.error('MLS Grid API error', {
      zip: filters.zip || 'not specified',
      city: filters.city || 'not specified',
      propertyType: filters.propertyType || 'not specified',
      status: errorStatus,
      error: errorMessage,
      duration: `${duration}ms`,
    });

    console.error('--- MLS Grid API Error ---');
    console.error(`  Incoming ZIP:     ${filters.zip || 'none'}`);
    console.error(`  Incoming City:    ${filters.city || 'none'}`);
    console.error(`  Property Type:    ${filters.propertyType || 'any'}`);
    console.error(`  MLS Filter:       ${filterWithZip}`);
    console.error(`  Search:           ${searchQuery || 'none'}`);
    console.error(`  Status:           ${errorStatus}`);
    console.error(`  Error:            ${errorMessage}`);
    console.error(`  Duration:         ${duration}ms`);
    console.error('---------------------------');

    throw new Error(`MLS Grid API error (${errorStatus}): ${errorMessage}`);
  }
}

// ========== DERIVED QUERIES ==========

async function getMlsGridFeaturedListings(limit = 6) {
  return getMlsGridListings({
    filters: { canView: true },
    limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

/**
 * Regex to detect a 5-digit US ZIP code
 */
const ZIP_CODE_REGEX = /^\d{5}$/;

async function getMlsGridSearchResults({ query, page = 1, limit = 10 } = {}) {
  console.log('');
  console.log('========== MLS Search Received ==========');
  console.log(`  Raw query:        ${query}`);

  const trimmed = (query || '').trim();

  // Detect if the query is a US ZIP code (5 digits)
  const isZipCode = ZIP_CODE_REGEX.test(trimmed);

  console.log(`  Is ZIP code?      ${isZipCode ? 'YES (routing to ZIP filter)' : 'NO (routing to free-text search)'}`);

  if (isZipCode) {
    // ZIP code search — route through the proper ZIP filtering pipeline
    // This uses the dual-strategy approach (try PostalCode in $filter, fallback to post-filter)
    console.log(`  Routing to:       getMlsGridListings with zip=${trimmed}`);
    console.log('==========================================');
    console.log('');

    return getMlsGridListings({
      filters: {
        canView: true,
        zip: trimmed,
      },
      page,
      limit,
      orderBy: 'ModificationTimestamp desc',
      expand: 'Media',
    });
  }

  // Free-text search — use $search for full-text matching
  console.log(`  Routing to:       getMlsGridListings with searchText="${trimmed}"`);
  console.log('==========================================');
  console.log('');

  return getMlsGridListings({
    filters: {
      canView: true,
      searchText: trimmed,
    },
    page,
    limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getMlsGridListingByListingId(listingId) {
  const filterString = `OriginatingSystemName eq 'carolina' and ListingId eq '${listingId.replace(/'/g, "''")}'`;

  try {
    const response = await mlsClient.get('/Property', {
      params: {
        $filter: filterString,
        $expand: 'Media',
        $top: 1,
      },
    });

    const items = response.data?.value || [];
    if (items.length === 0) return null;

    return normalizeProperty(items[0]);
  } catch (error) {
    logger.error('getMlsGridListingByListingId failed', { listingId, error: error.message });
    return null;
  }
}

async function getMlsGridListingByListingKey(listingKey) {
  const filterString = `OriginatingSystemName eq 'carolina' and ListingKey eq '${listingKey.replace(/'/g, "''")}'`;

  try {
    const response = await mlsClient.get('/Property', {
      params: {
        $filter: filterString,
        $expand: 'Media',
        $top: 1,
      },
    });

    const items = response.data?.value || [];
    if (items.length === 0) return null;

    return normalizeProperty(items[0]);
  } catch (error) {
    logger.error('getMlsGridListingByListingKey failed', { listingKey, error: error.message });
    return null;
  }
}

async function getMlsGridListingsByOffice(officeId) {
  return getMlsGridListings({
    filters: { canView: true, listOfficeMlsId: officeId },
    limit: 50,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getMlsGridActiveListings(limit = 10) {
  return getMlsGridListings({
    filters: { canView: true },
    limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getMlsGridListingsWithMedia(limit = 10) {
  return getMlsGridListings({
    filters: { canView: true },
    limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getMlsGridDemoListings() {
  return getMlsGridListings({
    filters: { canView: true },
    limit: 10,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

// ========== MEMBERS / OFFICES / ETC. ==========

async function getMlsGridMembers(limit = 10) {
  const startTime = Date.now();
  try {
    const response = await mlsClient.get('/Member', {
      params: {
        $filter: "OriginatingSystemName eq 'carolina'",
        $top: limit,
        $orderby: 'ModificationTimestamp desc',
        $count: 'true',
      },
    });

    const items = response.data?.value || [];
    const total = extractCount(response.data);
    console.log('--- MLS Grid Members ---');
    console.log(`Status: ${response.status}`);
    console.log(`Members Received: ${items.length}`);
    console.log(`Execution Time: ${Date.now() - startTime}ms`);

    return { data: items, total };
  } catch (error) {
    logger.error('getMlsGridMembers failed', { error: error.message });
    throw error;
  }
}

async function getMlsGridOffices(limit = 10) {
  const startTime = Date.now();
  try {
    const response = await mlsClient.get('/Office', {
      params: {
        $filter: "OriginatingSystemName eq 'carolina'",
        $top: limit,
        $orderby: 'ModificationTimestamp desc',
        $count: 'true',
      },
    });

    const items = response.data?.value || [];
    const total = extractCount(response.data);
    console.log('--- MLS Grid Offices ---');
    console.log(`Status: ${response.status}`);
    console.log(`Offices Received: ${items.length}`);
    console.log(`Execution Time: ${Date.now() - startTime}ms`);

    return { data: items, total };
  } catch (error) {
    logger.error('getMlsGridOffices failed', { error: error.message });
    throw error;
  }
}

async function getMlsGridOpenHouses(limit = 10) {
  const startTime = Date.now();
  try {
    const response = await mlsClient.get('/OpenHouse', {
      params: {
        $filter: "OriginatingSystemName eq 'carolina'",
        $top: limit,
        $orderby: 'ModificationTimestamp desc',
        $count: 'true',
      },
    });

    const items = response.data?.value || [];
    const total = extractCount(response.data);
    console.log('--- MLS Grid Open Houses ---');
    console.log(`Status: ${response.status}`);
    console.log(`Open Houses Received: ${items.length}`);
    console.log(`Execution Time: ${Date.now() - startTime}ms`);

    return { data: items, total };
  } catch (error) {
    logger.error('getMlsGridOpenHouses failed', { error: error.message });
    throw error;
  }
}

async function getMlsGridLookup() {
  const startTime = Date.now();
  try {
    const response = await mlsClient.get('/Lookup', {
      params: {
        $filter: "OriginatingSystemName eq 'carolina'",
        $count: 'true',
      },
    });

    console.log('--- MLS Grid Lookup ---');
    console.log(`Status: ${response.status}`);
    console.log(`Execution Time: ${Date.now() - startTime}ms`);

    return { data: response.data?.value || [] };
  } catch (error) {
    logger.error('getMlsGridLookup failed', { error: error.message });
    throw error;
  }
}

async function getMlsGridMedia(limit = 10) {
  const startTime = Date.now();
  try {
    const response = await mlsClient.get('/Media', {
      params: {
        $filter: "OriginatingSystemName eq 'carolina'",
        $top: limit,
        $orderby: 'ModificationTimestamp desc',
        $count: 'true',
      },
    });

    const items = response.data?.value || [];
    const total = extractCount(response.data);
    console.log('--- MLS Grid Media ---');
    console.log(`Status: ${response.status}`);
    console.log(`Media Items Received: ${items.length}`);
    console.log(`Execution Time: ${Date.now() - startTime}ms`);

    return { data: items, total };
  } catch (error) {
    logger.error('getMlsGridMedia failed', { error: error.message });
    throw error;
  }
}

// ========== SPECIALIZED PROPERTY TYPE QUERIES ==========

async function getBuySellProperties(queryParams = {}) {
  return getMlsGridListings({
    filters: {
      canView: true,
      status: queryParams.status || 'Active',
      zip: queryParams.zip,
      city: queryParams.city,
      minPrice: queryParams.minPrice,
      maxPrice: queryParams.maxPrice,
      minBedrooms: queryParams.bedrooms,
      minBathrooms: queryParams.bathrooms,
      propertyType: queryParams.propertyType,
    },
    page: queryParams.page,
    limit: queryParams.limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getLandProperties(queryParams = {}) {
  return getMlsGridListings({
    filters: {
      canView: true,
      propertyType: 'Land',
      zip: queryParams.zip,
      city: queryParams.city,
      minPrice: queryParams.minPrice,
      maxPrice: queryParams.maxPrice,
    },
    page: queryParams.page,
    limit: queryParams.limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getInvestmentProperties(queryParams = {}) {
  // Investment includes Commercial, Land, and multi-family
  // Since MultiFamily isn't a valid PropertyType, we use $search for it
  return getMlsGridListings({
    filters: {
      canView: true,
      propertyType: 'CommercialSale,Land,Residential',
      zip: queryParams.zip,
      city: queryParams.city,
      minPrice: queryParams.minPrice,
      maxPrice: queryParams.maxPrice,
      // Use searchText to find multifamily properties
      searchText: 'multifamily',
    },
    page: queryParams.page,
    limit: queryParams.limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getMultifamilyProperties(queryParams = {}) {
  // MultiFamily is not a valid PropertyType value in carolina system.
  // Use $search with 'multifamily' keyword to find relevant listings
  return getMlsGridListings({
    filters: {
      canView: true,
      propertyType: 'Residential',
      zip: queryParams.zip,
      city: queryParams.city,
      // Add 'multifamily' to $search via searchText to find multifamily listings
      searchText: 'multifamily',
    },
    page: queryParams.page,
    limit: queryParams.limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getPropertyManagementProperties(queryParams = {}) {
  return getMlsGridListings({
    filters: {
      canView: true,
      status: 'Active',
      propertyType: 'ResidentialLease',
      zip: queryParams.zip,
      city: queryParams.city,
    },
    page: queryParams.page,
    limit: queryParams.limit,
    orderBy: 'ModificationTimestamp desc',
    expand: 'Media',
  });
}

async function getPropertyById(id) {
  let property = await getMlsGridListingByListingId(id);
  if (property) return property;
  property = await getMlsGridListingByListingKey(id);
  return property;
}

async function searchProperties({ query, page = 1, limit = 10 } = {}) {
  return getMlsGridSearchResults({ query, page, limit });
}

module.exports = {
  getMlsGridListings,
  getMlsGridFeaturedListings,
  getMlsGridSearchResults,
  getMlsGridListingByListingId,
  getMlsGridListingByListingKey,
  getMlsGridListingsByOffice,
  getMlsGridActiveListings,
  getMlsGridListingsWithMedia,
  getMlsGridDemoListings,
  getBuySellProperties,
  getLandProperties,
  getInvestmentProperties,
  getMultifamilyProperties,
  getPropertyManagementProperties,
  getPropertyById,
  searchProperties,
  getMlsGridMembers,
  getMlsGridOffices,
  getMlsGridOpenHouses,
  getMlsGridLookup,
  getMlsGridMedia,
  buildFilter,
  normalizeProperty,
};
