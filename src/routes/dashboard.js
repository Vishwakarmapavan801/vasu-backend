const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.get('/', requireAuth, asyncHandler(controller.getDashboard));

module.exports = router;
