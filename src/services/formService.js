/**
 * Form Database Service
 *
 * Production-ready PostgreSQL service for all form submissions.
 * Every function uses parameterized queries — NO string concatenation.
 * After each successful DB insert, data is also submitted to JotForm.
 */

const crypto = require('crypto');
const pool = require('../config/database');
const { submitToJotForm } = require('./jotformService');

function jotFormMeta(formType, data, meta = {}) {
  const stable = `${formType}:${JSON.stringify(data)}:${Date.now()}:${Math.random()}`;
  const idempotencyKey = crypto.createHash('sha256').update(stable).digest('hex').slice(0, 64);
  return { formType, data, idempotencyKey, clientIp: meta.clientIp, userAgent: meta.userAgent, dbRecordId: meta.dbRecordId };
}

/**
 * Generic single-row insert helper.
 * @param {string} table - Table name
 * @param {Object} data - Column-value pairs to insert
 * @returns {Promise<Object>} Inserted row
 */
async function insertRow(table, data) {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const query = `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0];
}

// ================================================================
// Contact Requests
// ================================================================
async function createContactRequest({ name, email, phone, subject, message, inquiry_type, source, ip_address, user_agent }, meta = {}) {
  const row = await insertRow('contact_requests', { name, email, phone, subject, message, inquiry_type, source, ip_address, user_agent });
  submitToJotForm('contact', { name, email, phone, subject, message }, { ...jotFormMeta('contact', { name, email, phone, subject, message }, { ...meta, dbRecordId: row.id }) }).catch(() => {});
  return row;
}

// ================================================================
// Tour Requests
// ================================================================
async function createTourRequest({ property_id, listing_key, property_address, name, email, phone, message, preferred_date, preferred_time }, meta = {}) {
  const row = await insertRow('tour_requests', {
    property_id, listing_key, property_address,
    name, email, phone, message,
    preferred_date, preferred_time,
  });
  submitToJotForm('tour', { propertyId: property_id, listingKey: listing_key, propertyAddress: property_address, name, email, phone, message, preferredDate: preferred_date, preferredTime: preferred_time }, { ...jotFormMeta('tour', { name, email, phone }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Property Inquiries
// ================================================================
async function createPropertyInquiry({ property_id, listing_key, property_address, name, email, phone, message }, meta = {}) {
  const row = await insertRow('property_inquiries', { property_id, listing_key, property_address, name, email, phone, message });
  submitToJotForm('agentInquiry', { propertyId: property_id, listingKey: listing_key, propertyAddress: property_address, name, email, phone, message }, { ...jotFormMeta('agentInquiry', { name, email, phone }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Home Valuations
// ================================================================
async function createHomeValuation({ name, email, phone, property_address, message }, meta = {}) {
  const row = await insertRow('home_valuations', { name, email, phone, property_address, message });
  submitToJotForm('valuation', { name, email, phone, propertyAddress: property_address, message }, { ...jotFormMeta('valuation', { name, email, phone }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Newsletter Subscribers
// ================================================================
async function createNewsletterSubscriber({ email }, meta = {}) {
  const query = `
    INSERT INTO newsletter_subscribers (email)
    VALUES ($1)
    ON CONFLICT (email)
    DO UPDATE SET is_active = TRUE, unsubscribed_at = NULL, updated_at = NOW()
    RETURNING *
  `;
  const result = await pool.query(query, [email]);
  const row = result.rows[0];
  submitToJotForm('newsletter', { email }, { ...jotFormMeta('newsletter', { email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Career Applications
// ================================================================
async function createCareerApplication(data, meta = {}) {
  const row = await insertRow('career_applications', {
    full_name: data.fullName, email: data.email, phone: data.phone, position: data.position,
    experience: data.experience || null, cover_letter: data.coverLetter || null,
    linkedin_profile: data.linkedinProfile || null, portfolio_url: data.portfolioUrl || null,
    resume_filename: data.resumeFilename || null, resume_data: data.resumeData || null,
    resume_content_type: data.resumeContentType || null, saas_experience: data.saasExperience || null,
    salary_expectations: data.salaryExpectations || null, trial_period: data.trialPeriod || null,
    available_to_start: data.availableToStart || null, ai_product_confidence: data.aiProductConfidence || null,
    weekly_calls: data.weeklyCalls || null, upwork_freelancer: data.upworkFreelancer || null,
    preferred_interview_times: data.preferredInterviewTimes || null,
  });
  submitToJotForm('career', { fullName: data.fullName, email: data.email, phone: data.phone, position: data.position }, { ...jotFormMeta('career', { email: data.email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Onboarding Requests
// ================================================================
async function createOnboardingRequest({ fullName, email, phone, address, govtIdType, attachments }, meta = {}) {
  const row = await insertRow('onboarding_requests', {
    full_name: fullName, email, phone: phone || null, address: address || null,
    govt_id_type: govtIdType || null, attachments: attachments ? JSON.stringify(attachments) : '[]',
  });
  submitToJotForm('onboarding', { fullName, email, phone, address, govtIdType }, { ...jotFormMeta('onboarding', { email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Mortgage Pre-Approvals
// ================================================================
async function createMortgagePreApproval(data, meta = {}) {
  const row = await insertRow('mortgage_pre_approvals', {
    full_name: data.fullName, email: data.email, phone: data.phone,
    property_price: data.propertyPrice, down_payment: data.downPayment,
    annual_income: data.annualIncome, employment_status: data.employmentStatus,
    credit_score: data.creditScore || null, preferred_loan_term: data.preferredLoanTerm || 30,
    notes: data.notes || null,
  });
  submitToJotForm('preApproval', { fullName: data.fullName, email: data.email, phone: data.phone, propertyPrice: data.propertyPrice, downPayment: data.downPayment, annualIncome: data.annualIncome, employmentStatus: data.employmentStatus, creditScore: data.creditScore, preferredLoanTerm: data.preferredLoanTerm, notes: data.notes }, { ...jotFormMeta('preApproval', { email: data.email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Seller Requests (also used for JoinOurFirm)
// ================================================================
async function createSellerRequest({ name, email, phone, propertyAddress, message, role }, meta = {}) {
  const row = await insertRow('seller_requests', {
    name, email, phone: phone || null, property_address: propertyAddress || null,
    message: message || null, role: role || null,
  });
  submitToJotForm('sellerRequest', { name, email, phone, propertyAddress, message, role }, { ...jotFormMeta('sellerRequest', { email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// AI Demo Requests
// ================================================================
async function createAIDemoRequest({ name, email, companyName, industry, findUs, whatsappNumber, phoneNumber }, meta = {}) {
  const row = await insertRow('ai_demo_requests', {
    name, email, company_name: companyName, industry, find_us: findUs,
    whatsapp_number: whatsappNumber, phone_number: phoneNumber,
  });
  submitToJotForm('aiDemo', { name, email, companyName, industry, findUs, whatsappNumber, phoneNumber }, { ...jotFormMeta('aiDemo', { email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// AI Contact Requests
// ================================================================
async function createAIContactRequest(data, meta = {}) {
  const row = await insertRow('ai_contact_requests', {
    voice_automation: data.voiceAutomation || data.voice_automation || null,
    industry_type: data.industryType || data.industry_type || null,
    yearly_revenue: data.yearlyRevenue || data.yearly_revenue || null,
    country: data.country || null,
    transformative_for: data.transformativeFor || data.transformative_for || null,
    monthly_usage: data.monthlyUsage || data.monthly_usage || null,
    whatsapp_no: data.whatsappNo || data.whatsapp_no || null,
    website_link: data.websiteLink || data.website_link || null,
    consent: data.consent || false,
  });
  submitToJotForm('aiContact', {
    voiceAutomation: data.voiceAutomation || data.voice_automation, industryType: data.industryType || data.industry_type,
    yearlyRevenue: data.yearlyRevenue || data.yearly_revenue, country: data.country,
    transformativeFor: data.transformativeFor || data.transformative_for, monthlyUsage: data.monthlyUsage || data.monthly_usage,
    whatsappNo: data.whatsappNo || data.whatsapp_no, websiteLink: data.websiteLink || data.website_link,
    consent: data.consent,
  }, { ...jotFormMeta('aiContact', {}, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Buyer Agent Requests
// ================================================================
async function createBuyerAgentRequest({ name, email, phone, preferredLocation, budgetMin, budgetMax, propertyType, bedrooms, bathrooms, timeline, additionalRequirements }, meta = {}) {
  const row = await insertRow('buyer_agent_requests', {
    name, email, phone, preferred_location: preferredLocation || null,
    budget_min: budgetMin || null, budget_max: budgetMax || null,
    property_type: propertyType || null, bedrooms: bedrooms || null,
    bathrooms: bathrooms || null, timeline: timeline || null,
    additional_requirements: additionalRequirements || null,
  });
  submitToJotForm('buyerAgent', { name, email, phone, preferredLocation, budgetMin, budgetMax, propertyType, bedrooms, bathrooms, timeline, additionalRequirements }, { ...jotFormMeta('buyerAgent', { email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Property Agent Inquiries (Contact Agent from property)
// ================================================================
async function createPropertyAgentInquiry({ listingKey, listingId, propertyAddress, listingPrice, propertyUrl, listingAgentName, listingAgentMlsId, name, email, phone, message }, meta = {}) {
  const row = await insertRow('property_agent_inquiries', {
    listing_key: listingKey || null, listing_id: listingId || null,
    property_address: propertyAddress || null, listing_price: listingPrice || null,
    property_url: propertyUrl || null, listing_agent_name: listingAgentName || null,
    listing_agent_mls_id: listingAgentMlsId || null, name, email, phone: phone || null,
    message: message || null,
  });
  submitToJotForm('agentInquiry', { listingKey, listingId, propertyAddress, listingPrice, propertyUrl, listingAgentName, listingAgentMlsId, name, email, phone, message }, { ...jotFormMeta('agentInquiry', { email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Callback Requests
// ================================================================
async function createCallbackRequest({ name, phone, preferredTime, propertyAddress, listingKey }, meta = {}) {
  const row = await insertRow('callback_requests', {
    name, phone, preferred_time: preferredTime || null,
    property_address: propertyAddress || null, listing_key: listingKey || null,
  });
  submitToJotForm('callback', { name, phone, preferredTime, propertyAddress, listingKey }, { ...jotFormMeta('callback', { phone }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}

// ================================================================
// Quick Questions
// ================================================================
async function createQuickQuestion({ name, email, phone, message, propertyAddress, listingKey, listingId, listingPrice }, meta = {}) {
  const row = await insertRow('quick_questions', {
    name, email, phone: phone || null, message,
    property_address: propertyAddress || null, listing_key: listingKey || null,
    listing_id: listingId || null, listing_price: listingPrice || null,
  });
  submitToJotForm('quickQuestion', { name, email, phone, message, propertyAddress, listingKey, listingId, listingPrice }, { ...jotFormMeta('quickQuestion', { email }, meta), dbRecordId: row.id }).catch(() => {});
  return row;
}



module.exports = {
  createContactRequest,
  createTourRequest,
  createPropertyInquiry,
  createHomeValuation,
  createNewsletterSubscriber,
  createCareerApplication,
  createOnboardingRequest,
  createMortgagePreApproval,
  createSellerRequest,
  createAIDemoRequest,
  createAIContactRequest,
  createBuyerAgentRequest,
  createPropertyAgentInquiry,
  createCallbackRequest,
  createQuickQuestion,
};
