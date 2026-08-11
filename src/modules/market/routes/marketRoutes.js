const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { optionalAuth, requireAuth } = require('../../../middleware/auth');
const ctrl = require('../controllers/marketController');

const router = Router();
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, skip: () => process.env.NODE_ENV !== 'production' });

router.get('/neighborhoods', publicLimiter, asyncHandler(ctrl.getNeighborhoods));
router.get('/neighborhoods/:id', publicLimiter, asyncHandler(ctrl.getNeighborhood));
router.get('/cities/:city/neighborhoods', publicLimiter, asyncHandler(ctrl.getCityNeighborhoods));
router.get('/zips', publicLimiter, asyncHandler(ctrl.getZipCodes));
router.get('/zips/:zip', publicLimiter, asyncHandler(ctrl.getZipDetail));
router.get('/schools', publicLimiter, asyncHandler(ctrl.getSchools));
router.get('/schools/:id', publicLimiter, asyncHandler(ctrl.getSchool));
router.get('/neighborhoods/:id/schools', publicLimiter, asyncHandler(ctrl.getNeighborhoodSchools));
router.get('/commute', publicLimiter, asyncHandler(ctrl.getCommute));
router.get('/nearby', publicLimiter, asyncHandler(ctrl.getNearby));
router.get('/trending/topics', publicLimiter, asyncHandler(ctrl.getTrending));
router.get('/market-summary/:location', publicLimiter, asyncHandler(ctrl.getMarketSummary));

// Local Intel
router.get('/local-intel/:locationType/:locationName', publicLimiter, asyncHandler(ctrl.getLocalIntel));
router.post('/local-intel', requireAuth, publicLimiter, asyncHandler(ctrl.upsertLocalIntel));
router.get('/local-intel/subdivision/:subdivision', publicLimiter, asyncHandler(ctrl.getLocalIntelBySubdivision));
router.get('/local-intel/listing/:listingKey', publicLimiter, asyncHandler(ctrl.getLocalIntelByListing));
router.post('/local-intel/map', requireAuth, publicLimiter, asyncHandler(ctrl.upsertLocalIntelMap));

module.exports = router;
