const sgMail = require('@sendgrid/mail');
const logger = require('../monitoring/logger');
const { captureException } = require('../monitoring/sentry');

function initEmail() {
  if (!process.env.SENDGRID_API_KEY) {
    logger.warn('SendGrid API key not configured — emails will be logged only');
    return false;
  }
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  logger.info('SendGrid initialized');
  return true;
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@vasurealty.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Vasu Realty';

const TEMPLATES = {
  welcome: process.env.SG_TEMPLATE_WELCOME || 'd-welcome',
  verifyEmail: process.env.SG_TEMPLATE_VERIFY || 'd-verify',
  passwordReset: process.env.SG_TEMPLATE_RESET || 'd-reset',
  agentApproval: process.env.SG_TEMPLATE_AGENT_APPROVAL || 'd-agent-approval',
  inquiryReceived: process.env.SG_TEMPLATE_INQUIRY || 'd-inquiry',
  tourScheduled: process.env.SG_TEMPLATE_TOUR || 'd-tour',
  tourConfirmed: process.env.SG_TEMPLATE_TOUR_CONFIRMED || 'd-tour-confirmed',
  offerSubmitted: process.env.SG_TEMPLATE_OFFER || 'd-offer',
  offerUpdated: process.env.SG_TEMPLATE_OFFER_UPDATED || 'd-offer-updated',
  transactionMilestone: process.env.SG_TEMPLATE_TX_MILESTONE || 'd-tx-milestone',
  subscriptionReceipt: process.env.SG_TEMPLATE_SUB_RECEIPT || 'd-sub-receipt',
  paymentFailure: process.env.SG_TEMPLATE_PAYMENT_FAILURE || 'd-payment-failure',
  savedSearchAlert: process.env.SG_TEMPLATE_SEARCH_ALERT || 'd-search-alert',
  priceDropAlert: process.env.SG_TEMPLATE_PRICE_DROP || 'd-price-drop',
  newListingAlert: process.env.SG_TEMPLATE_NEW_LISTING || 'd-new-listing',
};

async function sendEmail({ to, templateId, dynamicTemplateData, attachments, replyTo }) {
  if (!process.env.SENDGRID_API_KEY) {
    logger.info(`[EMAIL SIMULATED] To: ${to}, Template: ${templateId}`, { dynamicTemplateData });
    return { id: 'simulated' };
  }

  const msg = {
    to: Array.isArray(to) ? to : [to],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    templateId,
    dynamicTemplateData,
    attachments,
    replyTo: replyTo || FROM_EMAIL,
  };

  try {
    const [response] = await sgMail.send(msg);
    logger.info(`Email sent to ${to}`, { templateId, messageId: response.headers['x-message-id'] });
    return { id: response.headers['x-message-id'] };
  } catch (err) {
    logger.error(`Failed to send email to ${to}`, { templateId, error: err.message });
    if (err.response) {
      logger.error('SendGrid response error', { body: err.response.body });
    }
    captureException(err, { extra: { to, templateId } });
    throw err;
  }
}

async function sendWelcomeEmail(user) {
  return sendEmail({
    to: user.email,
    templateId: TEMPLATES.welcome,
    dynamicTemplateData: { name: user.name || user.email, login_url: `${process.env.CLIENT_URL}/login` },
  });
}

async function sendVerificationEmail(user, token) {
  return sendEmail({
    to: user.email,
    templateId: TEMPLATES.verifyEmail,
    dynamicTemplateData: { name: user.name || user.email, verify_url: `${process.env.CLIENT_URL}/verify-email?token=${token}` },
  });
}

async function sendPasswordResetEmail(user, token) {
  return sendEmail({
    to: user.email,
    templateId: TEMPLATES.passwordReset,
    dynamicTemplateData: { name: user.name || user.email, reset_url: `${process.env.CLIENT_URL}/reset-password?token=${token}` },
  });
}

async function sendInquiryReceived(inquiry) {
  return sendEmail({
    to: inquiry.email,
    templateId: TEMPLATES.inquiryReceived,
    dynamicTemplateData: { name: inquiry.name, listing_key: inquiry.listing_key, message: inquiry.message },
  });
}

async function sendTourScheduled(tour) {
  return sendEmail({
    to: tour.email,
    templateId: TEMPLATES.tourScheduled,
    dynamicTemplateData: {
      name: tour.name, date: tour.tour_date, time: tour.tour_time?.slice(0, 5),
      listing_key: tour.listing_key, tour_type: tour.tour_type,
    },
  });
}

async function sendTourConfirmed(tour) {
  return sendEmail({
    to: tour.email,
    templateId: TEMPLATES.tourConfirmed,
    dynamicTemplateData: {
      name: tour.name, date: tour.tour_date, time: tour.tour_time?.slice(0, 5),
      listing_key: tour.listing_key,
    },
  });
}

async function sendPaymentFailure(user, subscription) {
  return sendEmail({
    to: user.email,
    templateId: TEMPLATES.paymentFailure,
    dynamicTemplateData: {
      name: user.name || user.email,
      plan_name: subscription.plan_name,
      amount: subscription.amount,
      retry_url: `${process.env.CLIENT_URL}/agent/billing`,
    },
  });
}

async function sendSavedSearchAlert(user, alert, listings) {
  return sendEmail({
    to: user.email,
    templateId: TEMPLATES.savedSearchAlert,
    dynamicTemplateData: {
      name: user.name || user.email,
      search_criteria: alert.criteria,
      listing_count: listings.length,
      listings_url: `${process.env.CLIENT_URL}/saved-searches-list`,
    },
  });
}

async function sendPriceDropAlert(user, listing, oldPrice, newPrice) {
  return sendEmail({
    to: user.email,
    templateId: TEMPLATES.priceDropAlert,
    dynamicTemplateData: {
      name: user.name || user.email,
      address: listing.address,
      old_price: oldPrice,
      new_price: newPrice,
      listing_url: `${process.env.CLIENT_URL}/property/${listing.listing_key}`,
    },
  });
}

module.exports = {
  initEmail, sendEmail,
  sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail,
  sendInquiryReceived, sendTourScheduled, sendTourConfirmed,
  sendPaymentFailure, sendSavedSearchAlert, sendPriceDropAlert,
};
