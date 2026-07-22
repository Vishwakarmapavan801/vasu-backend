/**
 * Parse query parameters from Express request into a normalized params object.
 * Supports both direct filters and free-text search via 'q'.
 */
function parseQueryParams(req) {
  const {
    // Free-text search
    q,
    // Direct filters (filterable in MLS Grid)
    listingId,
    listingKey,
    officeId,
    memberId,
    status,
    propertyType,
    originatingSystem,
    mlgCanView,
    // Direct filters (local-only, not filterable in MLS Grid)
    city,
    state,
    zip,
    postalCode,
    streetNumber,
    streetName,
    county,
    neighborhood,
    subdivision,
    // Numeric filters (local-only)
    priceMin,
    priceMax,
    minPrice,
    maxPrice,
    beds,
    minBeds,
    baths,
    minBaths,
    sqftMin,
    sqftMax,
    minSqft,
    maxSqft,
    // Pagination & sorting
    top,
    limit,
    skip,
    page,
    orderby,
    sortBy,
    sortOrder,
  } = req.query;

  const params = {};

  // Free-text search
  if (q) params.q = q;

  // Direct filterable fields
  if (listingId) params.listingId = listingId;
  if (listingKey) params.listingKey = listingKey;
  if (officeId) params.officeId = officeId;
  if (memberId) params.memberId = memberId;
  if (status) params.status = status;
  if (propertyType) params.propertyType = propertyType;
  if (originatingSystem) params.originatingSystem = originatingSystem;
  if (mlgCanView === 'true' || mlgCanView === true) params.mlgCanView = true;

  // Local filter fields
  if (city) params.city = city;
  if (state) params.state = state;
  if (zip) params.zip = zip;
  if (postalCode) params.postalCode = postalCode;
  if (streetNumber) params.streetNumber = streetNumber;
  if (streetName) params.streetName = streetName;
  if (county) params.county = county;
  if (neighborhood) params.neighborhood = neighborhood;
  if (subdivision) params.subdivision = subdivision;

  // Numeric filters
  const pMin = priceMin || minPrice;
  const pMax = priceMax || maxPrice;
  if (pMin) params.priceMin = Number(pMin);
  if (pMax) params.priceMax = Number(pMax);

  const b = beds || minBeds;
  if (b) params.beds = Number(b);

  const ba = baths || minBaths;
  if (ba) params.baths = Number(ba);

  const sqMin = sqftMin || minSqft;
  const sqMax = sqftMax || maxSqft;
  if (sqMin) params.minSqft = Number(sqMin);
  if (sqMax) params.maxSqft = Number(sqMax);

  // Pagination
  const requestedTop = parseInt(limit || top, 10);
  params.top = !isNaN(requestedTop) && requestedTop > 0 ? requestedTop : 20;

  const pageNum = parseInt(page || 0, 10);
  const requestedSkip = parseInt(skip || 0, 10);
  params.skip = pageNum > 1 ? (pageNum - 1) * params.top : Math.max(0, requestedSkip);

  // Sorting
  if (orderby) {
    params.orderby = orderby;
  } else if (sortBy) {
    const dir = sortOrder === 'asc' || sortOrder === 'ascending' ? 'asc' : 'desc';
    params.orderby = `${sortBy} ${dir}`;
  }

  return params;
}

module.exports = { parseQueryParams };
