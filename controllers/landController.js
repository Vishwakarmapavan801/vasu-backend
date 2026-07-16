/**
 * Land Controller
 *
 * All land property data sourced exclusively from the MLS Grid API.
 * No local database fallback — returns empty results or errors.
 */

const mlsService = require('../services/mlsService');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');

/**
 * @desc    Get Land properties
 * @route   GET /api/land
 * @access  Public
 */
const getLandProperties = async (req, res, next) => {
  try {
    const mlsResult = await mlsService.getLandProperties(req.query);

    return sendPaginated(res, {
      data: mlsResult.data,
      total: mlsResult.total,
      page: mlsResult.page || 1,
      limit: mlsResult.limit || 10,
      message: 'Land properties retrieved from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single Land property by ID
 * @route   GET /api/land/:id
 * @access  Public
 */
const getLandPropertyById = async (req, res, next) => {
  try {
    const mlsProperty = await mlsService.getPropertyById(req.params.id);

    if (!mlsProperty) {
      throw AppError.notFound('Land property not found in MLS Grid');
    }

    return sendSuccess(res, {
      message: 'Land property retrieved from MLS Grid',
      data: { property: mlsProperty, similarProperties: [] },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search Land properties
 * @route   GET /api/land/search
 * @access  Public
 */
const searchLandProperties = async (req, res, next) => {
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
      message: 'Land search results from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLandProperties,
  getLandPropertyById,
  searchLandProperties,
};
