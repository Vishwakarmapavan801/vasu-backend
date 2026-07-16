const mlsService = require('../services/mlsService');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');

// ========== PROPERTY ENDPOINTS ==========

/**
 * @desc    Get properties with filtering, sorting, and pagination
 * @route   GET /api/mls/properties
 * @access  Public
 */
const getListings = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      city,
      state,
      zip,
      minPrice,
      maxPrice,
      bedrooms,
      bathrooms,
      propertyType,
      status,
      sortBy,
      sortOrder,
      orderBy,
      expand,
    } = req.query;

    // Map frontend sort params to OData $orderby
    let odataOrderBy = orderBy;
    if (!odataOrderBy && sortBy) {
      const sortFieldMap = {
        price: 'ListPrice',
        date: 'ModificationTimestamp',
        createdAt: 'ModificationTimestamp',
        sqft: 'LivingArea',
        bedrooms: 'BedroomsTotal',
        bathrooms: 'BathroomsTotalInteger',
      };
      const field = sortFieldMap[sortBy] || 'ModificationTimestamp';
      const dir = sortOrder === 'asc' ? 'asc' : 'desc';
      odataOrderBy = `${field} ${dir}`;
    }

    // Default: latest listings first
    if (!odataOrderBy) {
      odataOrderBy = 'ModificationTimestamp desc';
    }

    const result = await mlsService.getMlsGridListings({
      filters: {
        city,
        state,
        zip,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        minBedrooms: bedrooms ? Number(bedrooms) : undefined,
        minBathrooms: bathrooms ? Number(bathrooms) : undefined,
        propertyType,
        status,
        canView: true,
      },
      page: Number(page),
      limit: Number(limit),
      orderBy: odataOrderBy,
      expand: expand || 'Media',
    });

    return sendPaginated(res, {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      message: 'Properties retrieved from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get featured/latest properties
 * @route   GET /api/mls/properties/featured
 * @access  Public
 */
const getFeaturedListings = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 6;
    const result = await mlsService.getMlsGridFeaturedListings(limit);

    return sendSuccess(res, {
      message: 'Featured properties retrieved from MLS Grid',
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search properties by text query
 * @route   GET /api/mls/properties/search
 * @access  Public
 */
const searchListings = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    console.log('');
    console.log('==========================================');
    console.log('  MLS Grid Controller: Search Listings');
    console.log(`  Received query param "q": "${q}"`);
    console.log(`  Received query params:`, JSON.stringify(req.query));
    console.log(`  Passing to service: query="${q}"`);
    console.log('==========================================');
    console.log('');

    if (!q || q.trim() === '') {
      throw AppError.badRequest('Search query is required');
    }

    const result = await mlsService.getMlsGridSearchResults({
      query: q,
      page: Number(page),
      limit: Number(limit),
    });

    return sendSuccess(res, {
      message: 'Search results retrieved from MLS Grid',
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single property by ID
 * @route   GET /api/mls/properties/:id
 * @access  Public
 */
const getListingById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw AppError.badRequest('Property ID is required');
    }

    // Try ListingId first, then fallback to ListingKey
    let property = await mlsService.getMlsGridListingByListingId(id);

    if (!property) {
      property = await mlsService.getMlsGridListingByListingKey(id);
    }

    if (!property) {
      throw AppError.notFound(`Property with ID '${id}' not found in MLS Grid`);
    }

    // Find similar properties (same city or property type)
    const similarResult = await mlsService.getMlsGridListings({
      filters: {
        city: property.city,
        canView: true,
      },
      page: 1,
      limit: 4,
      expand: 'Media',
    });

    const similarProperties = (similarResult.data || [])
      .filter((p) => p._id !== property._id)
      .slice(0, 4);

    return sendSuccess(res, {
      message: 'Property retrieved from MLS Grid',
      data: {
        property,
        similarProperties,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get properties by type/category
 * @route   GET /api/mls/properties/type/:propertyType
 * @access  Public
 */
const getListingsByType = async (req, res, next) => {
  try {
    const { propertyType } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    const result = await mlsService.getMlsGridListings({
      filters: {
        propertyType,
        status: status || undefined,
        canView: true,
      },
      page: Number(page),
      limit: Number(limit),
      orderBy: 'ModificationTimestamp desc',
      expand: 'Media',
    });

    return sendPaginated(res, {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      message: `${propertyType} properties retrieved from MLS Grid`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get properties by status
 * @route   GET /api/mls/properties/status/:status
 * @access  Public
 */
const getListingsByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    const { page = 1, limit = 10, propertyType } = req.query;

    const result = await mlsService.getMlsGridListings({
      filters: {
        status,
        propertyType: propertyType || undefined,
        canView: true,
      },
      page: Number(page),
      limit: Number(limit),
      orderBy: 'ModificationTimestamp desc',
      expand: 'Media',
    });

    return sendPaginated(res, {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      message: `${status} properties retrieved from MLS Grid`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get listings by office
 * @route   GET /api/mls/properties/office/:officeId
 * @access  Public
 */
const getListingsByOfficeId = async (req, res, next) => {
  try {
    const { officeId } = req.params;

    if (!officeId) {
      throw AppError.badRequest('OfficeId is required');
    }

    const result = await mlsService.getMlsGridListingsByOffice(officeId);

    return sendSuccess(res, {
      message: 'Office listings retrieved from MLS Grid',
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get sold properties
 * @route   GET /api/mls/properties/sold
 * @access  Public
 */
const getSoldListings = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await mlsService.getMlsGridListings({
      filters: { status: 'Closed', canView: true },
      limit,
      orderBy: 'ModificationTimestamp desc',
      expand: 'Media',
    });

    return sendPaginated(res, {
      data: result.data,
      total: result.total,
      page: 1,
      limit,
      message: 'Sold properties retrieved from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

// ========== EXISTING ENDPOINTS (wrapped for backward compatibility) ==========

/**
 * @desc    Get demo listings from MLS Grid
 * @route   GET /api/mls/demo
 * @access  Public
 */
const getDemoListings = async (req, res, next) => {
  try {
    const result = await mlsService.getMlsGridDemoListings();

    return sendSuccess(res, {
      message: 'Demo listings retrieved from MLS Grid',
      data: {
        properties: result.data,
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get active listings from MLS Grid
 * @route   GET /api/mls/active
 * @access  Public
 */
const getActiveListings = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await mlsService.getMlsGridActiveListings(limit);

    return sendSuccess(res, {
      message: 'Active listings retrieved from MLS Grid',
      data: {
        properties: result.data,
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get listings with media from MLS Grid
 * @route   GET /api/mls/media-listings
 * @access  Public
 */
const getListingsWithMedia = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await mlsService.getMlsGridListingsWithMedia(limit);

    return sendSuccess(res, {
      message: 'Listings with media retrieved from MLS Grid',
      data: {
        properties: result.data,
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ========== MEMBERS (AGENTS) ==========

/**
 * @desc    Get MLS Grid Members (Agents)
 * @route   GET /api/mls/members
 * @access  Public
 */
const getMembers = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await mlsService.getMlsGridMembers(limit);

    return sendSuccess(res, {
      message: 'Members retrieved from MLS Grid',
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

// ========== OFFICES ==========

/**
 * @desc    Get MLS Grid Offices
 * @route   GET /api/mls/offices
 * @access  Public
 */
const getOffices = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await mlsService.getMlsGridOffices(limit);

    return sendSuccess(res, {
      message: 'Offices retrieved from MLS Grid',
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

// ========== OPEN HOUSES ==========

/**
 * @desc    Get MLS Grid Open Houses
 * @route   GET /api/mls/open-houses
 * @access  Public
 */
const getOpenHouses = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await mlsService.getMlsGridOpenHouses(limit);

    return sendSuccess(res, {
      message: 'Open houses retrieved from MLS Grid',
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

// ========== LOOKUP ==========

/**
 * @desc    Get MLS Grid Lookup data
 * @route   GET /api/mls/lookup
 * @access  Public
 */
const getLookup = async (req, res, next) => {
  try {
    const result = await mlsService.getMlsGridLookup();

    return sendSuccess(res, {
      message: 'Lookup data retrieved from MLS Grid',
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// ========== MEDIA ==========

/**
 * @desc    Get MLS Grid Media
 * @route   GET /api/mls/media
 * @access  Public
 */
const getMedia = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await mlsService.getMlsGridMedia(limit);

    return sendSuccess(res, {
      message: 'Media retrieved from MLS Grid',
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Property endpoints
  getListings,
  getFeaturedListings,
  searchListings,
  getListingById,
  getListingsByType,
  getListingsByStatus,
  getListingsByOfficeId,
  getSoldListings,
  // Backward-compatible endpoints
  getDemoListings,
  getActiveListings,
  getListingsWithMedia,
  // Data endpoints
  getMembers,
  getOffices,
  getOpenHouses,
  getLookup,
  getMedia,
};
