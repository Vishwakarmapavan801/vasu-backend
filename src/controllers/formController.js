/**
 * Form Controller
 *
 * Handles validation, sanitization, and delegation to the form service
 * for all user-facing form submissions. Every public method follows the
 * Express async handler pattern: (req, res, next).
 */

const formService = require('../services/formService');
const emailService = require('../services/emailService');

/** Name regex (letters, spaces, hyphens, apostrophes only) */
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;

/** Simple email regex */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Simple phone regex (accepts digits, spaces, dashes, parens, dots, +) */
const PHONE_RE = /^[\d\s\-().+]{7,20}$/;

/**
 * Strip HTML tags and trim.
 */
function stripHtml(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim();
}

/**
 * Get client IP from request (handles proxies).
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '';
}

/**
 * Validate required string field.
 * Returns error message or null.
 */
function requiredString(val, fieldName, maxLen = 500) {
  if (!val || typeof val !== 'string' || !val.trim()) {
    return `${fieldName} is required`;
  }
  if (val.trim().length > maxLen) {
    return `${fieldName} must be ${maxLen} characters or less`;
  }
  return null;
}

/**
 * Validate name field (letters, spaces, hyphens, apostrophes only).
 */
function validateName(val) {
  if (!val || !val.trim()) return 'Name is required';
  const cleaned = stripHtml(val);
  if (!NAME_RE.test(cleaned)) return 'Name can only contain letters, spaces, hyphens, and apostrophes';
  return null;
}

/**
 * Validate email field.
 */
function validateEmail(val) {
  if (!val || !val.trim()) return 'Email is required';
  if (!EMAIL_RE.test(val.trim())) return 'Invalid email address';
  return null;
}

/**
 * Validate phone field (optional but must match pattern if provided).
 */
function validatePhone(val, isRequired) {
  if (!val || !val.trim()) return isRequired ? 'Phone is required' : null;
  if (!PHONE_RE.test(val.trim())) return 'Invalid phone number';
  return null;
}

/**
 * Build a 400 error response with field-level errors.
 */
function validationError(res, fields) {
  return res.status(400).json({
    success: false,
    error: 'Validation failed',
    fields,
  });
}

/**
 * Build a 201 success response.
 */
function createdResponse(res, record, message) {
  return res.status(201).json({
    success: true,
    message: message || 'Submission created successfully',
    data: { id: record.id },
  });
}

/**
 * Generic async handler wrapper for try/catch.
 */
async function handleInsert(req, res, next, serviceFn, extractData, successMsg, afterInsert) {
  try {
    const data = extractData(req.body);
    const meta = { clientIp: getClientIp(req), userAgent: (req.headers['user-agent'] || '').slice(0, 500) };
    const record = await serviceFn(data, meta);
    if (typeof afterInsert === 'function') {
      afterInsert(record, data).catch(() => {});
    }
    return createdResponse(res, record, successMsg);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A record with this information already exists',
        detail: err.detail,
      });
    }
    next(err);
  }
}

// ================================================================
// POST /api/contact
// ================================================================
async function submitContact(req, res, next) {
  const raw = req.body || {};
  const name = stripHtml(raw.name || '');
  const email = (raw.email || '').trim().toLowerCase();
  const phone = stripHtml(raw.phone || '');
  const subject = stripHtml(raw.subject || '');
  const message = stripHtml(raw.message || '');
  const inquiry_type = stripHtml(raw.inquiry_type || '') || subject || null;
  const source = stripHtml(raw.source || '') || 'website';
  const ip_address = getClientIp(req);
  const user_agent = (req.headers['user-agent'] || '').slice(0, 500);
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;

  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  if (subject && subject.length > 255) errors.subject = 'Subject must be 255 characters or less';
  const msgErr = requiredString(message, 'Message', 5000);
  if (msgErr) errors.message = msgErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createContactRequest, () => ({
    name, email, phone, subject, message, inquiry_type, source, ip_address, user_agent,
  }), 'Your message has been sent. We will respond within 24 hours.',
  (record, data) => {
    emailService.sendGeneralContactNotification(data).catch(() => {});
  });
}

// ================================================================
// POST /api/tours
// ================================================================
async function submitTour(req, res, next) {
  const { propertyId, listingKey, propertyAddress, name, email, phone, message, preferredDate, preferredTime } = req.body;
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;

  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createTourRequest, () => ({
    property_id: propertyId || null,
    listing_key: listingKey || null,
    property_address: propertyAddress || null,
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: (phone || '').trim(), message: (message || '').trim(),
    preferred_date: preferredDate || null,
    preferred_time: preferredTime || null,
  }), 'Your tour request has been submitted. We will contact you shortly.');
}

// ================================================================
// POST /api/property-inquiries
// ================================================================
async function submitPropertyInquiry(req, res, next) {
  const { propertyId, listingKey, propertyAddress, name, email, phone, message } = req.body;
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createPropertyInquiry, () => ({
    property_id: propertyId || null, listing_key: listingKey || null,
    property_address: propertyAddress || null,
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: (phone || '').trim(), message: (message || '').trim(),
  }), 'Your inquiry has been received.');
}

// ================================================================
// POST /api/home-valuations
// ================================================================
async function submitHomeValuation(req, res, next) {
  const { name, email, phone, propertyAddress, message } = req.body;
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone, true);
  if (phoneErr) errors.phone = phoneErr;
  const addrErr = requiredString(propertyAddress, 'Property Address');
  if (addrErr) errors.propertyAddress = addrErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createHomeValuation, () => ({
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: phone.trim(), property_address: propertyAddress.trim(),
    message: (message || '').trim(),
  }), 'Your home valuation request has been received. We will be in touch within 24 hours.');
}

// ================================================================
// POST /api/newsletter
// ================================================================
async function submitNewsletter(req, res, next) {
  const { email } = req.body;
  const emailErr = validateEmail(email);
  if (emailErr) {
    return res.status(400).json({ success: false, error: emailErr });
  }

  return handleInsert(req, res, next, formService.createNewsletterSubscriber, () => ({
    email: email.trim().toLowerCase(),
  }), 'Successfully subscribed to the newsletter.');
}

// ================================================================
// POST /api/careers
// ================================================================
async function submitCareerApplication(req, res, next) {
  const { fullName, email, phone, position, experience, coverLetter, linkedinProfile, portfolioUrl, resumeData, resumeFilename, resumeContentType } = req.body;
  const errors = {};

  const nameErr = validateName(fullName);
  if (nameErr) errors.fullName = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone, true);
  if (phoneErr) errors.phone = phoneErr;
  const posErr = requiredString(position, 'Position');
  if (posErr) errors.position = posErr;
  const resumeErr = requiredString(resumeData, 'Resume');
  if (resumeErr) errors.resumeData = resumeErr;

  // Also accept SDR-specific fields
  const { saasExperience, salaryExpectations, trialPeriod, availableToStart, aiProductConfidence, weeklyCalls, upworkFreelancer, preferredInterviewTimes } = req.body;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createCareerApplication, () => ({
    fullName: fullName.trim(), email: email.trim().toLowerCase(),
    phone: phone.trim(), position: position.trim(),
    experience: (experience || '').trim(),
    coverLetter: (coverLetter || '').trim(),
    linkedinProfile: (linkedinProfile || '').trim(),
    portfolioUrl: (portfolioUrl || '').trim(),
    resumeData, resumeFilename: (resumeFilename || '').trim(),
    resumeContentType: (resumeContentType || '').trim(),
    saasExperience: (saasExperience || '').trim(),
    salaryExpectations: (salaryExpectations || '').trim(),
    trialPeriod: (trialPeriod || '').trim(),
    availableToStart: (availableToStart || '').trim(),
    aiProductConfidence: (aiProductConfidence || '').trim(),
    weeklyCalls: (weeklyCalls || '').trim(),
    upworkFreelancer: (upworkFreelancer || '').trim(),
    preferredInterviewTimes: (preferredInterviewTimes || '').trim(),
  }), 'Application submitted successfully!');
}

// ================================================================
// POST /api/onboarding
// ================================================================
async function submitOnboarding(req, res, next) {
  const { fullName, email, phone, address, govtIdType, attachments } = req.body;
  const errors = {};

  const nameErr = validateName(fullName);
  if (nameErr) errors.fullName = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createOnboardingRequest, () => ({
    fullName: fullName.trim(), email: email.trim().toLowerCase(),
    phone: (phone || '').trim(), address: (address || '').trim(),
    govtIdType: (govtIdType || '').trim(),
    attachments: Array.isArray(attachments) ? attachments : [],
  }), 'Onboarding request submitted successfully.');
}

// ================================================================
// POST /api/pre-approval
// ================================================================
async function submitPreApproval(req, res, next) {
  const { fullName, email, phone, propertyPrice, downPayment, annualIncome, employmentStatus, creditScore, preferredLoanTerm, notes } = req.body;
  const errors = {};

  const nameErr = validateName(fullName);
  if (nameErr) errors.fullName = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone, true);
  if (phoneErr) errors.phone = phoneErr;

  if (!propertyPrice || Number(propertyPrice) <= 0) errors.propertyPrice = 'Property price must be greater than 0';
  if (downPayment === undefined || Number(downPayment) < 0) errors.downPayment = 'Down payment is required';
  if (!annualIncome || Number(annualIncome) <= 0) errors.annualIncome = 'Annual income must be greater than 0';
  if (!employmentStatus) errors.employmentStatus = 'Employment status is required';

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createMortgagePreApproval, () => ({
    fullName: fullName.trim(), email: email.trim().toLowerCase(),
    phone: phone.trim(), propertyPrice: Number(propertyPrice),
    downPayment: Number(downPayment), annualIncome: Number(annualIncome),
    employmentStatus, creditScore: creditScore ? Number(creditScore) : null,
    preferredLoanTerm: preferredLoanTerm ? Number(preferredLoanTerm) : 30,
    notes: (notes || '').trim(),
  }), 'Pre-approval application submitted successfully.');
}

// ================================================================
// POST /api/seller-request
// ================================================================
async function submitSellerRequest(req, res, next) {
  const { name, email, phone, propertyAddress, message, role } = req.body;
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createSellerRequest, () => ({
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: (phone || '').trim(), propertyAddress: (propertyAddress || '').trim(),
    message: (message || '').trim(), role: (role || '').trim(),
  }), 'Your request has been received.');
}

// ================================================================
// POST /api/ai-demo
// ================================================================
async function submitAIDemo(req, res, next) {
  const { name, email, companyName, industry, findUs, whatsappNumber, phoneNumber } = req.body;
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const companyErr = requiredString(companyName, 'Company Name');
  if (companyErr) errors.companyName = companyErr;
  const industryErr = requiredString(industry, 'Industry');
  if (industryErr) errors.industry = industryErr;
  const findUsErr = requiredString(findUs, 'How did you find us');
  if (findUsErr) errors.findUs = findUsErr;

  // Validate phone numbers with content-aware patterns (WhatsApp numbers may include +)
  const waErr = validatePhone(whatsappNumber, true);
  if (waErr) errors.whatsappNumber = waErr;
  const phoneErr = validatePhone(phoneNumber, true);
  if (phoneErr) errors.phoneNumber = phoneErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createAIDemoRequest, () => ({
    name: name.trim(), email: email.trim().toLowerCase(),
    companyName: companyName.trim(), industry: industry.trim(),
    findUs: findUs.trim(), whatsappNumber: whatsappNumber.trim(),
    phoneNumber: phoneNumber.trim(),
  }), 'AI demo request submitted successfully.');
}

// ================================================================
// POST /api/ai-contact
// ================================================================
async function submitAIContact(req, res, next) {
  const { voiceAutomation, industryType, yearlyRevenue, country, transformativeFor, monthlyUsage, whatsappNo, websiteLink, consent, voice_automation, industry_type, yearly_revenue, transformative_for, monthly_usage, whatsapp_no, website_link } = req.body;

  // Support both camelCase and snake_case field names from different frontend forms
  const data = {
    voiceAutomation: voiceAutomation || voice_automation || null,
    industryType: industryType || industry_type || null,
    yearlyRevenue: yearlyRevenue || yearly_revenue || null,
    country: country || null,
    transformativeFor: transformativeFor || transformative_for || null,
    monthlyUsage: monthlyUsage || monthly_usage || null,
    whatsappNo: whatsappNo || whatsapp_no || null,
    websiteLink: websiteLink || website_link || null,
    consent: consent || null,
  };

  return handleInsert(req, res, next, formService.createAIContactRequest, () => data, 'AI contact request submitted successfully.');
}

// ================================================================
// POST /api/buyer-agent
// ================================================================
async function submitBuyerAgentRequest(req, res, next) {
  const { name, email, phone, preferredLocation, budgetMin, budgetMax, propertyType, bedrooms, bathrooms, timeline, additionalRequirements } = req.body;
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  // budget range validation
  if (budgetMin !== undefined && budgetMin !== null && budgetMax !== undefined && budgetMax !== null) {
    if (Number(budgetMin) > Number(budgetMax)) {
      errors.budget = 'Minimum budget cannot exceed maximum budget';
    }
  }

  if (Object.keys(errors).length) return validationError(res, errors);

  const buyerData = {
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: phone.trim(),
    preferredLocation: (preferredLocation || '').trim(),
    budgetMin: budgetMin !== undefined && budgetMin !== null && budgetMin !== '' ? Number(budgetMin) : null,
    budgetMax: budgetMax !== undefined && budgetMax !== null && budgetMax !== '' ? Number(budgetMax) : null,
    propertyType: (propertyType || '').trim(),
    bedrooms: bedrooms !== undefined && bedrooms !== null && bedrooms !== '' ? Number(bedrooms) : null,
    bathrooms: bathrooms !== undefined && bathrooms !== null && bathrooms !== '' ? Number(bathrooms) : null,
    timeline: (timeline || '').trim(),
    additionalRequirements: (additionalRequirements || '').trim(),
  };
  return handleInsert(req, res, next, formService.createBuyerAgentRequest, () => buyerData,
    'Your buyer agent request has been submitted. A dedicated agent will contact you within 24 hours.',
    (record, data) => {
      emailService.sendBuyerAgentNotification(data).catch(() => {});
    });
}

// ================================================================
// POST /api/property-agent-inquiry
// ================================================================
async function submitPropertyAgentInquiry(req, res, next) {
  const { listingKey, listingId, propertyAddress, listingPrice, propertyUrl, listingAgentName, listingAgentMlsId, name, email, phone, message } = req.body;
  const errors = {};

  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;

  if (Object.keys(errors).length) return validationError(res, errors);

  const agentData = {
    listingKey: (listingKey || '').trim(),
    listingId: (listingId || '').trim(),
    propertyAddress: (propertyAddress || '').trim(),
    listingPrice: listingPrice !== undefined && listingPrice !== null ? Number(listingPrice) : null,
    propertyUrl: (propertyUrl || '').trim(),
    listingAgentName: (listingAgentName || '').trim(),
    listingAgentMlsId: (listingAgentMlsId || '').trim(),
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: phone.trim(), message: (message || '').trim(),
  };
  return handleInsert(req, res, next, formService.createPropertyAgentInquiry, () => agentData,
    'Your inquiry has been sent to the listing agent.',
    (record, data) => {
      emailService.sendPropertyAgentNotification(data).catch(() => {});
    });
}

// ================================================================
// POST /api/request-callback
// ================================================================
async function submitCallbackRequest(req, res, next) {
  const { name, phone, preferredTime, propertyAddress, listingKey } = req.body;
  const errors = {};
  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.phone = phoneErr;
  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createCallbackRequest, () => ({
    name: name.trim(), phone: phone.trim(),
    preferredTime: (preferredTime || '').trim(),
    propertyAddress: (propertyAddress || '').trim(),
    listingKey: (listingKey || '').trim(),
  }), 'Callback request submitted.');
}

// ================================================================
// POST /api/quick-question
// ================================================================
async function submitQuickQuestion(req, res, next) {
  const { name, email, phone, message, propertyAddress, listingKey, listingId, listingPrice } = req.body;
  const errors = {};
  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const msgErr = requiredString(message, 'Message', 5000);
  if (msgErr) errors.message = msgErr;
  if (Object.keys(errors).length) return validationError(res, errors);

  return handleInsert(req, res, next, formService.createQuickQuestion, () => ({
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: (phone || '').trim(), message: message.trim(),
    propertyAddress: (propertyAddress || '').trim(),
    listingKey: (listingKey || '').trim(),
    listingId: (listingId || '').trim(),
    listingPrice: listingPrice ? Number(listingPrice) : null,
  }), 'Your question has been submitted. We will respond within 24 hours.');
}

module.exports = {
  submitContact,
  submitTour,
  submitPropertyInquiry,
  submitHomeValuation,
  submitNewsletter,
  submitCareerApplication,
  submitOnboarding,
  submitPreApproval,
  submitSellerRequest,
  submitAIDemo,
  submitAIContact,
  submitBuyerAgentRequest,
  submitPropertyAgentInquiry,
  submitCallbackRequest,
  submitQuickQuestion,
};
