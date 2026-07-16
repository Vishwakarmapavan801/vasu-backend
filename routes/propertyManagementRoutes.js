/**
 * Property Management Routes
 *
 * All routes under /api/property-management/...
 * All data sourced from MLS Grid API — no local database fallback.
 */

const express = require('express');
const router = express.Router();
const propertyManagementController = require('../controllers/propertyManagementController');

router.get('/', propertyManagementController.getPropertyManagementListings);
router.get('/search', propertyManagementController.searchPropertyManagementListings);
router.get('/:id', propertyManagementController.getPropertyManagementListingById);

module.exports = router;
