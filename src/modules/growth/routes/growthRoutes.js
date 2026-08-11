const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { requireAuth } = require('../../../middleware/auth');
const ctrl = require('../controllers/growthController');

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, skip: () => process.env.NODE_ENV !== 'production' });

router.use(requireAuth);

// Suggested Agents
router.get('/growth/suggested-agents', limiter, asyncHandler(ctrl.getSuggestedAgents));
router.post('/growth/suggested-agents', limiter, asyncHandler(ctrl.createSuggestedAgent));
router.patch('/growth/suggested-agents/:id/dismiss', limiter, asyncHandler(ctrl.dismissSuggestedAgent));
router.patch('/growth/suggested-agents/:id/click', limiter, asyncHandler(ctrl.clickSuggestedAgent));

// Suggested Listings
router.get('/growth/suggested-listings', limiter, asyncHandler(ctrl.getSuggestedListings));
router.post('/growth/suggested-listings', limiter, asyncHandler(ctrl.createSuggestedListing));
router.patch('/growth/suggested-listings/:id/dismiss', limiter, asyncHandler(ctrl.dismissSuggestedListing));

// Feed Scores
router.get('/growth/feed-scores', limiter, asyncHandler(ctrl.getFeedScores));
router.post('/growth/feed-scores/compute', limiter, asyncHandler(ctrl.computeFeedScores));

module.exports = router;
