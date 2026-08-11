const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/agentContactController');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = Router();
const limiter = rateLimit({ windowMs: 15*60*1000, max: 50, skip: () => process.env.NODE_ENV !== 'production' });

// Contact an agent (public, with optional auth for user_id tracking)
router.post('/:agentId/contact', optionalAuth, limiter, asyncHandler(controller.contactAgent));

// Saved agents (require auth)
router.get('/saved', requireAuth, limiter, asyncHandler(controller.listSavedAgents));
router.post('/:agentId/save', requireAuth, limiter, asyncHandler(controller.saveAgent));
router.delete('/:agentId/save', requireAuth, limiter, asyncHandler(controller.unsaveAgent));

module.exports = router;
