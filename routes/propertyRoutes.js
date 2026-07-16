/**
 * Property Routes
 *
 * All routes under /api/properties/...
 * These compose MLS Grid data into the application's property endpoints.
 * No MongoDB/local database fallback — all data comes from the MLS Grid API.
 */

const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');

// GET /api/properties — Get all properties (from MLS Grid)
router.get('/', propertyController.getProperties);

// GET /api/properties/featured — Get featured properties
router.get('/featured', propertyController.getFeaturedProperties);

// GET /api/properties/search — Search properties
router.get('/search', propertyController.searchProperties);

// GET /api/properties/:id — Single property (MUST be last)
router.get('/:id', propertyController.getPropertyById);

// POST /api/properties — Create property (protected)
router.post('/', propertyController.createProperty);

// PUT /api/properties/:id — Update property (protected)
router.put('/:id', propertyController.updateProperty);

// DELETE /api/properties/:id — Delete property (protected)
router.delete('/:id', propertyController.deleteProperty);

// POST /api/properties/:id/images — Upload images (protected)
router.post('/:id/images', propertyController.uploadPropertyImages);

// DELETE /api/properties/:id/images/:imageId — Delete image (protected)
router.delete('/:id/images/:imageId', propertyController.deletePropertyImage);

module.exports = router;
