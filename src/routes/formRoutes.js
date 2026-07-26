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
const controller = require('../controllers/formController');
const { verifyCaptcha } = require('../middleware/verifyCaptcha');

const router = Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// Public form submissions (all rate-limited & CAPTCHA-protected)
// CAPTCHA is verified BEFORE rate limiting to prevent
// wasted rate limit budget on invalid bot traffic.
router.post('/contact', verifyCaptcha, formLimiter, controller.submitContact);
router.post('/tours', verifyCaptcha, formLimiter, controller.submitTour);
router.post('/property-inquiries', verifyCaptcha, formLimiter, controller.submitPropertyInquiry);
router.post('/home-valuations', verifyCaptcha, formLimiter, controller.submitHomeValuation);
router.post('/newsletter', verifyCaptcha, formLimiter, controller.submitNewsletter);
router.post('/careers', verifyCaptcha, formLimiter, controller.submitCareerApplication);
router.post('/onboarding', verifyCaptcha, formLimiter, controller.submitOnboarding);
router.post('/pre-approval', verifyCaptcha, formLimiter, controller.submitPreApproval);
router.post('/seller-request', verifyCaptcha, formLimiter, controller.submitSellerRequest);
router.post('/ai-demo', verifyCaptcha, formLimiter, controller.submitAIDemo);
router.post('/ai-contact', verifyCaptcha, formLimiter, controller.submitAIContact);
router.post('/buyer-agent', verifyCaptcha, formLimiter, controller.submitBuyerAgentRequest);
router.post('/property-agent-inquiry', verifyCaptcha, formLimiter, controller.submitPropertyAgentInquiry);
router.post('/request-callback', verifyCaptcha, formLimiter, controller.submitCallbackRequest);
router.post('/quick-question', verifyCaptcha, formLimiter, controller.submitQuickQuestion);

// Alias: /submit-application maps to /careers for the JobApplicationForm component
router.post('/submit-application', verifyCaptcha, formLimiter, controller.submitCareerApplication);

module.exports = router;
