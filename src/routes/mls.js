const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/listingController');
const statsController = require('../controllers/statsController');
const mlsService = require('../services/mlsService');

const router = Router();

router.get('/properties', asyncHandler(controller.getListings));
router.get('/properties/featured', asyncHandler(controller.getFeaturedListings));
router.get('/properties/search', asyncHandler(controller.searchListings));
router.get('/properties/sold', asyncHandler(controller.getSoldListings));
router.get('/properties/active', asyncHandler(controller.getActiveListings));
router.get('/properties/listing/:listingId', asyncHandler(controller.getListingById));
router.get('/properties/key/:listingKey', asyncHandler(controller.getListingByKey));
router.get('/properties/office/:officeId', asyncHandler(controller.getListingsByOffice));
router.get('/properties/agent/:memberId', asyncHandler(controller.getListingsByAgent));
router.get('/properties/status/:status', asyncHandler(controller.getListingsByStatus));
router.get('/properties/type/:type', asyncHandler(controller.getListingsByType));
router.get('/properties/:id', asyncHandler(controller.getListingById));

// City-specific listings endpoint
router.get('/cities', asyncHandler(controller.getCities));
router.get('/cities/:city', asyncHandler(controller.getCityListings));

// Image proxy route — replaces direct CDN image URLs
// The browser requests /api/image/:mediaKey instead of
// hitting media-demo.mlsgrid.com directly, allowing the
// backend to cache image bytes and eliminate CDN 429 errors.
// Metrics must be registered before the :mediaKey param route.
router.get('/image/metrics', asyncHandler(controller.getImageMetrics));
router.get('/image/:mediaKey', asyncHandler(controller.serveMediaImage));

router.get('/members', asyncHandler(controller.getMembers));
router.get('/members/:memberMlsId', asyncHandler(controller.getMemberByMlsId));
router.get('/offices', asyncHandler(controller.getOffices));
router.get('/open-houses', asyncHandler(controller.getOpenHouses));
router.get('/open-houses/listings', asyncHandler(controller.getOpenHouseListings));
router.get('/open-houses/property/:listingKey', asyncHandler(controller.getPropertyOpenHouse));
router.get('/properties/comps/:listingKey', asyncHandler(controller.getComparableProperties));
router.get('/lookup', asyncHandler(controller.getLookupData));
router.get('/media', asyncHandler(controller.getMedia));
router.get('/verify', asyncHandler(controller.verifyConnection));
// Debug: inspect internal image proxy cache state
router.get('/debug/cache', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  res.json({
    imageByteCacheSize: mlsService.imageByteCache?.size || 0,
    mediaUrlStoreSize: mlsService.mediaUrlStore?.size || 0,
    mediaUrlStoreKeys: Array.from((mlsService.mediaUrlStore || new Map()).keys()).slice(0, 20),
  });
});

router.get('/company/stats', asyncHandler(statsController.getCompanyStats));

module.exports = router;
