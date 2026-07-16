/**
 * Land Routes
 *
 * All routes under /api/land/...
 * All data sourced from MLS Grid API — no local database fallback.
 */

const express = require('express');
const router = express.Router();
const landController = require('../controllers/landController');

router.get('/', landController.getLandProperties);
router.get('/search', landController.searchLandProperties);
router.get('/:id', landController.getLandPropertyById);

module.exports = router;
