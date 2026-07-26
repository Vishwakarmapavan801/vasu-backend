/**
 * Favorites Routes
 *
 * All endpoints require authentication (requireAuth middleware).
 * Manages user's saved/favorited properties stored in PostgreSQL.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/favoriteController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Rate limiting for favorites operations
const favLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// All favorites routes require authentication
router.use(requireAuth);

// List favorites (with pagination)
router.get('/', favLimiter, controller.listFavorites);

// Check if a specific property is favorited
router.get('/check/:listingKey', favLimiter, controller.checkFavorite);

// Add a favorite
router.post('/:listingKey', favLimiter, controller.addFavorite);

// Remove a favorite
router.delete('/:listingKey', favLimiter, controller.removeFavorite);

module.exports = router;
