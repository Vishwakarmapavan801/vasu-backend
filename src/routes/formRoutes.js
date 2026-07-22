/**
 * Form Routes
 *
 * All user-facing form submission endpoints.
 * Each route validates input, inserts into PostgreSQL, and returns a response.
 */

const { Router } = require('express');
const controller = require('../controllers/formController');

const router = Router();

// Public form submissions
router.post('/contact', controller.submitContact);
router.post('/tours', controller.submitTour);
router.post('/property-inquiries', controller.submitPropertyInquiry);
router.post('/home-valuations', controller.submitHomeValuation);
router.post('/newsletter', controller.submitNewsletter);
router.post('/careers', controller.submitCareerApplication);
router.post('/onboarding', controller.submitOnboarding);
router.post('/pre-approval', controller.submitPreApproval);
router.post('/seller-request', controller.submitSellerRequest);
router.post('/ai-demo', controller.submitAIDemo);
router.post('/ai-contact', controller.submitAIContact);

module.exports = router;
