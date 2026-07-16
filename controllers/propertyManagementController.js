/**
 * Property Management Controller
 *
 * All property management (rental) data sourced exclusively from the MLS Grid API.
 * No local database fallback — returns empty results or errors.
 */

const mlsService = require('../services/mlsService');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');

/**
 * @desc    Get Property Management listings
 * @route   GET /api/property-management
 * @access  Public
 */
const getPropertyManagementListings = async (req, res, next) => {
  try {
    const mlsResult = await mlsService.getPropertyManagementProperties(req.query);

    return sendPaginated(res, {
      data: mlsResult.data,
      total: mlsResult.total,
      page: mlsResult.page || 1,
      limit: mlsResult.limit || 10,
      message: 'Property Management listings retrieved from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single Property Management listing by ID
 * @route   GET /api/property-management/:id
 * @access  Public
 */
const getPropertyManagementListingById = async (req, res, next) => {
  try {
    const mlsProperty = await mlsService.getPropertyById(req.params.id);

    if (!mlsProperty) {
      throw AppError.notFound('Property Management listing not found in MLS Grid');
    }

    return sendSuccess(res, {
      message: 'Property Management listing retrieved from MLS Grid',
      data: { property: mlsProperty, similarProperties: [] },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search Property Management listings
 * @route   GET /api/property-management/search
 * @access  Public
 */
const searchPropertyManagementListings = async (req, res, next) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || q.trim() === '') {
      throw AppError.badRequest('Search query is required');
    }

    const mlsResult = await mlsService.searchProperties({
      query: q,
      page: page || 1,
      limit: limit || 10,
    });

    return sendPaginated(res, {
      data: mlsResult.data,
      total: mlsResult.total,
      page: mlsResult.page || 1,
      limit: mlsResult.limit || 10,
      message: 'Property Management search results from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPropertyManagementListings,
  getPropertyManagementListingById,
  searchPropertyManagementListings,
};
