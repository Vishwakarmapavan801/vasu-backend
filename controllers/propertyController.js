/**
 * Property Controller
 *
 * Public GET endpoints fetch data exclusively from the MLS Grid API.
 * Authenticated CRUD (create/update/delete) endpoints use the local MongoDB database
 * for agent/admin-managed property operations.
 */

const Property = require('../models/Property');
const mlsService = require('../services/mlsService');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');
const { paginate, buildPropertyFilters, buildSort } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * @desc    Get all properties with filtering, sorting, and pagination
 *          Data sourced EXCLUSIVELY from MLS Grid API
 * @route   GET /api/properties
 * @access  Public
 */
const getProperties = async (req, res, next) => {
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
    } = req.query;

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
      orderBy: 'ModificationTimestamp desc',
      expand: 'Media',
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
 * @desc    Get single property by ID (from MLS Grid)
 * @route   GET /api/properties/:id
 * @access  Public
 */
const getPropertyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try MLS Grid first
    let property = await mlsService.getMlsGridListingByListingId(id);
    if (!property) {
      property = await mlsService.getMlsGridListingByListingKey(id);
    }

    if (!property) {
      throw AppError.notFound('Property not found in MLS Grid');
    }

    // Find similar properties from MLS (same city)
    let similarProperties = [];
    if (property.city) {
      try {
        const similarResult = await mlsService.getMlsGridListings({
          filters: { city: property.city, canView: true },
          page: 1,
          limit: 5,
          expand: 'Media',
        });
        similarProperties = (similarResult.data || [])
          .filter(p => p.ListingId !== property.ListingId)
          .slice(0, 4);
      } catch (err) {
        // Similar properties are optional, don't fail if MLS errors
        logger.warn('Failed to fetch similar properties', { error: err.message });
      }
    }

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
 * @desc    Search properties with text query (from MLS Grid)
 * @route   GET /api/properties/search
 * @access  Public
 */
const searchProperties = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q || q.trim() === '') {
      throw AppError.badRequest('Search query is required');
    }

    const result = await mlsService.getMlsGridSearchResults({
      query: q,
      page: Number(page),
      limit: Number(limit),
    });

    return sendPaginated(res, {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      message: 'Search results from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get featured properties (from MLS Grid)
 * @route   GET /api/properties/featured
 * @access  Public
 */
const getFeaturedProperties = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 6;
    const result = await mlsService.getMlsGridFeaturedListings(limit);

    return sendSuccess(res, {
      message: 'Featured properties from MLS Grid',
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// ========== LOCAL DATABASE CRUD (Admin/Agent only) ==========

/**
 * @desc    Create a new property in local database
 * @route   POST /api/properties
 * @access  Private (Admin, Agent)
 */
const createProperty = async (req, res, next) => {
  try {
    if (!req.body.listingAgent) {
      req.body.listingAgent = req.user.id;
    }

    req.body.createdBy = req.user.id;
    req.body.updatedBy = req.user.id;

    const property = await Property.create(req.body);

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Property created successfully',
      data: property,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a property in local database
 * @route   PUT /api/properties/:id
 * @access  Private (Admin, Agent)
 */
const updateProperty = async (req, res, next) => {
  try {
    let property = await Property.findById(req.params.id);

    if (!property) {
      throw AppError.notFound('Property not found');
    }

    if (req.user.role === 'agent' && property.listingAgent.toString() !== req.user.id) {
      throw AppError.forbidden('You can only update your own listings');
    }

    req.body.updatedBy = req.user.id;

    property = await Property.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    return sendSuccess(res, {
      message: 'Property updated successfully',
      data: property,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a property (soft delete)
 * @route   DELETE /api/properties/:id
 * @access  Private (Admin, Agent)
 */
const deleteProperty = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      throw AppError.notFound('Property not found');
    }

    if (req.user.role === 'agent' && property.listingAgent.toString() !== req.user.id) {
      throw AppError.forbidden('You can only delete your own listings');
    }

    await property.softDelete();

    return sendSuccess(res, {
      message: 'Property deleted successfully',
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload property images
 * @route   POST /api/properties/:id/images
 * @access  Private (Admin, Agent)
 */
const uploadPropertyImages = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      throw AppError.notFound('Property not found');
    }

    if (req.user.role === 'agent' && property.listingAgent.toString() !== req.user.id) {
      throw AppError.forbidden('You can only add images to your own listings');
    }

    if (!req.files || req.files.length === 0) {
      throw AppError.badRequest('No images uploaded');
    }

    const images = req.files.map((file, index) => ({
      url: `/uploads/${file.filename}`,
      alt: `${property.title} - Image ${property.images.length + index + 1}`,
      isFeatured: property.images.length === 0 && index === 0,
    }));

    property.images.push(...images);
    await property.save();

    return sendSuccess(res, {
      message: `${images.length} image(s) uploaded successfully`,
      data: property,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a property image
 * @route   DELETE /api/properties/:id/images/:imageId
 * @access  Private (Admin, Agent)
 */
const deletePropertyImage = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      throw AppError.notFound('Property not found');
    }

    if (req.user.role === 'agent' && property.listingAgent.toString() !== req.user.id) {
      throw AppError.forbidden('You can only modify your own listings');
    }

    const imageIndex = property.images.findIndex(
      (img) => img._id.toString() === req.params.imageId
    );

    if (imageIndex === -1) {
      throw AppError.notFound('Image not found');
    }

    property.images.splice(imageIndex, 1);
    await property.save();

    return sendSuccess(res, {
      message: 'Image deleted successfully',
      data: property,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProperties,
  getPropertyById,
  searchProperties,
  getFeaturedProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  uploadPropertyImages,
  deletePropertyImage,
};
