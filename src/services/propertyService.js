const mlsService = require('./mlsService');
const { fetchWithRetry, buildODataQuery, normalizeResponse } = mlsService;
const { MLS_GRID_BASE_URL } = require('../config');

async function getProperties(params = {}) {
  const queryString = buildODataQuery(params);
  const url = `${MLS_GRID_BASE_URL}/Property?${queryString}`;
  const data = await fetchWithRetry(url);
  return normalizeResponse(data);
}

async function getPropertyById(listingId) {
  const url = `${MLS_GRID_BASE_URL}/Property?$filter=ListingId eq '${listingId}'&$expand=Media&$count=true`;
  const data = await fetchWithRetry(url);
  const normalized = normalizeResponse(data);
  return normalized.data[0] || null;
}

async function getPropertyByKey(listingKey) {
  const url = `${MLS_GRID_BASE_URL}/Property('${listingKey}')?$expand=Media`;
  const data = await fetchWithRetry(url);
  return {
    success: true,
    data: require('./mlsService').normalizeProperty(data) || null,
  };
}

async function getPropertiesByOffice(officeId, params = {}) {
  return getProperties({ ...params, officeId });
}

async function getPropertiesByAgent(memberId, params = {}) {
  return getProperties({ ...params, memberId });
}

async function getPropertiesByStatus(status, params = {}) {
  return getProperties({ ...params, status });
}

async function getPropertiesByType(propertyType, params = {}) {
  return getProperties({ ...params, propertyType });
}

async function getFeaturedProperties(params = {}) {
  return getProperties({
    ...params,
    status: 'Active',
    orderby: 'ModificationTimestamp desc',
    top: params.top || 6,
  });
}

async function getSoldProperties(params = {}) {
  return getProperties({
    ...params,
    status: 'Closed',
    orderby: 'CloseDate desc',
    top: params.top || 10,
  });
}

async function searchProperties(query, params = {}) {
  const searchParams = { ...params };

  if (query) {
    const q = query.toLowerCase();
    if (/^car\d+$/i.test(q)) {
      searchParams.listingId = q.toUpperCase();
    } else if (/^CAR\d+$/i.test(q)) {
      searchParams.listingId = q;
    } else if (/^[\w-]+$/i.test(q)) {
      searchParams.listingKey = q;
    }
  }

  return getProperties(searchParams);
}

async function getMembers(params = {}) {
  const query = buildODataQuery({ ...params, expand: false });
  const url = `${MLS_GRID_BASE_URL}/Member?${query}`;
  const data = await fetchWithRetry(url);
  return normalizeResponse(data);
}

async function getOffices(params = {}) {
  const query = buildODataQuery({ ...params, expand: false });
  const url = `${MLS_GRID_BASE_URL}/Office?${query}`;
  const data = await fetchWithRetry(url);
  return normalizeResponse(data);
}

async function getOpenHouses(params = {}) {
  const query = buildODataQuery({ ...params, expand: false });
  const url = `${MLS_GRID_BASE_URL}/OpenHouse?${query}`;
  const data = await fetchWithRetry(url);
  return normalizeResponse(data);
}

async function getLookupData() {
  const url = `${MLS_GRID_BASE_URL}/Lookup`;
  const data = await fetchWithRetry(url);
  return { success: true, data: data.value || [] };
}

async function getMedia(params = {}) {
  const query = buildODataQuery({ ...params, expand: false });
  const url = `${MLS_GRID_BASE_URL}/Media?${query}`;
  const data = await fetchWithRetry(url);
  return normalizeResponse(data);
}

async function getActiveListings(params = {}) {
  return getProperties({ ...params, status: 'Active', mlgCanView: true });
}

async function verifyConnection() {
  try {
    const url = `${MLS_GRID_BASE_URL}/Property?$top=1&$count=true`;
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

module.exports = {
  getProperties,
  getPropertyById,
  getPropertyByKey,
  getPropertiesByOffice,
  getPropertiesByAgent,
  getPropertiesByStatus,
  getPropertiesByType,
  getFeaturedProperties,
  getSoldProperties,
  searchProperties,
  getMembers,
  getOffices,
  getOpenHouses,
  getLookupData,
  getMedia,
  getActiveListings,
  verifyConnection,
};
