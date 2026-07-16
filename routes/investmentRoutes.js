/**
 * Investment & Development Routes
 *
 * All routes under /api/investment/...
 * All data sourced from MLS Grid API — no local database fallback.
 */

const express = require('express');
const router = express.Router();
const investmentController = require('../controllers/investmentController');

router.get('/', investmentController.getInvestmentProperties);
router.get('/search', investmentController.searchInvestmentProperties);
router.get('/:id', investmentController.getInvestmentPropertyById);

module.exports = router;
