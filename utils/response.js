/**
 * Response Helpers
 *
 * Standardized JSON response formatters used across all controllers.
 */

/**
 * Send a success response
 * @param {import('express').Response} res - Express response object
 * @param {Object} options - Response options
 * @param {number} [options.statusCode=200] - HTTP status code
 * @param {string} options.message - Success message
 * @param {*} options.data - Response payload
 */
function sendSuccess(res, { statusCode = 200, message = 'Success', data = null }) {
  const response = {
    success: true,
    message,
    data,
  };

  return res.status(statusCode).json(response);
}

/**
 * Send a paginated success response
 * @param {import('express').Response} res - Express response object
 * @param {Object} options - Response options
 * @param {Array} options.data - Data array
 * @param {number} options.total - Total number of records
 * @param {number} options.page - Current page number
 * @param {number} options.limit - Items per page
 * @param {string} options.message - Success message
 */
function sendPaginated(res, { data = [], total = 0, page = 1, limit = 10, message = 'Success' }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  const response = {
    success: true,
    message,
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };

  return res.status(200).json(response);
}

module.exports = { sendSuccess, sendPaginated };
