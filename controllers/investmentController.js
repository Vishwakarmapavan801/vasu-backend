/**
 * Investment & Development Controller
 *
 * All investment property data sourced exclusively from the MLS Grid API.
 * No local database fallback — returns empty results or errors.
 */

const mlsService = require('../services/mlsService');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');

/**
 * @desc    Get Investment & Development properties
 * @route   GET /api/investment
 * @access  Public
 */
const getInvestmentProperties = async (req, res, next) => {
  try {
    const mlsResult = await mlsService.getInvestmentProperties(req.query);

    return sendPaginated(res, {
      data: mlsResult.data,
      total: mlsResult.total,
      page: mlsResult.page || 1,
      limit: mlsResult.limit || 10,
      message: 'Investment properties retrieved from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single Investment property by ID
 * @route   GET /api/investment/:id
 * @access  Public
 */
const getInvestmentPropertyById = async (req, res, next) => {
  try {
    const mlsProperty = await mlsService.getPropertyById(req.params.id);

    if (!mlsProperty) {
      throw AppError.notFound('Investment property not found in MLS Grid');
    }

    return sendSuccess(res, {
      message: 'Investment property retrieved from MLS Grid',
      data: { property: mlsProperty, similarProperties: [] },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search Investment properties
 * @route   GET /api/investment/search
 * @access  Public
 */
const searchInvestmentProperties = async (req, res, next) => {
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
      message: 'Investment search results from MLS Grid',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvestmentProperties,
  getInvestmentPropertyById,
  searchInvestmentProperties,
};
