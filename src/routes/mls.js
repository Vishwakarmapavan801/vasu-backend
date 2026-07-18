const { Router } = require('express');
const controller = require('../controllers/listingController');

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

router.get('/members', controller.getMembers);
router.get('/offices', controller.getOffices);
router.get('/open-houses', controller.getOpenHouses);
router.get('/lookup', controller.getLookupData);
router.get('/media', controller.getMedia);
router.get('/verify', controller.verifyConnection);

module.exports = router;
