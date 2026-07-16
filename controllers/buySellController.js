/**
 * Buy & Sell Controller
 *
 * All buy/sell property data sourced exclusively from the MLS Grid API.
 * No local database fallback — returns empty results or errors.
 */

const mlsService = require('../services/mlsService');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');

/**
 * @desc    Get Buy & Sell properties
 * @route   GET /api/buy-sell
 * @access  Public
 */
const getBuySellProperties = async (req, res, next) => {
  try {
    const mlsResult = await mlsService.getBuySellProperties(req.query);

    return sendPaginated(res, {
      data: mlsResult.data,
      total: mlsResult.total,
      page: mlsResult.page || 1,
      limit: mlsResult.limit || 10,
      message: 'Buy & Sell properties retrieved from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single Buy & Sell property by ID
 * @route   GET /api/buy-sell/:id
 * @access  Public
 */
const getBuySellPropertyById = async (req, res, next) => {
  try {
    const mlsProperty = await mlsService.getPropertyById(req.params.id);

    if (!mlsProperty) {
      throw AppError.notFound('Buy & Sell property not found in MLS Grid');
    }

    return sendSuccess(res, {
      message: 'Buy & Sell property retrieved from MLS Grid',
      data: { property: mlsProperty, similarProperties: [] },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search Buy & Sell properties
 * @route   GET /api/buy-sell/search
 * @access  Public
 */
const searchBuySellProperties = async (req, res, next) => {
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
      message: 'Buy & Sell search results from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBuySellProperties,
  getBuySellPropertyById,
  searchBuySellProperties,
};
