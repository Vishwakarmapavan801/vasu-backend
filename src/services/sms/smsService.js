const logger = require('../monitoring/logger');
const { captureException } = require('../monitoring/sentry');

let twilioClient = null;

function initSMS() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    logger.warn('Twilio not configured — SMS messages will be logged only');
    return false;
  }
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  logger.info('Twilio initialized');
  return true;
}

const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+1234567890';

async function sendSMS({ to, body, mediaUrl }) {
  if (!twilioClient) {
    logger.info(`[SMS SIMULATED] To: ${to}, Body: ${body}`);
    return { sid: 'simulated', status: 'delivered' };
  }

  try {
    const message = await twilioClient.messages.create({
      to,
      from: FROM_NUMBER,
      body,
      ...(mediaUrl ? { mediaUrl: Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl] } : {}),
    });
    logger.info(`SMS sent to ${to}`, { sid: message.sid, status: message.status });
    return { sid: message.sid, status: message.status };
  } catch (err) {
    logger.error(`SMS failed to ${to}`, { error: err.message });
    captureException(err, { extra: { to } });
    throw err;
  }
}

async function sendTourConfirmation(tour) {
  return sendSMS({
    to: tour.phone,
    body: `Vasu Realty: Your tour for ${tour.listing_key} is confirmed on ${tour.tour_date} at ${tour.tour_time?.slice(0, 5)}. Reply HELP for help.`,
  });
}

async function sendTourReminder(tour) {
  return sendSMS({
    to: tour.phone,
    body: `Vasu Realty Reminder: Your tour for ${tour.listing_key} is tomorrow at ${tour.tour_time?.slice(0, 5)}. Reply HELP for help.`,
  });
}

async function sendInquiryAlert(agent, inquiry) {
  return sendSMS({
    to: agent.phone,
    body: `New inquiry from ${inquiry.name} for ${inquiry.listing_key}. Contact: ${inquiry.email} ${inquiry.phone || ''}`,
  });
}

async function sendOfferNotification(agent, offer) {
  return sendSMS({
    to: agent.phone,
    body: `New offer of $${Number(offer.desired_price).toLocaleString()} on ${offer.listing_key} from ${offer.name}.`,
  });
}

async function sendVerificationCode(phone, code) {
  return sendSMS({
    to: phone,
    body: `Your Vasu Realty verification code is: ${code}. Valid for 10 minutes.`,
  });
}

module.exports = {
  initSMS, sendSMS,
  sendTourConfirmation, sendTourReminder, sendInquiryAlert,
  sendOfferNotification, sendVerificationCode,
};
