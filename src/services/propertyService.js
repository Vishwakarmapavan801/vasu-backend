/**
 * Property Service
 *
 * Business logic for property operations. Uses the search engine
 * for smart search type detection and the OData builder for
 * MLS Grid-compliant queries.
 *
 * Pipeline:
 *   User Search → Detect Type → Build OData Query → Fetch MLS →
 *   Normalize → Apply Local Filters → Sort → Paginate → Return
 */

const { fetchWithRetry, normalizeProperty, normalizeResponse } = require('./mlsService');
const { buildQuery, applyLocalFilters, sortLocal } = require('./odataBuilder');
const cache = require('../utils/cache');
const {
  detectSearchType,
  buildSearchFilters,
  isPreciseFilter,
  getFetchLimit,
  BROKERAGE,
} = require('./searchEngine');
const { MLS_GRID_BASE_URL, NODE_ENV } = require('../config');
const isDev = NODE_ENV === 'development';

/**
 * Get properties with full search pipeline.
 *
 * @param {Object} params - Search/filter parameters
 * @param {string} [params.q] - Free-text search query
 * @param {string} [params.listingId] - Direct ListingId filter
 * @param {string} [params.status] - StandardStatus filter
 * @param {string} [params.city] - City filter (local)
 * @param {number} [params.priceMin] - Min price (local)
 * @param {number} [params.priceMax] - Max price (local)
 * @param {number} [params.beds] - Min beds (local)
 * @param {number} [params.baths] - Min baths (local)
 * @param {string} [params.propertyType] - Property type filter
 * @param {string} [params.officeId] - ListOfficeMlsId filter
 * @param {number} [params.top=20] - Page size
 * @param {number} [params.skip=0] - Offset
 * @param {string} [params.orderby] - Sort field
 * @param {boolean} [params.applyBrokerageScope=true] - Whether to filter by brokerage
 * @returns {Promise<Object>}
 */
async function getProperties(params = {}) {
  const top = Math.max(1, parseInt(params.top, 10) || 20);
  const skip = Math.max(0, parseInt(params.skip, 10) || 0);

  // For list queries, limit media to reduce signed URL generation and CDN 429s.
  // Property card components typically only display 1 image, so 3 is generous.
  // Fewer media items = fewer signed URLs = fewer CDN requests = lower 429 risk.
  // Property detail queries (listingId present) get all media.
  const isDetailQuery = !!(params.listingId || params.listingKey);
  const maxMedia = isDetailQuery ? 0 : 3; // 0 = all, 3 = max for lists (was 10)

  // Step 1: Detect search type if 'q' is provided
  let mlsFilters = {};
  let localFilters = {};
  let hasSearchQuery = false;

  if (params.q) {
    hasSearchQuery = true;
    const searchResult = detectSearchType(params.q);
    const searchFilters = buildSearchFilters(searchResult, params);
    mlsFilters = searchFilters.mlsFilters;
    localFilters = searchFilters.localFilters;
  } else {
    // Direct param-based search (from URL params, not free text)
    mlsFilters = buildDirectFilters(params);
    localFilters = buildDirectLocalFilters(params);
  }

  // Step 2: Apply brokerage scope only when explicitly requested
  // By default, show all MLS listings (not just this brokerage's)
  if (params.applyBrokerageScope === true) {
    if (!mlsFilters.listingId && !mlsFilters.listOfficeMlsId) {
      mlsFilters.listOfficeMlsId = BROKERAGE.FIRM_LICENSE;
    }
  }

  // Step 3: Determine if we need broader fetch + local filtering
  const precise = isPreciseFilter(mlsFilters);
  const hasLocalFilters = Object.keys(localFilters).length > 0;
  const needsBroaderFetch = hasSearchQuery || hasLocalFilters || !precise;

  // Step 4: Build OData query and fetch
  let odataOptions = { top, skip };
  if (params.orderby) odataOptions.orderby = params.orderby;

  if (needsBroaderFetch && !precise) {
    // For non-precise searches, fetch more results for local filtering
    const fetchLimit = getFetchLimit(params.top || 20);
    odataOptions.top = fetchLimit;
    odataOptions.skip = 0; // Start from beginning for local filtering
  } else {
    odataOptions.top = top;
    odataOptions.skip = skip;
  }

  // Build query string using ONLY filterable fields
  const queryString = buildQuery(mlsFilters, odataOptions);
  const url = `${MLS_GRID_BASE_URL}/Property?${queryString}`;
  const data = await fetchWithRetry(url);

  // Normalize with media limiting to reduce signed URL generation
  let properties = (data.value || []).map(p => normalizeProperty(p, { maxMedia }));
  let totalCount = data['@odata.count'] || data.value?.length || 0;

  // Step 5: Apply local (in-memory) filters for non-filterable fields
  if (hasLocalFilters && properties.length > 0) {
    properties = applyLocalFilters(properties, localFilters);
  }

  // Step 6: Sort locally if needed (for non-MLS-sortable fields)
  if (params.orderby && hasLocalFilters) {
    const orderParts = String(params.orderby).split(' ');
    const sortBy = orderParts[0];
    const sortOrder = orderParts[1] || 'desc';
    properties = sortLocal(properties, sortBy, sortOrder);
  }

  // Step 7: Paginate locally if we fetched extra for filtering
  if (needsBroaderFetch && !precise) {
    const start = skip;
    const end = start + top;
    totalCount = properties.length;
    properties = properties.slice(start, end);
  }

  return {
    success: true,
    data: properties,
    totalCount,
    nextLink: data['@odata.nextLink'] || null,
    page: Math.floor(skip / top),
    pageSize: top,
    hasMore: (skip + top) < totalCount,
    cached: data._cached || false,
  };
}

/**
 * Build MLS filter params from direct query parameters (no 'q').
 */
function buildDirectFilters(params) {
  const filters = {};
  if (params.listingId) filters.listingId = params.listingId;
  if (params.mlgCanView) filters.mlgCanView = true;
  if (params.status) {
    // Map common aliases to MLS Grid StandardStatus values
    const statusMap = {
      'for-sale': 'Active',
      'for sale': 'Active',
      'forsale': 'Active',
      'active': 'Active',
      'sold': 'Closed',
      'closed': 'Closed',
      'pending': 'Pending',
      'coming-soon': 'ComingSoon',
      'comingsoon': 'ComingSoon',
      'for-rent': 'Active',
      'for rent': 'Active',
    };
    const normalized = String(params.status).toLowerCase().trim();
    filters.standardStatus = statusMap[normalized] || params.status;
  }
  if (params.propertyType) {
    filters.propertyType = params.propertyType;
  }
  if (params.officeId) {
    filters.listOfficeMlsId = params.officeId;
  }
  return filters;
}

/**
 * Build local filter params from direct query parameters.
 */
function buildDirectLocalFilters(params) {
  const filters = {};
  if (params.city) filters.city = params.city;
  if (params.state) filters.stateOrProvince = params.state;
  if (params.zip || params.postalCode) filters.postalCode = params.zip || params.postalCode;
  if (params.streetNumber) filters.streetNumber = params.streetNumber;
  if (params.streetName) filters.streetName = params.streetName;
  if (params.county) filters.countyOrParish = params.county;
  if (params._agentMlsId) filters.listAgentMlsId = params._agentMlsId;
  const pMin = params.priceMin || params.minPrice;
  const pMax = params.priceMax || params.maxPrice;
  if (pMin) filters.minPrice = Number(pMin);
  if (pMax) filters.maxPrice = Number(pMax);
  const b = params.beds || params.minBeds;
  const ba = params.baths || params.minBaths;
  if (b) filters.minBeds = Number(b);
  if (ba) filters.minBaths = Number(ba);
  if (params.minSqft) filters.minSqft = Number(params.minSqft);
  if (params.maxSqft) filters.maxSqft = Number(params.maxSqft);
  return filters;
}

/**
 * Get a single property by ListingId, with fallback to ListingKey.
 *
 * Frontend cards pass ListingKey (e.g., "CAR303530978") in the URL,
 * but the OData filter $filter=ListingId eq 'CAR303530978' matches
 * nothing because ListingId is the numeric-only field (e.g., "303530978").
 *
 * When the ListingId lookup fails, we retry using the key-based OData
 * endpoint: Property('CAR303530978')?$expand=Media
 */
async function getPropertyById(listingId) {
  if (!listingId) return null;

  // Try by ListingId first
  const result = await getProperties({
    listingId,
    top: 1,
    applyBrokerageScope: false,
  });

  if (result.data[0]) return result.data[0];

  // Fallback: the id might actually be a ListingKey
  try {
    const keyResult = await getPropertyByKey(listingId);
    return keyResult?.data || null;
  } catch {
    return null;
  }
}

/**
 * Get a single property by ListingId with ALL media (0 = unlimited).
 * Used for property detail pages where full gallery is needed.
 * This is called by getListingById in the controller.
 */
async function getPropertyByIdWithAllMedia(listingId) {
  if (!listingId) return null;
  // Use getPropertyByKey for reliable entity-key access with full Media
  try {
    const keyResult = await getPropertyByKey(listingId);
    if (keyResult?.data) return keyResult.data;
  } catch {
    // fall through to getProperties
  }
  // Fallback to search-based lookup
  const result = await getProperties({
    listingId,
    top: 1,
    applyBrokerageScope: false,
  });
  return result.data[0] || null;
}

/**
 * Get a single property by ListingKey (entity key access).
 */
async function getPropertyByKey(listingKey) {
  if (!listingKey) return null;
  try {
    const url = `${MLS_GRID_BASE_URL}/Property('${encodeURIComponent(listingKey)}')?$expand=Media`;
    const data = await fetchWithRetry(url);
    // Key-based detail queries get all media (0 = unlimited)
    const property = normalizeProperty(data, { maxMedia: 0 });
    if (!property) {
      return { success: false, data: null, error: 'Property not found after normalization' };
    }
    return {
      success: true,
      data: property,
    };
  } catch (err) {
    // Log the error so it's visible in backend logs
    console.error(`[getPropertyByKey] MLS error for key ${listingKey}:`, err.message);
    // Re-throw so the controller can return a proper HTTP error response
    throw err;
  }
}

/**
 * Get featured properties (most recently modified, Active).
 */
async function getFeaturedProperties(params = {}) {
  return getProperties({
    status: 'Active',
    orderby: 'ModificationTimestamp desc',
    top: params.top || 6,
    applyBrokerageScope: false, // Featured is broader
  });
}

/**
 * Get sold/closed properties.
 */
async function getSoldProperties(params = {}) {
  return getProperties({
    status: 'Closed',
    orderby: 'CloseDate desc',
    top: params.top || 10,
    applyBrokerageScope: false,
  });
}

/**
 * Search properties by free-text query.
 */
async function searchProperties(query, params = {}) {
  return getProperties({
    ...params,
    q: query,
    applyBrokerageScope: params.applyBrokerageScope === true,
  });
}

/**
 * Get properties by office MLs ID.
 */
async function getPropertiesByOffice(officeId, params = {}) {
  return getProperties({
    ...params,
    officeId,
    applyBrokerageScope: false,
  });
}

/**
 * Get properties by agent MLS ID.
 * Note: ListAgentMlsId is NOT filterable in MLS Grid.
 * Uses broader fetch + local filtering.
 */
async function getPropertiesByAgent(memberId, params = {}) {
  const filters = {
    ...params,
    _agentMlsId: memberId,
    applyBrokerageScope: false,
  };
  return getProperties(filters);
}

/**
 * Get properties by status.
 */
async function getPropertiesByStatus(status, params = {}) {
  return getProperties({
    ...params,
    status,
    applyBrokerageScope: false,
  });
}

/**
 * Get properties by property type.
 */
async function getPropertiesByType(propertyType, params = {}) {
  return getProperties({
    ...params,
    propertyType,
    applyBrokerageScope: false,
  });
}

/**
 * Get members (agents) from MLS Grid.
 */
async function getMembers(params = {}) {
  const top = params.top || 20;
  const skip = params.skip || 0;
  const url = `${MLS_GRID_BASE_URL}/Member?$top=${top}&$skip=${skip}&$count=true`;
  const data = await fetchWithRetry(url);
  return {
    success: true,
    data: data.value || [],
    totalCount: data['@odata.count'] || 0,
  };
}

/**
 * Get offices from MLS Grid.
 */
async function getOffices(params = {}) {
  const top = params.top || 20;
  const skip = params.skip || 0;
  const url = `${MLS_GRID_BASE_URL}/Office?$top=${top}&$skip=${skip}&$count=true`;
  const data = await fetchWithRetry(url);
  return {
    success: true,
    data: data.value || [],
    totalCount: data['@odata.count'] || 0,
  };
}

/**
 * Get open houses.
 */
async function getOpenHouses(params = {}) {
  const top = params.top || 20;
  const skip = params.skip || 0;
  const url = `${MLS_GRID_BASE_URL}/OpenHouse?$top=${top}&$skip=${skip}&$count=true`;
  const data = await fetchWithRetry(url);
  return {
    success: true,
    data: data.value || [],
    totalCount: data['@odata.count'] || 0,
  };
}

/**
 * Get open houses with full property details (including Media/images).
 * Fetches OpenHouse records, extracts unique ListingKeys, then fetches
 * the corresponding Property data for each key with $expand=Media.
 *
 * @param {Object} params
 * @param {number} [params.top=20] - Max open houses to return
 * @returns {Promise<Object>}
 */
async function getOpenHouseProperties(params = {}) {
  const top = Math.min(50, Math.max(1, parseInt(params.top, 10) || 20));
  
  // 1. Fetch OpenHouse records
  const ohUrl = `${MLS_GRID_BASE_URL}/OpenHouse?$top=${top}&$count=true&$filter=OriginatingSystemName eq 'carolina'`;
  const ohData = await fetchWithRetry(ohUrl);
  const openHouses = ohData.value || [];
  
  if (openHouses.length === 0) {
    return { success: true, data: [], totalCount: 0 };
  }
  
  // 2. Extract unique ListingKeys
  const listingKeys = [...new Set(openHouses.map(oh => oh.ListingKey).filter(Boolean))];
  
  if (listingKeys.length === 0) {
    return { success: true, data: [], totalCount: 0 };
  }
  
  // 3. Fetch properties by ListingKey (limit to first 20 keys to avoid massive queries)
  const keysToFetch = listingKeys.slice(0, 20);
  const properties = [];
  
  for (const listingKey of keysToFetch) {
    try {
      const propUrl = `${MLS_GRID_BASE_URL}/Property('${encodeURIComponent(listingKey)}')?$expand=Media`;
      const propData = await fetchWithRetry(propUrl);
      const normalized = normalizeProperty(propData, { maxMedia: 3 });
      if (normalized) {
        properties.push(normalized);
      }
    } catch (err) {
      // Log and skip properties that fail to load
      console.warn(`[OpenHouse] Failed to fetch property ${listingKey}: ${err.message}`);
    }
  }
  
  return {
    success: true,
    data: properties,
    totalCount: properties.length,
    openHouseCount: openHouses.length,
  };
}

/**
 * Get lookup data.
 */
async function getLookupData() {
  const url = `${MLS_GRID_BASE_URL}/Lookup`;
  const data = await fetchWithRetry(url);
  return { success: true, data: data.value || [] };
}

/**
 * Get media.
 */
  async function getMedia(params = {}) {
    const top = params.top || 20;
    const url = `${MLS_GRID_BASE_URL}/Media?$top=${top}&$count=true`;
    const data = await fetchWithRetry(url);
    return {
      success: true,
      data: data.value || [],
      totalCount: data['@odata.count'] || 0,
      cached: data._cached || false,
    };
  }

/**
 * Get properties by city with optimized broader fetch.
 *
 * City is NOT filterable by MLS Grid, so this fetches a large batch
 * from MLS (up to 200) and filters locally for the requested city.
 *
 * @param {string} cityName - City name (e.g., "Charlotte", "Rock Hill")
 * @param {Object} [params={}] - Additional query parameters
 * @returns {Promise<Object>}
 */
async function getPropertiesByCity(cityName, params = {}) {
  if (!cityName || typeof cityName !== 'string') {
    return { success: true, data: [], totalCount: 0, page: 0, pageSize: 0, hasMore: false };
  }

  const top = Math.max(1, parseInt(params.top, 10) || 20);
  const skip = Math.max(0, parseInt(params.skip, 10) || 0);

  // Fetch up to limit properties for broader local filtering
  const fetchLimit = Math.min(500, Math.max(200, parseInt(params.fetchLimit, 10) || 500));

  // Build query with status filter (Active by default) and broader fetch
  const mlsFilters = {};
  mlsFilters.mlgCanView = true;
  const status = params.status || 'Active';
  const statusMap = {
    'for-sale': 'Active', 'for sale': 'Active', 'forsale': 'Active',
    'active': 'Active', 'sold': 'Closed', 'closed': 'Closed',
    'pending': 'Pending', 'coming-soon': 'ComingSoon', 'comingsoon': 'ComingSoon',
  };
  const normalized = String(status).toLowerCase().trim();
  mlsFilters.standardStatus = statusMap[normalized] || (['Active','Pending','Closed','ComingSoon'].includes(status) ? status : 'Active');

  if (params.propertyType) {
    mlsFilters.propertyType = params.propertyType;
  }

  const odataOptions = {
    top: fetchLimit,
    skip: 0,
    orderby: params.orderby || 'ModificationTimestamp desc',
    count: true,
  };

  const queryString = buildQuery(mlsFilters, odataOptions);
  const url = `${MLS_GRID_BASE_URL}/Property?${queryString}`;
  const data = await fetchWithRetry(url);

  // ─── CONCORD DEBUG: Log raw MLS response count ───
  const mlsReturnedCount = data['@odata.count'] || data.value?.length || 0;
  const rawCities = new Set((data.value || []).map(p => String(p.City || '').trim()).filter(Boolean));
  const rawOsn = new Set((data.value || []).map(p => String(p.OriginatingSystemName || '').trim()).filter(Boolean));

  // Normalize with limited media for list views
  let properties = (data.value || []).map(p => normalizeProperty(p, { maxMedia: 3 }));
  const normalizedCount = properties.length;

  // Apply local city filter (case-insensitive, exact match)
  const cityLower = cityName.toLowerCase().trim();
  properties = properties.filter(p =>
    String(p.City || '').toLowerCase().trim() === cityLower
  );
  const afterCityFilter = properties.length;

  // ─── CONCORD DEBUG: Log filtering counts ───
  if (isDev || cityLower === 'concord') {
    const afterPriceFilter = afterCityFilter;
    const osnList = Array.from(rawOsn).join(', ');
    const cityList = Array.from(rawCities).slice(0, 20).join(', ');
    console.log(
      '\x1b[36m━━━ [CitySearch] ' + cityName + ' ━━━\x1b[0m\n' +
      `  MLS returned     : ${mlsReturnedCount} total (fetched ${normalizedCount})\n` +
      `  Cities in response: ${cityList || '(none)'}\n` +
      `  OriginatingSystems: ${osnList || '(none)'}\n` +
      `  Normalized        : ${normalizedCount}\n` +
      `  After city filter : ${afterCityFilter}\n` +
      `  Price/beds filter : ${afterPriceFilter}\n` +
      `  Returned (page)   : ${Math.min(top, Math.max(0, afterPriceFilter - skip))}\n` +
      `  Has more          : ${(skip + top) < afterPriceFilter}\n` +
      '\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m'
    );
  }

  // Apply additional local filters (normalize param names)
  const pMin = params.priceMin || params.minPrice;
  const pMax = params.priceMax || params.maxPrice;
  const b = params.beds || params.minBeds;
  const ba = params.baths || params.minBaths;
  if (pMin) properties = properties.filter(p => Number(p.ListPrice || 0) >= Number(pMin));
  if (pMax) properties = properties.filter(p => Number(p.ListPrice || 0) <= Number(pMax));
  if (b) properties = properties.filter(p => Number(p.BedroomsTotal || 0) >= Number(b));
  if (ba) properties = properties.filter(p => Number(p.BathroomsFull || 0) >= Number(ba));
  if (params.minSqft) properties = properties.filter(p => Number(p.LivingArea || 0) >= Number(params.minSqft));
  if (params.maxSqft) properties = properties.filter(p => Number(p.LivingArea || 0) <= Number(params.maxSqft));
  if (params.propertyType) properties = properties.filter(p => (p.PropertyType || '').toLowerCase() === String(params.propertyType).toLowerCase());

  const totalCount = properties.length;

  // Sort locally by any supported field
  if (params.orderby) {
    const parts = params.orderby.split(' ');
    const field = parts[0];
    const dir = (parts[1] || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    switch (field) {
      case 'ListPrice':
      case 'price':
        properties.sort((a, b) => dir * ((Number(a.ListPrice || 0)) - (Number(b.ListPrice || 0))));
        break;
      case 'BedroomsTotal':
      case 'bedrooms':
        properties.sort((a, b) => dir * ((Number(a.BedroomsTotal || 0)) - (Number(b.BedroomsTotal || 0))));
        break;
      case 'LivingArea':
      case 'squareFeet':
        properties.sort((a, b) => dir * ((Number(a.LivingArea || 0)) - (Number(b.LivingArea || 0))));
        break;
      default:
        properties.sort((a, b) => {
          const dateA = new Date(a.ModificationTimestamp || 0).getTime();
          const dateB = new Date(b.ModificationTimestamp || 0).getTime();
          return dir * (dateA - dateB);
        });
    }
  }

  // Paginate
  const start = skip;
  const end = start + top;
  const paginated = properties.slice(start, end);

  return {
    success: true,
    data: paginated,
    totalCount,
    page: Math.floor(skip / top),
    pageSize: top,
    hasMore: (skip + top) < totalCount,
    city: cityName,
  };
}

/**
 * Get active listings.
 */
async function getActiveListings(params = {}) {
  return getProperties({
    ...params,
    status: 'Active',
    applyBrokerageScope: false,
  });
}

/**
 * Verify MLS Grid connection.
 */
async function verifyConnection() {
  try {
    const url = `${MLS_GRID_BASE_URL}/Property?$top=1&$count=true&$filter=OriginatingSystemName eq 'carolina'`;
    const data = await fetchWithRetry(url);
    return {
      success: true,
      connected: true,
      totalProperties: data['@odata.count'] || 0,
      baseUrl: MLS_GRID_BASE_URL,
    };
  } catch (err) {
    return {
      success: false,
      connected: false,
      error: err.message,
      baseUrl: MLS_GRID_BASE_URL,
    };
  }
}

/**
 * Get Open Houses for a specific property by ListingKey.
 * Queries MLS OpenHouse resource filtered by the property's ListingKey.
 * Returns hasOpenHouse, upcoming dates, times, and status.
 */
async function getOpenHousesByProperty(listingKey) {
  if (!listingKey) {
    return { success: false, hasOpenHouse: false, openHouses: [], error: 'ListingKey required' };
  }
  try {
    // ListingKey is NOT filterable on OpenHouse in MLS Grid (throws 400).
    // Instead, fetch a set of recent open houses and filter locally.
    // Avoid $orderby on OpenHouse — it may also be rejected.
    const url = `${MLS_GRID_BASE_URL}/OpenHouse?$filter=OriginatingSystemName eq 'carolina'&$top=50`;
    const data = await fetchWithRetry(url);
    const allOpenHouses = (data.value || []);

    // Filter locally by ListingKey (case-sensitive comparison)
    const openHouses = allOpenHouses
      .filter(oh => oh.ListingKey === listingKey)
      .map(oh => ({
        listingKey: oh.ListingKey,
        date: oh.OpenHouseDate || oh.Date || null,
        startTime: oh.OpenHouseStartTime || oh.StartTime || null,
        endTime: oh.OpenHouseEndTime || oh.EndTime || null,
        type: oh.OpenHouseType || oh.Type || 'Public',
        remarks: oh.OpenHouseRemarks || oh.Remarks || '',
      }));

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcoming = openHouses.filter(oh => {
      if (!oh.date) return false;
      const ohDate = new Date(oh.date);
      return ohDate >= today;
    });

    return {
      success: true,
      hasOpenHouse: upcoming.length > 0,
      openHouses: upcoming.map(oh => ({
        ...oh,
        date: oh.date ? new Date(oh.date).toISOString().split('T')[0] : null,
      })),
      totalCount: openHouses.length,
    };
  } catch (err) {
    console.warn(`[getOpenHousesByProperty] Error for ${listingKey}: ${err.message}`);
    return { success: false, hasOpenHouse: false, openHouses: [], error: err.message };
  }
}

/**
 * Get comparable properties for a listing.
 * Fetches real MLS properties in the same ZIP/city with similar characteristics.
 */
async function getComparableProperties(listingKey) {
  if (!listingKey) {
    return { success: false, data: [], error: 'ListingKey required' };
  }
  try {
    // First get the source property to know its details
    const propUrl = `${MLS_GRID_BASE_URL}/Property('${encodeURIComponent(listingKey)}')`;
    const sourceData = await fetchWithRetry(propUrl);
    const source = sourceData || {};

    const city = source.City || '';
    const zip = source.PostalCode || '';
    const price = source.ListPrice || 0;
    const type = source.PropertyType || '';
    const beds = source.BedroomsTotal || 0;
    const baths = source.BathroomsFull || 0;

    // Fetch properties in same city for comparables
    const filterParts = [`OriginatingSystemName eq 'carolina'`, `MlgCanView eq true`];
    if (type) filterParts.push(`PropertyType eq '${type.replace(/'/g, "''")}'`);
    // Status: Closed (sold comps) or Active (current comps)
    filterParts.push(`(StandardStatus eq 'Active' or StandardStatus eq 'Closed')`);

    const odataQuery = `$filter=${encodeURIComponent(filterParts.join(' and '))}&$top=50&$orderby=ModificationTimestamp desc&$count=true&$expand=Media`;
    const url = `${MLS_GRID_BASE_URL}/Property?${odataQuery}`;
    const data = await fetchWithRetry(url);

    const properties = (data.value || [])
      .filter(p => p.ListingKey !== listingKey)
      .map(p => normalizeProperty(p, { maxMedia: 1 }))
      .filter(Boolean);

    // Score and sort by similarity
    const scored = properties.map(p => {
      let score = 0;
      const sameZip = p.PostalCode && zip && String(p.PostalCode).substring(0, 5) === String(zip).substring(0, 5);
      const sameCity = p.City && city && String(p.City).toLowerCase() === String(city).toLowerCase();
      const priceDiff = price > 0 ? Math.abs(Number(p.ListPrice || 0) - price) / price : 1;
      const bedsDiff = Math.abs(Number(p.BedroomsTotal || 0) - beds);
      const bathsDiff = Math.abs(Number(p.BathroomsFull || 0) - baths);

      if (sameZip) score += 30;
      if (sameCity) score += 20;
      if (type && p.PropertyType === type) score += 15;
      if (priceDiff < 0.1) score += 15;
      else if (priceDiff < 0.25) score += 10;
      else if (priceDiff < 0.5) score += 5;
      if (bedsDiff === 0) score += 10;
      else if (bedsDiff <= 1) score += 5;
      if (bathsDiff === 0) score += 10;
      else if (bathsDiff <= 1) score += 5;

      // Same status
      if (p.StandardStatus === source.StandardStatus) score += 5;

      return { ...p, similarityScore: score };
    });

    const sorted = scored.sort((a, b) => b.similarityScore - a.similarityScore).slice(0, 6);

    return {
      success: true,
      data: sorted,
      totalCount: properties.length,
      source: {
        city, zip, price, propertyType: type, bedrooms: beds, bathrooms: baths,
      },
    };
  } catch (err) {
    console.warn(`[getComparableProperties] Error for ${listingKey}: ${err.message}`);
    return { success: false, data: [], error: err.message };
  }
}

module.exports = {
  getProperties,
  getPropertyById,
  getPropertyByIdWithAllMedia,
  getPropertyByKey,
  getPropertiesByOffice,
  getPropertiesByAgent,
  getPropertiesByStatus,
  getPropertiesByType,
  getPropertiesByCity,
  getFeaturedProperties,
  getSoldProperties,
  searchProperties,
  getMembers,
  getOffices,
  getOpenHouses,
  getOpenHouseProperties,
  getOpenHousesByProperty,
  getComparableProperties,
  getLookupData,
  getMedia,
  getActiveListings,
  verifyConnection,
};
