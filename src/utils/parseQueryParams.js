function parseQueryParams(req) {
  const {
    q,
    listingId,
    listingKey,
    officeId,
    memberId,
    status,
    city,
    priceMin,
    priceMax,
    minPrice,
    maxPrice,
    beds,
    minBeds,
    baths,
    minBaths,
    propertyType,
    originatingSystem,
    top,
    limit,
    skip,
    orderby,
    sortBy,
    sortOrder,
    mlgCanView,
  } = req.query;

  const params = {};

  if (originatingSystem) params.originatingSystem = originatingSystem;

  if (listingId) params.listingId = listingId;
  if (listingKey) params.listingKey = listingKey;
  if (officeId) params.officeId = officeId;
  if (memberId) params.memberId = memberId;
  if (status) params.status = status;
  if (city) params.city = city;

  const pMin = priceMin || minPrice;
  const pMax = priceMax || maxPrice;
  if (pMin) params.priceMin = pMin;
  if (pMax) params.priceMax = pMax;

  const b = beds || minBeds;
  if (b) params.beds = b;

  const ba = baths || minBaths;
  if (ba) params.baths = ba;

  if (propertyType) params.propertyType = propertyType;

  params.top = parseInt(limit || top || 20, 10);
  params.skip = parseInt(skip || 0, 10);

  if (mlgCanView === 'true') params.mlgCanView = true;

  if (orderby) {
    params.orderby = orderby;
  } else if (sortBy) {
    params.orderby = `${sortBy} ${sortOrder === 'desc' ? 'desc' : 'asc'}`;
  }

  return params;
}

module.exports = { parseQueryParams };
