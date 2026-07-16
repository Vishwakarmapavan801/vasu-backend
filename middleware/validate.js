const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

/**
 * Validation Middleware
 *
 * Checks the results of express-validator validations and returns
 * a formatted error response if validation fails.
 * Must be used after defining validation rules with express-validator.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));

    throw AppError.badRequest('Validation failed', formattedErrors);
  }

  next();
};

module.exports = validate;
