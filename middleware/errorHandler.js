const config = require('../config/config');

/**
 * Global Error Handling Middleware
 *
 * Returns consistent JSON error responses.
 * Handles:
 * - Operational errors (with statusCode)
 * - Unknown/programming errors
 */

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';
  let errors = err.errors || null;

  // Log error in development
  if (config.nodeEnv === 'development') {
    console.error('❌ Error:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });
  }

  // Build the response
  const response = {
    success: false,
    message,
    code,
  };

  if (errors) {
    response.errors = errors;
  }

  // Include stack trace in development only
  if (config.nodeEnv === 'development' && statusCode === 500) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 Handler - for routes that don't exist
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

module.exports = { errorHandler, notFoundHandler };
