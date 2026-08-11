const { Worker } = require('bullmq');
const logger = require('../services/monitoring/logger');
const { captureException } = require('../services/monitoring/sentry');
const emailService = require('../services/email/emailService');
const pool = require('../config/database');

function createEmailWorker(connection) {
  const worker = new Worker('email', async (job) => {
    const { name, data } = job;
    logger.info(`Processing email job: ${name}`, { jobId: job.id, to: data?.to });

    try {
      let result;
      switch (name) {
        case 'send-welcome':
          result = await emailService.sendWelcomeEmail(data.user);
          break;
        case 'send-verification':
          result = await emailService.sendVerificationEmail(data.user, data.token);
          break;
        case 'send-password-reset':
          result = await emailService.sendPasswordResetEmail(data.user, data.token);
          break;
        case 'send-inquiry':
          result = await emailService.sendInquiryReceived(data.inquiry);
          break;
        case 'send-tour':
          result = await emailService.sendTourScheduled(data.tour);
          break;
        case 'send-tour-confirmed':
          result = await emailService.sendTourConfirmed(data.tour);
          break;
        case 'send-payment-failure':
          result = await emailService.sendPaymentFailure(data.user, data.subscription);
          break;
        case 'send-search-alert':
          result = await emailService.sendSavedSearchAlert(data.user, data.alert, data.listings);
          break;
        case 'send-price-drop':
          result = await emailService.sendPriceDropAlert(data.user, data.listing, data.oldPrice, data.newPrice);
          break;
        case 'send-custom':
          result = await emailService.sendEmail(data.message);
          break;
        default:
          logger.warn(`Unknown email job: ${name}`);
          return;
      }

      await pool.query(
        `INSERT INTO email_logs (recipient, template_id, message_id, status, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [data?.to || data?.user?.email, data?.template || name, result?.id || 'unknown', 'sent', JSON.stringify({ jobId: job.id, jobName: name })]
      );

      return result;
    } catch (err) {
      logger.error(`Email job failed: ${name}`, { error: err.message });
      captureException(err, { extra: { jobId: job.id, jobName: name } });

      await pool.query(
        `INSERT INTO email_logs (recipient, template_id, status, error_message, metadata)
         VALUES ($1, $2, 'failed', $3, $4)`,
        [data?.to || data?.user?.email, name, err.message, JSON.stringify({ jobId: job.id, jobName: name })]
      );

      throw err;
    }
  }, { connection, concurrency: 5 });

  return worker;
}

module.exports = { createEmailWorker };
