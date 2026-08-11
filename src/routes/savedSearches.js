const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/savedSearchController');
const { requireAuth } = require('../middleware/auth');

const router = Router();
const limiter = rateLimit({ windowMs: 15*60*1000, max: 100, skip: () => process.env.NODE_ENV !== 'production' });

router.use(requireAuth);
router.get('/', limiter, asyncHandler(controller.listSavedSearches));
router.get('/:id', limiter, asyncHandler(controller.getSavedSearch));
router.post('/', limiter, asyncHandler(controller.createSavedSearch));
router.put('/:id', limiter, asyncHandler(controller.updateSavedSearch));
router.delete('/:id', limiter, asyncHandler(controller.deleteSavedSearch));

module.exports = router;
