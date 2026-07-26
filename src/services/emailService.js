/**
 * Email Notification Service
 *
 * Production-ready email service using Nodemailer.
 * Sends HTML emails for all form submissions.
 *
 * Configuration via environment variables:
 *   SMTP_HOST       — SMTP server hostname
 *   SMTP_PORT       — SMTP server port (default: 587)
 *   SMTP_USER       — SMTP username
 *   SMTP_PASSWORD   — SMTP password
 *   EMAIL_FROM      — "From" address for outgoing emails
 *   EMAIL_TO        — Default recipient address for notifications
 *
 * Error handling: If email delivery fails, the error is logged but
 * NEVER thrown — the caller should never fail due to email issues.
 */

const nodemailer = require('nodemailer');
const { EMAIL_FROM, EMAIL_TO } = require('../config');

// ================================================================
// Transporter
// ================================================================

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

  // If no SMTP config, create a debug transport that logs to console
  if (!SMTP_HOST) {
    transporter = {
      sendMail: async (opts) => {
        console.log(`[emailService] No SMTP configured. Would send email:`);
        console.log(`  To: ${opts.to}`);
        console.log(`  Subject: ${opts.subject}`);
        console.log(`  From: ${opts.from || EMAIL_FROM || 'noreply@vasurealty.com'}`);
        return { messageId: 'debug-no-smtp-configured' };
      },
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10) || 587,
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
    // Connection timeout
    connectionTimeout: 10000,
  });

  return transporter;
}

// ================================================================
// Send helper (fire-and-forget — never throws)
// ================================================================

async function sendEmail({ to, subject, html, replyTo }) {
  try {
    const transport = getTransporter();
    const from = EMAIL_FROM || 'noreply@vasurealty.com';
    const result = await transport.sendMail({ from, to, subject, html, replyTo });
    console.log(`[emailService] ✓ Email sent to ${to} — subject: "${subject}"`);
    return result;
  } catch (err) {
    console.error(`[emailService] ✗ Failed to send email to ${to}:`, err.message);
    // Never throw — email failures must not affect the user's submission
    return null;
  }
}

// ================================================================
// HTML Email Wrapper
// ================================================================

function wrapHtml(bodyContent) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .header { background: linear-gradient(135deg, #c8102e, #a00d26); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px; }
    .body { background: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; }
    .field { margin-bottom: 12px; }
    .field-label { font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .field-value { font-size: 14px; color: #18181b; }
    .divider { border: none; border-top: 1px solid #e4e4e7; margin: 16px 0; }
    .footer { text-align: center; padding: 16px; font-size: 11px; color: #a1a1aa; }
    .badge { display: inline-block; background: #c8102e; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Vasu Realty</h1>
      <p>New Form Submission Notification</p>
    </div>
    <div class="body">
      ${bodyContent}
    </div>
    <div class="footer">
      Vasu Realty &bull; Charlotte, NC &bull; thevasurealty.com
    </div>
  </div>
</body>
</html>`;
}

function field(label, value) {
  if (!value && value !== 0) return '';
  return `
    <div class="field">
      <div class="field-label">${label}</div>
      <div class="field-value">${typeof value === 'string' ? value.replace(/\n/g, '<br>') : value}</div>
    </div>`;
}

function formatPrice(p) {
  if (!p && p !== 0) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(p);
}

// ================================================================
// Buyer Agent Request Email
// ================================================================

function buyerAgentTemplate(data) {
  const body = `
    <p style="margin-top:0;color:#18181b;font-size:15px;"><strong>New Buyer Agent Request</strong></p>
    <div class="badge" style="margin-bottom:16px;">Buyer Inquiry</div>
    ${field('Name', data.name)}
    ${field('Email', data.email)}
    ${field('Phone', data.phone)}
    ${field('Preferred Location', data.preferredLocation)}
    ${field('Budget Range', data.budgetMin || data.budgetMax ? `${formatPrice(data.budgetMin)} — ${formatPrice(data.budgetMax)}` : '')}
    ${field('Property Type', data.propertyType)}
    ${field('Bedrooms', data.bedrooms)}
    ${field('Bathrooms', data.bathrooms)}
    ${field('Timeline', data.timeline)}
    ${field('Additional Requirements', data.additionalRequirements)}
    ${field('Submission Time', new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' }) + ' ET')}
    <hr class="divider">
    <p style="font-size:12px;color:#71717a;">This inquiry was submitted via the Buyer Agent Contact form on vasurealty.com.</p>
  `;
  return wrapHtml(body);
}

// ================================================================
// Contact Agent (Property Inquiry) Email
// ================================================================

function propertyAgentTemplate(data) {
  const body = `
    <p style="margin-top:0;color:#18181b;font-size:15px;"><strong>New Contact Agent Inquiry</strong></p>
    <div class="badge" style="margin-bottom:16px;">Property Inquiry</div>
    <p style="font-size:13px;color:#52525b;margin:0 0 12px;">A user has requested to be connected with the listing agent for the following property:</p>
    ${field('Property Address', data.propertyAddress)}
    ${field('MLS ID / Listing ID', data.listingId || data.listingKey)}
    ${field('Listing Price', formatPrice(data.listingPrice))}
    ${field('Property URL', data.propertyUrl ? `<a href="${data.propertyUrl}" style="color:#c8102e;">${data.propertyUrl}</a>` : '')}
    ${field('Listing Agent', data.listingAgentName)}
    ${field('Listing Agent MLS ID', data.listingAgentMlsId)}
    <hr class="divider">
    <p style="font-size:13px;color:#18181b;font-weight:600;margin:0 0 8px;">Customer Information</p>
    ${field('Name', data.name)}
    ${field('Email', data.email)}
    ${field('Phone', data.phone)}
    ${field('Message', data.message)}
    ${field('Submission Time', new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' }) + ' ET')}
    <hr class="divider">
    <p style="font-size:12px;color:#71717a;">This inquiry was submitted via the Contact Agent form on vasurealty.com.</p>
  `;
  return wrapHtml(body);
}

// ================================================================
// General Contact Email
// ================================================================

function generalContactTemplate(data) {
  const body = `
    <p style="margin-top:0;color:#18181b;font-size:15px;"><strong>New General Contact Submission</strong></p>
    <div class="badge" style="margin-bottom:16px;">General Inquiry</div>
    ${field('Name', data.name)}
    ${field('Email', data.email)}
    ${field('Phone', data.phone)}
    ${field('Subject', data.subject)}
    ${field('Inquiry Type', data.inquiry_type)}
    ${field('Source', data.source)}
    ${field('Message', data.message)}
    ${field('Submission Time', new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' }) + ' ET')}
    <hr class="divider">
    <p style="font-size:12px;color:#71717a;">This inquiry was submitted via the Contact form on vasurealty.com.</p>
  `;
  return wrapHtml(body);
}

// ================================================================
// Public API
// ================================================================

async function sendBuyerAgentNotification(data) {
  return sendEmail({
    to: EMAIL_TO,
    subject: `New Buyer Agent Request — ${data.name}`,
    html: buyerAgentTemplate(data),
    replyTo: data.email,
  });
}

async function sendPropertyAgentNotification(data) {
  return sendEmail({
    to: EMAIL_TO,
    subject: `New Property Inquiry — ${data.propertyAddress || data.listingId || 'Unknown Property'}`,
    html: propertyAgentTemplate(data),
    replyTo: data.email,
  });
}

async function sendGeneralContactNotification(data) {
  return sendEmail({
    to: EMAIL_TO,
    subject: `New Contact Form Submission — ${data.name}`,
    html: generalContactTemplate(data),
    replyTo: data.email,
  });
}

module.exports = {
  sendBuyerAgentNotification,
  sendPropertyAgentNotification,
  sendGeneralContactNotification,
};
