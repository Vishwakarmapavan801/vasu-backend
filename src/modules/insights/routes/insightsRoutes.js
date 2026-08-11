const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { requireAuth, optionalAuth } = require('../../../middleware/auth');
const pool = require('../../../config/database');
const ctrl = require('../controllers/insightsController');

const router = Router();
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, skip: () => process.env.NODE_ENV !== 'production' });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, skip: () => process.env.NODE_ENV !== 'production' });

async function resolveAgent(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT id FROM agents WHERE user_id = $1', [req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Agent profile not found. Create an agent profile first.' });
    }
    req.agentId = rows[0].id;
    next();
  } catch (err) { next(err); }
}

// Comparisons (auth required)
router.get('/comparisons', requireAuth, authLimiter, asyncHandler(ctrl.getComparisons));
router.get('/comparisons/:id', requireAuth, authLimiter, asyncHandler(ctrl.getComparison));
router.post('/comparisons', requireAuth, authLimiter, asyncHandler(ctrl.createComparison));
router.patch('/comparisons/:id', requireAuth, authLimiter, asyncHandler(ctrl.updateComparison));
router.delete('/comparisons/:id', requireAuth, authLimiter, asyncHandler(ctrl.deleteComparison));

// Mortgage (public calculation, auth to save)
router.post('/mortgage/calculate', publicLimiter, asyncHandler(ctrl.calculateMortgage));
router.post('/mortgage/save', optionalAuth, authLimiter, asyncHandler(ctrl.saveMortgage));

// AI Recommendations (auth required)
router.get('/ai/recommendations', requireAuth, authLimiter, asyncHandler(ctrl.getAIRecommendations));
router.post('/ai/recommendations', requireAuth, authLimiter, asyncHandler(ctrl.saveAIRecommendation));
router.get('/ai/market-reports/:location', publicLimiter, asyncHandler(ctrl.getMarketReports));
router.post('/ai/market-reports', optionalAuth, authLimiter, asyncHandler(ctrl.saveMarketReport));

// Analytics Events (optional auth for tracking)
router.post('/analytics/track', optionalAuth, publicLimiter, asyncHandler(ctrl.trackEvent));
router.get('/analytics', requireAuth, authLimiter, asyncHandler(ctrl.getAnalytics));
router.get('/analytics/listing/:listingKey', publicLimiter, asyncHandler(ctrl.getListingAnalytics));

// Listing Metadata (auth for agent operations)
router.get('/listings/:listingKey/metadata', publicLimiter, asyncHandler(ctrl.getListingMeta));
router.put('/listings/:listingKey/metadata', requireAuth, resolveAgent, authLimiter, asyncHandler(ctrl.upsertListingMeta));

// Feed Events (public read, auth write)
router.get('/feed-events', publicLimiter, asyncHandler(ctrl.getFeedEvents));
router.post('/feed-events', requireAuth, resolveAgent, authLimiter, asyncHandler(ctrl.createFeedEvent));

// Open Houses (public read, auth write)
router.get('/open-houses', publicLimiter, asyncHandler(ctrl.getOpenHouses));
router.post('/open-houses', requireAuth, resolveAgent, authLimiter, asyncHandler(ctrl.createOpenHouse));

// AI Investment Scores (public read, auth upsert)
router.get('/ai/investment-score/:listingKey', publicLimiter, asyncHandler(ctrl.getInvestmentScore));
router.post('/ai/investment-score', requireAuth, resolveAgent, authLimiter, asyncHandler(ctrl.upsertInvestmentScore));

// AI Rental Estimates (public read, auth upsert)
router.get('/ai/rental-estimate/:listingKey', publicLimiter, asyncHandler(ctrl.getRentalEstimate));
router.post('/ai/rental-estimate', requireAuth, resolveAgent, authLimiter, asyncHandler(ctrl.upsertRentalEstimate));

// Analytics Daily (agent-gated)
router.get('/analytics/daily', requireAuth, resolveAgent, authLimiter, asyncHandler(ctrl.getAnalyticsDaily));
router.post('/analytics/daily', requireAuth, resolveAgent, authLimiter, asyncHandler(ctrl.upsertAnalyticsDaily));

module.exports = router;
