const { Router } = require('express');
const controller = require('../controllers/listingController');
const statsController = require('../controllers/statsController');
const mlsService = require('../services/mlsService');

const router = Router();

router.get('/properties', controller.getListings);
router.get('/properties/featured', controller.getFeaturedListings);
router.get('/properties/search', controller.searchListings);
router.get('/properties/sold', controller.getSoldListings);
router.get('/properties/active', controller.getActiveListings);
router.get('/properties/listing/:listingId', controller.getListingById);
router.get('/properties/key/:listingKey', controller.getListingByKey);
router.get('/properties/office/:officeId', controller.getListingsByOffice);
router.get('/properties/agent/:memberId', controller.getListingsByAgent);
router.get('/properties/status/:status', controller.getListingsByStatus);
router.get('/properties/type/:type', controller.getListingsByType);
router.get('/properties/:id', controller.getListingById);

// City-specific listings endpoint
router.get('/cities', controller.getCities);
router.get('/cities/:city', controller.getCityListings);

// Image proxy route — replaces direct CDN image URLs
// The browser requests /api/image/:mediaKey instead of
// hitting media-demo.mlsgrid.com directly, allowing the
// backend to cache image bytes and eliminate CDN 429 errors.
router.get('/image/:mediaKey', controller.serveMediaImage);

router.get('/members', controller.getMembers);
router.get('/offices', controller.getOffices);
router.get('/open-houses', controller.getOpenHouses);
router.get('/open-houses/listings', controller.getOpenHouseListings);
router.get('/open-houses/property/:listingKey', controller.getPropertyOpenHouse);
router.get('/properties/comps/:listingKey', controller.getComparableProperties);
router.get('/lookup', controller.getLookupData);
router.get('/media', controller.getMedia);
router.get('/verify', controller.verifyConnection);
// Debug: inspect internal image proxy cache state
router.get('/debug/cache', (req, res) => {
  res.json({
    imageByteCacheSize: mlsService.imageByteCache?.size || 0,
    mediaUrlStoreSize: mlsService.mediaUrlStore?.size || 0,
    mediaUrlStoreKeys: Array.from((mlsService.mediaUrlStore || new Map()).keys()).slice(0, 20),
  });
});

router.get('/company/stats', statsController.getCompanyStats);

module.exports = router;
