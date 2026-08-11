const pool = require('../../config/database');
const logger = require('../monitoring/logger');

const COMPLIANCE_RULES = {
  MAX_LISTING_AGE_DAYS: 45,
  REQUIRE_AGENT_NAME: true,
  REQUIRE_OFFICE_NAME: true,
  BANNED_WORDS: ['foreclosure', 'short sale', 'motivated seller', 'must sell', 'below market', 'guaranteed', 'no down payment'],
  MIN_PHOTO_COUNT: 0,
  REQUIRE_MLS_ID: true,
};

const BROKERAGE_DISCLAIMER = 'Listing information provided by Canopy MLS. IDX information is provided exclusively for personal, non-commercial use and may not be used for any purpose other than to identify prospective properties for purchase.';

async function validateListing(listing) {
  const issues = [];

  if (COMPLIANCE_RULES.REQUIRE_MLS_ID && !listing.ListingKey) {
    issues.push({ field: 'ListingKey', severity: 'error', message: 'Missing MLS ID' });
  }

  if (listing.ListingKey && !/^[A-Za-z0-9-]+$/.test(listing.ListingKey)) {
    issues.push({ field: 'ListingKey', severity: 'error', message: 'Invalid MLS ID format' });
  }

  if (COMPLIANCE_RULES.REQUIRE_AGENT_NAME && !listing.ListAgentFullName) {
    issues.push({ field: 'ListAgentFullName', severity: 'warning', message: 'Missing listing agent name' });
  }

  if (COMPLIANCE_RULES.REQUIRE_OFFICE_NAME && !listing.ListOfficeName) {
    issues.push({ field: 'ListOfficeName', severity: 'warning', message: 'Missing listing office name' });
  }

  if (listing.DaysOnMarket && listing.DaysOnMarket > COMPLIANCE_RULES.MAX_LISTING_AGE_DAYS) {
    issues.push({ field: 'DaysOnMarket', severity: 'info', message: `Listing is ${listing.DaysOnMarket} days old (max ${COMPLIANCE_RULES.MAX_LISTING_AGE_DAYS})` });
  }

  if (listing.PhotoCount != null && listing.PhotoCount < COMPLIANCE_RULES.MIN_PHOTO_COUNT) {
    issues.push({ field: 'PhotoCount', severity: 'warning', message: `Only ${listing.PhotoCount} photos — minimum ${COMPLIANCE_RULES.MIN_PHOTO_COUNT} required` });
  }

  // Check description for banned words
  const fieldsToCheck = [listing.PublicRemarks, listing.PrivateRemarks, listing.VirtualTourURLs];
  for (const field of fieldsToCheck) {
    if (field) {
      const lower = field.toLowerCase();
      for (const word of COMPLIANCE_RULES.BANNED_WORDS) {
        if (lower.includes(word)) {
          issues.push({ field: 'remarks', severity: 'error', message: `Contains prohibited term: "${word}"` });
        }
      }
    }
  }

  const passed = !issues.some(i => i.severity === 'error');
  return { passed, issues, validatedAt: new Date().toISOString() };
}

async function logComplianceCheck(listingKey, userId, issues, action = 'display') {
  try {
    await pool.query(
      `INSERT INTO mls_compliance_log (listing_key, user_id, action, issues, status, checked_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        listingKey,
        userId || null,
        action,
        JSON.stringify(issues),
        issues.some(i => i.severity === 'error') ? 'blocked' : 'allowed',
      ]
    );
  } catch (err) {
    logger.error('Failed to log compliance check', { error: err.message, listingKey });
  }
}

function buildCompliantResponse(listings, userId) {
  const results = [];
  for (const listing of listings) {
    const { passed, issues } = validateListing(listing);
    logComplianceCheck(listing.ListingKey, userId, issues);
    results.push({
      ...listing,
      _compliance: { passed, issues },
      _disclaimer: BROKERAGE_DISCLAIMER,
      _displayable: passed,
    });
  }
  return results;
}

function getDisclaimer() {
  return BROKERAGE_DISCLAIMER;
}

function getComplianceRules() {
  return COMPLIANCE_RULES;
}

module.exports = {
  validateListing, logComplianceCheck, buildCompliantResponse,
  getDisclaimer, getComplianceRules, COMPLIANCE_RULES,
};
