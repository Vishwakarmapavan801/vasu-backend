/**
 * Contact Routes
 *
 * All routes under /api/contact/...
 */

const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

router.post('/', contactController.submitContact);

module.exports = router;
