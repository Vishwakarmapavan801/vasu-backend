/**
 * Email Service
 *
 * Handles sending transactional emails (password reset, notifications, etc.).
 * Uses nodemailer for SMTP or falls back to console logging when not configured.
 */

const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Send an email
 *
 * In development without SMTP configured, logs the email to console.
 * In production, configure SMTP_* environment variables.
 *
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body (optional fallback)
 * @returns {Promise<Object>} Send result
 */
async function sendEmail({ to, subject, html, text }) {
  // Check if SMTP is configured
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME || 'Vasu Realty'}" <${process.env.FROM_EMAIL || 'noreply@vasurealty.com'}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });

      logger.info('Email sent successfully', { to, messageId: info.messageId });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Failed to send email via SMTP', {
        to,
        error: error.message,
      });
      throw error;
    }
  }

  // Development fallback: log the email to console
  logger.info('Email would be sent (SMTP not configured)', {
    to,
    subject,
    htmlLength: html?.length || 0,
  });

  console.log('');
  console.log('========================================');
  console.log('  EMAIL (development mode)');
  console.log('========================================');
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log('========================================');
  console.log('');

  return { success: true, sent: false, mode: 'development' };
}

module.exports = { sendEmail };
