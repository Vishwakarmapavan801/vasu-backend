/**
 * Favorites Routes
 *
 * All endpoints require authentication (requireAuth middleware).
 * Manages user's saved/favorited properties stored in PostgreSQL.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/favoriteController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Rate limiting for favorites operations
const favLimiter = rateLimit({
  skip: () => process.env.NODE_ENV !== 'production',
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// All favorites routes require authentication
router.use(requireAuth);

// List favorites (with pagination)
router.get('/', favLimiter, asyncHandler(controller.listFavorites));

// Check if a specific property is favorited
router.get('/check/:listingKey', favLimiter, asyncHandler(controller.checkFavorite));

// Add a favorite
router.post('/:listingKey', favLimiter, asyncHandler(controller.addFavorite));

// Remove a favorite
router.delete('/:listingKey', favLimiter, asyncHandler(controller.removeFavorite));

module.exports = router;
