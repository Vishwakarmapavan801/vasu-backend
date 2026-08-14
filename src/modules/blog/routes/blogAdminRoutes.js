const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('../../../middleware/admin');
const asyncHandler = require('../../../middleware/asyncHandler');
const ctrl = require('../controllers/blogAdminController');

const router = Router();

// All blog admin routes require an authenticated admin with the 'posts'
// permission (content_manager / moderator / admin / super_admin).
router.use(requireAuth, requireRole('posts'));

// Generation is expensive + calls external APIs — rate limit hard.
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many blog generations. Try again later.' },
});

router.get('/mcp-status', asyncHandler(ctrl.mcpStatus));
router.get('/jobs', asyncHandler(ctrl.jobs));
router.get('/jobs/:id', asyncHandler(ctrl.jobDetail));

router.get('/', asyncHandler(ctrl.list));
router.post('/generate', generateLimiter, asyncHandler(ctrl.generate));

// NOTE: /:id routes MUST be declared after /jobs and /generate so the
// literal prefixes win.
router.get('/:id', asyncHandler(ctrl.detail));
router.post('/:id/regenerate', generateLimiter, asyncHandler(ctrl.regenerate));
router.post('/:id/approve', asyncHandler(ctrl.approve));
router.post('/:id/publish', asyncHandler(ctrl.publish));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
