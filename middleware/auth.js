const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');
const AppError = require('../utils/AppError');

/**
 * Authentication Middleware
 * Verifies JWT token from cookies or Authorization header
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in cookies first (most secure for web apps)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // Fallback to Authorization header (Bearer token)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(AppError.unauthorized('Not authorized to access this route'));
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret);

      // Attach user to request object
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return next(AppError.unauthorized('User no longer exists'));
      }

      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return next(AppError.unauthorized('Token has expired'));
      }
      return next(AppError.unauthorized('Invalid token'));
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based Authorization Middleware
 * Must be used after the protect middleware
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'agent', 'user')
 * @returns {Function} Express middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Not authorized'));
    }

    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden(`User role '${req.user.role}' is not authorized to access this route`));
    }

    next();
  };
};

/**
 * Optional Authentication Middleware
 * Attaches user if token is present, but does not block if absent
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch (error) {
    // Silently fail - auth is optional
  }

  next();
};

module.exports = { protect, authorize, optionalAuth };
