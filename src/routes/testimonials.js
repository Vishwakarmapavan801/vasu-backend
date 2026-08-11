const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { getTestimonials } = require('../controllers/testimonialController');

router.get('/', asyncHandler(getTestimonials));

module.exports = router;
