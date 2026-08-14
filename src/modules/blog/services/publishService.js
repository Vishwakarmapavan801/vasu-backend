/**
 * Blog publish service.
 *
 * Publishes an approved blog post to its destinations:
 *   website  — flip status to PUBLISHED + set published_at/canonical_url
 *   facebook — Facebook Page photo/link post via the Graph API
 *   linkedin — LinkedIn Company Page article share via the UGC Posts API
 *
 * Each destination is driven by environment variables and returns a
 * structured result; when credentials are unconfigured the destination is
 * recorded as SKIPPED (never mocked, never blocking the rest of the flow).
 *
 * Env:
 *   FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN
 *   LINKEDIN_ORG_URN (urn:li:organization:xxxx) / LINKEDIN_ACCESS_TOKEN
 */

const axios = require('axios');
const {
  FACEBOOK_PAGE_ID,
  FACEBOOK_PAGE_ACCESS_TOKEN,
  LINKEDIN_ORG_URN,
  LINKEDIN_ACCESS_TOKEN,
  CLIENT_URL,
} = require('../../../config');
const logger = require('../../../services/monitoring/logger');

const GRAPH_API_VERSION = 'v21.0';

function isFacebookConfigured() {
  return Boolean(FACEBOOK_PAGE_ID && FACEBOOK_PAGE_ACCESS_TOKEN);
}

function isLinkedInConfigured() {
  return Boolean(LINKEDIN_ORG_URN && LINKEDIN_ACCESS_TOKEN);
}

function publicPostUrl(post) {
  return post.canonical_url || `${CLIENT_URL || 'https://vasurealty.com'}/blog/${post.slug}`;
}

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

async function publishToWebsite(post) {
  // Website publishing is a DB state change — handled by blogAdminService.
  // This function exists so every destination has a symmetric contract.
  return {
    ok: true,
    externalId: null,
    externalUrl: publicPostUrl(post),
    detail: 'Website publish (status → PUBLISHED) applied by admin service.',
  };
}

/**
 * Publish to a Facebook Page.
 * Prefers a photo post (title/excerpt/URL + cover image); falls back to a
 * message+link feed post when the cover image is not a public absolute URL.
 */
async function publishToFacebook(post) {
  const startedAt = Date.now();
  if (!isFacebookConfigured()) {
    return { ok: false, skipped: true, detail: 'FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN not configured' };
  }

  const message = `${post.title}\n\n${post.excerpt || ''}\n\n${publicPostUrl(post)}`.trim();
  const cover = post.cover_image_url || post.og_image || post.featured_image;

  try {
    let endpoint;
    let params;
    if (isAbsoluteUrl(cover)) {
      endpoint = `https://graph.facebook.com/${GRAPH_API_VERSION}/${FACEBOOK_PAGE_ID}/photos`;
      params = { url: cover, message, access_token: FACEBOOK_PAGE_ACCESS_TOKEN };
    } else {
      endpoint = `https://graph.facebook.com/${GRAPH_API_VERSION}/${FACEBOOK_PAGE_ID}/feed`;
      params = { message, link: publicPostUrl(post), access_token: FACEBOOK_PAGE_ACCESS_TOKEN };
    }

    const res = await axios.post(endpoint, null, { params, timeout: 30000 });
    const id = res.data?.id;

    logger.info('blog publish: facebook ok', { postId: post.id, id, durationMs: Date.now() - startedAt });
    return { ok: true, externalId: id, externalUrl: `https://www.facebook.com/${FACEBOOK_PAGE_ID}/posts/${id}` };
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    logger.error('blog publish: facebook failed', { postId: post.id, error: detail });
    return { ok: false, detail };
  }
}

/**
 * Publish to a LinkedIn Company Page as an article share.
 */
async function publishToLinkedIn(post) {
  const startedAt = Date.now();
  if (!isLinkedInConfigured()) {
    return { ok: false, skipped: true, detail: 'LINKEDIN_ORG_URN / LINKEDIN_ACCESS_TOKEN not configured' };
  }

  const summary = `${post.excerpt || ''}\n\nRead the full article: ${publicPostUrl(post)}`.trim();
  const body = {
    author: LINKEDIN_ORG_URN,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: summary },
        shareMediaCategory: 'ARTICLE',
        media: [
          {
            status: 'READY',
            description: { text: post.excerpt || '' },
            originalUrl: publicPostUrl(post),
            title: { text: post.title },
          },
        ],
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  try {
    const res = await axios.post('https://api.linkedin.com/v2/ugcPosts', body, {
      headers: {
        Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 30000,
    });

    const id = res.data?.id;
    logger.info('blog publish: linkedin ok', { postId: post.id, id, durationMs: Date.now() - startedAt });
    return { ok: true, externalId: id, externalUrl: `https://www.linkedin.com/feed/update/${id}` };
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    logger.error('blog publish: linkedin failed', { postId: post.id, error: detail });
    return { ok: false, detail };
  }
}

module.exports = {
  publishToWebsite,
  publishToFacebook,
  publishToLinkedIn,
  isFacebookConfigured,
  isLinkedInConfigured,
  publicPostUrl,
};
