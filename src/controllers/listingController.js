const propertyService = require('../services/propertyService');
const { parseQueryParams } = require('../utils/parseQueryParams');

async function getListings(req, res, next) {
  try {
    const params = parseQueryParams(req);
    const result = await propertyService.getProperties(params);
    return res.json({
      ...result,
      page: params.skip / params.top,
      pageSize: params.top,
      hasMore: !!result.nextLink,
    });
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
    const { listingId } = req.params;
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

module.exports = {
  getListings,
  getFeaturedListings,
  getListingById,
  getListingByKey,
  getListingsByOffice,
  getListingsByAgent,
  getListingsByStatus,
  getListingsByType,
  searchListings,
  getSoldListings,
  getActiveListings,
  getMembers,
  getOffices,
  getOpenHouses,
  getLookupData,
  getMedia,
  verifyConnection,
};
