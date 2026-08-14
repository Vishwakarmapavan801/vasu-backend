/**
 * Form Routes
 *
 * All user-facing form submission endpoints.
 * Every route enforces CAPTCHA verification (via Turnstile middleware)
 * BEFORE processing any data. If CAPTCHA fails, no data is stored,
 * no email is sent, and no business logic executes.
 *
 * Each route validates input, inserts into PostgreSQL, and returns a response.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/formController');
const { verifyCaptcha } = require('../middleware/verifyCaptcha');

const router = Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// Public form submissions (all rate-limited & CAPTCHA-protected)
// CAPTCHA is verified BEFORE rate limiting to prevent
// wasted rate limit budget on invalid bot traffic.
router.post('/contact', verifyCaptcha, formLimiter, asyncHandler(controller.submitContact));
router.post('/tours', verifyCaptcha, formLimiter, asyncHandler(controller.submitTour));
router.post('/property-inquiries', verifyCaptcha, formLimiter, asyncHandler(controller.submitPropertyInquiry));
router.post('/home-valuations', verifyCaptcha, formLimiter, asyncHandler(controller.submitHomeValuation));
router.post('/newsletter', formLimiter, asyncHandler(controller.submitNewsletter));
router.post('/careers', verifyCaptcha, formLimiter, asyncHandler(controller.submitCareerApplication));
router.post('/onboarding', verifyCaptcha, formLimiter, asyncHandler(controller.submitOnboarding));
router.post('/pre-approval', verifyCaptcha, formLimiter, asyncHandler(controller.submitPreApproval));
router.post('/seller-request', verifyCaptcha, formLimiter, asyncHandler(controller.submitSellerRequest));
router.post('/ai-demo', verifyCaptcha, formLimiter, asyncHandler(controller.submitAIDemo));
router.post('/ai-contact', verifyCaptcha, formLimiter, asyncHandler(controller.submitAIContact));
router.post('/buyer-agent', verifyCaptcha, formLimiter, asyncHandler(controller.submitBuyerAgentRequest));
router.post('/property-agent-inquiry', verifyCaptcha, formLimiter, asyncHandler(controller.submitPropertyAgentInquiry));
router.post('/request-callback', verifyCaptcha, formLimiter, asyncHandler(controller.submitCallbackRequest));
router.post('/quick-question', verifyCaptcha, formLimiter, asyncHandler(controller.submitQuickQuestion));

// Alias: /submit-application maps to /careers for the JobApplicationForm component
router.post('/submit-application', verifyCaptcha, formLimiter, asyncHandler(controller.submitCareerApplication));

module.exports = router;
