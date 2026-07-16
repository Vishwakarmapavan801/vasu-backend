/**
 * AppError — Custom operational error class
 *
 * Extends Error with HTTP status code, error code, and optional errors array.
 * Includes static factory methods for common HTTP error responses.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors = null) {
    return new AppError(message, 400, 'BAD_REQUEST', errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message = 'Resource already exists') {
    return new AppError(message, 409, 'CONFLICT');
  }

  static tooMany(message = 'Too many requests') {
    return new AppError(message, 429, 'RATE_LIMIT');
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }

  static mlsError(message = 'MLS Grid API error') {
    return new AppError(message, 502, 'MLS_API_ERROR');
  }
}

module.exports = AppError;
