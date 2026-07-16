/**
 * Multifamily Controller
 *
 * All multifamily property data sourced exclusively from the MLS Grid API.
 * No local database fallback — returns empty results or errors.
 */

const mlsService = require('../services/mlsService');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');

/**
 * @desc    Get Multifamily properties
 * @route   GET /api/multifamily
 * @access  Public
 */
const getMultifamilyProperties = async (req, res, next) => {
  try {
    const mlsResult = await mlsService.getMultifamilyProperties(req.query);

    return sendPaginated(res, {
      data: mlsResult.data,
      total: mlsResult.total,
      page: mlsResult.page || 1,
      limit: mlsResult.limit || 10,
      message: 'Multifamily properties retrieved from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single Multifamily property by ID
 * @route   GET /api/multifamily/:id
 * @access  Public
 */
const getMultifamilyPropertyById = async (req, res, next) => {
  try {
    const mlsProperty = await mlsService.getPropertyById(req.params.id);

    if (!mlsProperty) {
      throw AppError.notFound('Multifamily property not found in MLS Grid');
    }

    return sendSuccess(res, {
      message: 'Multifamily property retrieved from MLS Grid',
      data: { property: mlsProperty, similarProperties: [] },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search Multifamily properties
 * @route   GET /api/multifamily/search
 * @access  Public
 */
const searchMultifamilyProperties = async (req, res, next) => {
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
      message: 'Multifamily search results from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMultifamilyProperties,
  getMultifamilyPropertyById,
  searchMultifamilyProperties,
};
