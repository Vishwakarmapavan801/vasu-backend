/**
 * MLS Grid Routes
 *
 * All routes under /api/mls/...
 * These endpoints go directly to the MLS Grid API via mlsGridController.
 */

const express = require('express');
const router = express.Router();
const mlsController = require('../controllers/mlsGridController');

// ========== PROPERTY ENDPOINTS ==========

// GET /api/mls/properties — Get properties with filters & pagination
router.get('/properties', mlsController.getListings);

// GET /api/mls/properties/featured — Get featured properties
router.get('/properties/featured', mlsController.getFeaturedListings);

// GET /api/mls/properties/search — Search listings
router.get('/properties/search', mlsController.searchListings);

// GET /api/mls/properties/sold — Get sold listings
router.get('/properties/sold', mlsController.getSoldListings);

// GET /api/mls/properties/type/:propertyType — By type
router.get('/properties/type/:propertyType', mlsController.getListingsByType);

// GET /api/mls/properties/status/:status — By status
router.get('/properties/status/:status', mlsController.getListingsByStatus);

// GET /api/mls/properties/office/:officeId — By office
router.get('/properties/office/:officeId', mlsController.getListingsByOfficeId);

// GET /api/mls/properties/:id — Single listing (MUST be last to avoid catching other routes)
router.get('/properties/:id', mlsController.getListingById);

// ========== LEGACY ENDPOINTS (backward compat) ==========

router.get('/demo', mlsController.getDemoListings);
router.get('/active', mlsController.getActiveListings);
router.get('/media-listings', mlsController.getListingsWithMedia);

// ========== DATA ENDPOINTS ==========

router.get('/members', mlsController.getMembers);
router.get('/offices', mlsController.getOffices);
router.get('/open-houses', mlsController.getOpenHouses);
router.get('/lookup', mlsController.getLookup);
router.get('/media', mlsController.getMedia);

module.exports = router;
