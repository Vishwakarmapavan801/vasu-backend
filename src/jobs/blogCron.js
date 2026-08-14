/**
 * Blog Cron Automation
 *
 * Every morning at BLOG_CRON_TIME (default 08:00, BLOG_CRON_TZ timezone) the
 * cron generates a trending local market article through the real pipeline
 * (AutoSocial MCP snapshot → OpenAI → storage → DB) and leaves it in status
 * GENERATED for admin approval. Admins are notified by email.
 *
 * Safe to run on multiple instances: the last-run marker is stored in Redis,
 * and the whole check is best-effort — a failure only logs and never crashes
 * the server.
 */

const { generateAndStore } = require('../modules/blog/services/blogAdminService');
const { getConfigStatus } = require('../services/autosocial/mcpClient');
const { sendEmail } = require('../services/email/emailService');
const logger = require('../services/monitoring/logger');
const redisCache = require('../utils/redisCache');
const {
  BLOG_CRON_ENABLED,
  BLOG_CRON_TIME,
  BLOG_CRON_TZ,
  BROKERAGE_NAME,
  EMAIL_TO,
} = require('../config');

const CHECK_INTERVAL_MS = 60 * 1000;
const LAST_RUN_KEY = 'blog:cron:last-run';

let timer = null;

function nowInTimezone(tz, format) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...format }).format(new Date());
}

function isDueTime() {
  const [wantedHour, wantedMinute] = String(BLOG_CRON_TIME).split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(wantedHour) || !Number.isFinite(wantedMinute)) return false;

  const parts = nowInTimezone(BLOG_CRON_TZ, { hour: '2-digit', minute: '2-digit', hour12: false });
  const [hour, minute] = parts.split(':').map((n) => parseInt(n, 10));
  return hour === wantedHour && minute === wantedMinute;
}

function buildTopic() {
  const monthYear = nowInTimezone(BLOG_CRON_TZ, { month: 'long', year: 'numeric' });
  return `${BROKERAGE_NAME || 'Vasu Realty'} — Charlotte Metro Real Estate Market Update: ${monthYear}`;
}

async function alreadyRanToday() {
  const today = nowInTimezone(BLOG_CRON_TZ, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const last = await redisCache.get(LAST_RUN_KEY);
  return last === today;
}

async function markRanToday() {
  const today = nowInTimezone(BLOG_CRON_TZ, { year: 'numeric', month: '2-digit', day: '2-digit' });
  await redisCache.set(LAST_RUN_KEY, today, 60 * 60 * 1000);
}

async function runDailyGeneration() {
  const status = getConfigStatus();
  if (!status.configured) {
    logger.warn('blog cron: skipped — AutoSocial MCP not configured', { missing: status.missing });
    return;
  }

  if (await alreadyRanToday()) return;

  logger.info('blog cron: running daily generation');
  try {
    const topic = buildTopic();
    const { post, job } = await generateAndStore({ topic, triggerType: 'cron' });
    await markRanToday();
    logger.info('blog cron: article generated (awaiting approval)', { postId: post.id, slug: post.slug, jobId: job.id });

    // Notify admin for approval.
    try {
      await sendEmail({
        to: EMAIL_TO,
        templateId: process.env.BLOG_CRON_NOTIFY_TEMPLATE || 'd-blog-notify',
        dynamicTemplateData: {
          topic,
          post_url: `${process.env.CLIENT_URL || 'https://vasurealty.com'}/admin/blog/${post.id}`,
          status: 'GENERATED',
        },
      });
    } catch (err) {
      logger.warn('blog cron: admin notification failed', { error: err.message });
    }
  } catch (err) {
    logger.error('blog cron: daily generation failed', { error: err.message, stack: err.stack });
  }
}

function startBlogCron() {
  if (!BLOG_CRON_ENABLED) {
    logger.info('blog cron: disabled (BLOG_CRON_ENABLED=false)');
    return;
  }
  if (timer) return;

  logger.info(`blog cron: scheduled daily ${BLOG_CRON_TIME} (${BLOG_CRON_TZ})`);
  timer = setInterval(() => {
    if (isDueTime()) {
      runDailyGeneration().catch((err) => logger.error('blog cron: unexpected error', { error: err.message }));
    }
  }, CHECK_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

module.exports = { startBlogCron, runDailyGeneration, isDueTime };
