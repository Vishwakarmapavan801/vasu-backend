/**
 * Multifamily Routes
 *
 * All routes under /api/multifamily/...
 * All data sourced from MLS Grid API — no local database fallback.
 */

const express = require('express');
const router = express.Router();
const multifamilyController = require('../controllers/multifamilyController');

router.get('/', multifamilyController.getMultifamilyProperties);
router.get('/search', multifamilyController.searchMultifamilyProperties);
router.get('/:id', multifamilyController.getMultifamilyPropertyById);

module.exports = router;
