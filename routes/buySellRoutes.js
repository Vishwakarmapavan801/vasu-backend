/**
 * Buy & Sell Routes
 *
 * All routes under /api/buy-sell/...
 * All data sourced from MLS Grid API — no local database fallback.
 */

const express = require('express');
const router = express.Router();
const buySellController = require('../controllers/buySellController');

// GET /api/buy-sell — Get buy & sell listings
router.get('/', buySellController.getBuySellProperties);

// GET /api/buy-sell/search — Search buy & sell
router.get('/search', buySellController.searchBuySellProperties);

// GET /api/buy-sell/:id — Single listing
router.get('/:id', buySellController.getBuySellPropertyById);

module.exports = router;
