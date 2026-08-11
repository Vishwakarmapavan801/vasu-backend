const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { requireAuth } = require('../../../middleware/auth');
const { requireAdmin } = require('../../../middleware/admin');
const pool = require('../../../config/database');
const ctrl = require('../controllers/monetizationController');

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, skip: () => process.env.NODE_ENV !== 'production' });

async function resolveAgent(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT id FROM agents WHERE user_id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    req.agentId = rows[0].id;
    next();
  } catch (err) { next(err); }
}

// Public
router.get('/monetization/featured-listings', limiter, asyncHandler(ctrl.getFeaturedListings));
router.get('/monetization/featured-agents', limiter, asyncHandler(ctrl.getFeaturedAgents));
router.get('/monetization/plans', limiter, asyncHandler(ctrl.getSubscriptionPlans));

// Admin-gated
router.post('/monetization/featured-listings', requireAuth, requireAdmin, resolveAgent, limiter, asyncHandler(ctrl.createFeaturedListing));
router.post('/monetization/featured-agents', requireAuth, requireAdmin, resolveAgent, limiter, asyncHandler(ctrl.createFeaturedAgent));
router.post('/monetization/plans', requireAuth, requireAdmin, limiter, asyncHandler(ctrl.createSubscriptionPlan));

// Agent-gated
router.patch('/monetization/featured-listings/:id/deactivate', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.deactivateFeaturedListing));
router.patch('/monetization/featured-agents/:id/deactivate', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.deactivateFeaturedAgent));
router.get('/monetization/subscriptions', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getAgentSubscriptions));
router.post('/monetization/subscriptions', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.createAgentSubscription));
router.patch('/monetization/subscriptions/:id/cancel', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.cancelAgentSubscription));

module.exports = router;
