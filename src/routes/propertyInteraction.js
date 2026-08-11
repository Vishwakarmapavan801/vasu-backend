const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/propertyInteractionController');

const router = Router();

router.get('/property-history/:listingKey', asyncHandler(controller.getHistory));

router.get('/recently-viewed', requireAuth, asyncHandler(controller.getRecentlyViewed));
router.post('/recently-viewed', requireAuth, asyncHandler(controller.addRecentlyViewed));
router.delete('/recently-viewed', requireAuth, asyncHandler(controller.clearRecentlyViewed));

router.get('/comparisons', requireAuth, asyncHandler(controller.getComparisons));
router.post('/comparisons', requireAuth, asyncHandler(controller.createComparison));
router.post('/comparisons/:id/listings', requireAuth, asyncHandler(controller.addToComparison));
router.delete('/comparisons/:id/listings/:listingKey', requireAuth, asyncHandler(controller.removeFromComparison));
router.delete('/comparisons/:id', requireAuth, asyncHandler(controller.deleteComparison));

module.exports = router;
