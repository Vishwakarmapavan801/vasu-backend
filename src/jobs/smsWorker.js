const { Worker } = require('bullmq');
const logger = require('../services/monitoring/logger');
const { captureException } = require('../services/monitoring/sentry');
const smsService = require('../services/sms/smsService');

function createSMSWorker(connection) {
  const worker = new Worker('sms', async (job) => {
    const { name, data } = job;
    logger.info(`Processing SMS job: ${name}`, { jobId: job.id });

    switch (name) {
      case 'tour-confirmation':
        return await smsService.sendTourConfirmation(data.tour);
      case 'tour-reminder':
        return await smsService.sendTourReminder(data.tour);
      case 'inquiry-alert':
        return await smsService.sendInquiryAlert(data.agent, data.inquiry);
      case 'offer-notification':
        return await smsService.sendOfferNotification(data.agent, data.offer);
      case 'verification-code':
        return await smsService.sendVerificationCode(data.phone, data.code);
      case 'custom':
        return await smsService.sendSMS(data.message);
      default:
        logger.warn(`Unknown SMS job: ${name}`);
    }
  }, { connection, concurrency: 5 });

  worker.on('failed', (job, err) => {
    logger.error(`SMS job ${job?.id} failed`, { error: err.message });
    captureException(err, { extra: { jobId: job?.id, jobName: job?.name } });
  });

  return worker;
}

module.exports = { createSMSWorker };
