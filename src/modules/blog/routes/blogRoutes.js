const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const ctrl = require('../controllers/blogController');

const router = Router();

// Public read-only API. Rate limit only bites in production (matches the
// pattern used across insights/mls routes).
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: () => process.env.NODE_ENV !== 'production',
});

router.get('/', publicLimiter, asyncHandler(ctrl.list));
router.get('/meta', publicLimiter, asyncHandler(ctrl.meta));
router.get('/stats', publicLimiter, asyncHandler(ctrl.stats));
router.get('/featured', publicLimiter, asyncHandler(ctrl.featured));
// NOTE: /:slug MUST be declared last so /meta, /stats, /featured win.
router.get('/:slug', publicLimiter, asyncHandler(ctrl.detail));

module.exports = router;
