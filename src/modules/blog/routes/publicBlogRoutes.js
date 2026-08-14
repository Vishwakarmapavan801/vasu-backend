const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const ctrl = require('../controllers/publicBlogController');

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});

// SEO feeds
router.get('/sitemap.xml', publicLimiter, asyncHandler(ctrl.sitemap));
router.get('/rss.xml', publicLimiter, asyncHandler(ctrl.rss));

// Collection + meta + detail (literal prefixes before :slug).
router.get('/posts/meta', publicLimiter, asyncHandler(ctrl.meta));
router.get('/posts', publicLimiter, asyncHandler(ctrl.list));
router.get('/posts/:slug', publicLimiter, asyncHandler(ctrl.detail));

module.exports = router;
