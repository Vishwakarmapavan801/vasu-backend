/**
 * User Routes
 *
 * All routes under /api/users/...
 * Protected routes for authenticated users.
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.put('/profile', protect, userController.updateProfile);
router.get('/saved-properties', protect, userController.getSavedProperties);
router.post('/saved-properties/:propertyId', protect, userController.saveProperty);
router.delete('/saved-properties/:propertyId', protect, userController.removeSavedProperty);

module.exports = router;
