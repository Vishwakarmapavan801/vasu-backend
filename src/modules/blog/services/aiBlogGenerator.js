/**
 * AI Blog Generator
 *
 * Turns a requested topic + the real AutoSocial MCP live snapshot into a
 * complete, SEO-optimized HTML article and a branded 1200×630 cover image.
 *
 * - Article: OpenAI structured-output JSON (title, slug, excerpt, HTML body,
 *   SEO title, meta description, image prompt, tags). No Markdown — the body
 *   is semantic HTML (H1 → H2/H3 sections, FAQ, CTA, schema-ready markup).
 * - Cover: OpenAI image generation resized with sharp to exactly 1200×630.
 *   If generation fails, the primary property listing photo from the MCP
 *   snapshot is used automatically (uploaded the same way).
 *
 * Nothing here is mocked: every byte of content is derived from the real MCP
 * snapshot passed in and the real OpenAI API.
 */

const sharp = require('sharp');
const { getClient } = require('../../../services/openaiService');
const { chatCompletion } = require('../../../services/openaiService');
const {
  BLOG_OPENAI_MODEL,
  BLOG_OPENAI_MAX_TOKENS,
  BLOG_IMAGE_MODEL,
  BLOG_IMAGE_SIZE,
  BLOG_AUTHOR_NAME,
  BLOG_COVER_WIDTH,
  BLOG_COVER_HEIGHT,
  BROKERAGE_NAME,
  BROKERAGE_ADDRESS,
  CLIENT_URL,
} = require('../../../config');
const logger = require('../../../services/monitoring/logger');

const ARTICLE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: 'string' },
    content_html: { type: 'string' },
    seo_title: { type: 'string' },
    meta_description: { type: 'string' },
    image_prompt: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'slug',
    'excerpt',
    'content_html',
    'seo_title',
    'meta_description',
    'image_prompt',
    'tags',
  ],
  additionalProperties: false,
};

// ============================================================
// MCP data → compact context
// ============================================================

function compactListings(listings) {
  if (!Array.isArray(listings)) return [];
  return listings.slice(0, 12).map((l) => {
    const pick = (keys) => {
      for (const k of keys) {
        if (l[k] !== undefined && l[k] !== null) return l[k];
      }
      return undefined;
    };
    const price = pick(['ListPrice', 'price', 'listPrice']);
    const beds = pick(['BedroomsTotal', 'bedrooms', 'beds']);
    const baths = pick(['BathroomsTotal', 'bathrooms', 'baths', 'BathroomsFull']);
    const sqft = pick(['LivingArea', 'squareFeet', 'sqft']);
    const city = pick(['City', 'city']);
    const state = pick(['StateOrProvince', 'state']);
    const address = pick(['UnparsedAddress', 'address']);
    return {
      address,
      city,
      state,
      price: price != null ? Number(price) : null,
      beds: beds != null ? Number(beds) : null,
      baths: baths != null ? Number(baths) : null,
      sqft: sqft != null ? Number(sqft) : null,
      status: pick(['StandardStatus', 'status']),
      subdivision: pick(['SubdivisionName', 'subdivision']),
    };
  }).filter((l) => l.address || l.city);
}

function pickPrimaryPhoto(listings) {
  if (!Array.isArray(listings)) return null;
  const photoKeys = ['MediaURL', 'photo', 'image', 'url', 'primaryPhoto', 'mediaUrl'];
  for (const l of listings) {
    if (!l) continue;
    // Nested media arrays first (most common in MLS payloads).
    const media = l.Media || l.media || l.images || l.photos || [];
    if (Array.isArray(media)) {
      for (const m of media) {
        if (!m) continue;
        for (const k of photoKeys) {
          if (typeof m[k] === 'string' && /^https?:\/\//i.test(m[k])) return m[k];
        }
      }
    }
    for (const k of photoKeys) {
      if (typeof l[k] === 'string' && /^https?:\/\//i.test(l[k])) return l[k];
    }
  }
  return null;
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return null;
}

/**
 * Build the compact, token-friendly context object passed to the LLM.
 * Only real data from the MCP bundle is included.
 */
function buildGenerationContext({ snapshot, listings, neighborhoods, market, activity, topic }) {
  const context = {
    topic,
    requested_at: new Date().toISOString(),
    company: {
      name: BROKERAGE_NAME || 'Vasu Realty',
      address: BROKERAGE_ADDRESS || null,
      website: CLIENT_URL || null,
      author: BLOG_AUTHOR_NAME,
      internal_links: {
        all_listings: `${CLIENT_URL || 'https://vasurealty.com'}/buy/all-listings`,
        contact: `${CLIENT_URL || 'https://vasurealty.com'}/contact`,
        blog: `${CLIENT_URL || 'https://vasurealty.com'}/blog`,
      },
    },
    snapshot: snapshot || null,
    listings: compactListings(listings),
    neighborhoods: Array.isArray(neighborhoods) ? neighborhoods.slice(0, 10) : neighborhoods,
    market: market || null,
    activity: Array.isArray(activity) ? activity.slice(0, 10) : activity,
  };
  return context;
}

// ============================================================
// Article generation
// ============================================================

function buildSystemPrompt() {
  return `You are the senior content strategist for ${BROKERAGE_NAME || 'Vasu Realty'}, a real estate brokerage serving the Charlotte, NC metro and surrounding North Carolina / South Carolina markets.

You write original, expert, SEO-optimized real estate articles. You ONLY use the real market data provided in the user message — you never invent statistics, prices, schools, commute times, or listings. When the provided data lacks a detail, you say so honestly in the copy ("check current listings") instead of fabricating it.

ARTICLE REQUIREMENTS (output raw HTML, never Markdown):
1. A single <h1> title.
2. An introduction paragraph.
3. Multiple <h2> and <h3> sections covering, when the data supports it: neighborhood insights, pricing trends, schools, commute information, local amenities, and buying tips.
4. A clear CTA section pointing readers to Vasu Realty (use /contact and /buy/all-listings internal links).
5. At least two internal links to other Vasu Realty pages.
6. External authority references (e.g. US Census Bureau, NC Realtors / CarolinaMLS, local school district sites) as <a> links — only well-known, real sites.
7. An FAQ section: <h2>Frequently Asked Questions</h2> with 3–5 <h3> questions and <p> answers.
8. Schema-ready structure: use semantic HTML5 (section, article, h1-h3, ul, table where useful). FAQ answers should be concise and self-contained.
9. Target 1200–1600 words.
10. Use classes sparingly: class="blog-lead" on the intro paragraph.

The output JSON fields:
- title: an engaging, keyword-focused title (max ~70 chars).
- slug: URL slug derived from the title (lowercase, hyphens, no trailing slash).
- excerpt: 140–160 char summary with a hook.
- content_html: the full article HTML body (NOT including the <h1> — the title is rendered separately).
- seo_title: <=60 char SEO title that includes a primary keyword.
- meta_description: 150–160 char meta description.
- image_prompt: a detailed prompt for a 1200x630 modern real-estate cover image with a Charlotte / North Carolina context when relevant, suitable for Vasu Realty branding (clean, premium, no text).
- tags: 4–8 short tags (e.g. "Charlotte Real Estate", "First-Time Buyers", "Neighborhood Guides").`;
}

function buildUserMessage(context) {
  return `Write the article now.

TOPIC: ${context.topic}

REAL MARKET DATA (use only this — never invent data):
${JSON.stringify(context, null, 2)}

Remember: no fabricated statistics, no Markdown, raw HTML only, structured JSON output.`;
}

/**
 * Generate the complete article via OpenAI structured output.
 * @returns {Promise<{title, slug, excerpt, content_html, seo_title, meta_description, image_prompt, tags}>}
 */
async function generateArticle({ topic, context }) {
  const startedAt = Date.now();
  const result = await chatCompletion({
    systemPrompt: buildSystemPrompt(),
    userMessage: buildUserMessage(context),
    jsonSchema: ARTICLE_JSON_SCHEMA,
    maxTokens: BLOG_OPENAI_MAX_TOKENS,
    temperature: 0.7,
    model: BLOG_OPENAI_MODEL,
  });

  if (!result.success || !result.data) {
    throw new Error(`AI article generation failed: ${result.error || 'unknown error'}`);
  }

  logger.info('ai blog: article generated', {
    model: result.model,
    durationMs: Date.now() - startedAt,
    topic,
    chars: (result.data.content_html || '').length,
  });

  return result.data;
}

// ============================================================
// Cover image generation
// ============================================================

const SUPPORTED_IMAGE_SIZES = {
  'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
  'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
};

function resolveImageSize(model) {
  const supported = SUPPORTED_IMAGE_SIZES[model] || SUPPORTED_IMAGE_SIZES['dall-e-3'];
  return supported.includes(BLOG_IMAGE_SIZE) ? BLOG_IMAGE_SIZE : supported[0];
}

async function openAIImageBuffer({ prompt, model = BLOG_IMAGE_MODEL }) {
  const client = getClient();
  const size = resolveImageSize(model);
  const response = await client.images.generate({
    model,
    prompt,
    size,
    n: 1,
    response_format: 'b64_json',
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image response contained no data');
  return Buffer.from(b64, 'base64');
}

/**
 * Resize any image buffer to the branded 1200×630 cover (cover crop, JPEG).
 */
async function toCoverJpeg(buffer) {
  return sharp(buffer)
    .resize(BLOG_COVER_WIDTH, BLOG_COVER_HEIGHT, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();
}

/**
 * Generate + size the branded cover image.
 * @returns {Promise<{buffer: Buffer, width: number, height: number, mimeType: string, source: string}>}
 */
async function generateCoverImage({ imagePrompt, title }) {
  const startedAt = Date.now();
  const prompt = `${imagePrompt || title} — premium modern real-estate cover image, 1200x630 social share format, clean composition, professional photography, subtle gold/navy brand accents, no text, no watermarks.`;

  const raw = await openAIImageBuffer({ prompt });
  const buffer = await toCoverJpeg(raw);

  logger.info('ai blog: cover image generated', {
    model: BLOG_IMAGE_MODEL,
    durationMs: Date.now() - startedAt,
    bytes: buffer.length,
  });

  return {
    buffer,
    width: BLOG_COVER_WIDTH,
    height: BLOG_COVER_HEIGHT,
    mimeType: 'image/jpeg',
    source: 'openai',
  };
}

/**
 * Fallback: use the primary property listing photo from the MCP snapshot.
 * Downloads + resizes it to the same 1200×630 branded format.
 */
async function coverFromListingPhoto(listings) {
  const photoUrl = pickPrimaryPhoto(listings);
  if (!photoUrl) {
    throw new Error('Cover generation failed and no MCP listing photo was available for fallback.');
  }

  const axios = require('axios');
  const response = await axios.get(photoUrl, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'VasuRealty-Blog/1.0' },
  });
  const buffer = await toCoverJpeg(Buffer.from(response.data));

  logger.info('ai blog: cover fell back to MCP listing photo', { source: photoUrl, bytes: buffer.length });
  return {
    buffer,
    width: BLOG_COVER_WIDTH,
    height: BLOG_COVER_HEIGHT,
    mimeType: 'image/jpeg',
    source: 'mcp',
    sourceUrl: photoUrl,
  };
}

function xmlEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Branded fallback cover (1200×630) rendered from the brand palette when
 * neither OpenAI image generation nor an MCP listing photo is available.
 * Deterministic SVG composed with sharp — no external assets, no dummy data.
 */
async function createBrandedFallbackCover({ title }) {
  const titleText = xmlEscape(String(title || '').slice(0, 64));
  const brandName = xmlEscape(BROKERAGE_NAME || 'Vasu Realty');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${BLOG_COVER_WIDTH}" height="${BLOG_COVER_HEIGHT}" viewBox="0 0 ${BLOG_COVER_WIDTH} ${BLOG_COVER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b2240"/>
      <stop offset="100%" stop-color="#0a1a2f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#bc9c73"/>
      <stop offset="100%" stop-color="#d4b98a"/>
    </linearGradient>
  </defs>
  <rect width="${BLOG_COVER_WIDTH}" height="${BLOG_COVER_HEIGHT}" fill="url(#bg)"/>
  <circle cx="1080" cy="80" r="260" fill="#132a4a" opacity="0.55"/>
  <circle cx="120" cy="600" r="200" fill="#0a1a2f" opacity="0.7"/>
  <rect x="90" y="170" width="72" height="8" rx="4" fill="url(#accent)"/>
  <text x="90" y="250" font-family="Poppins, Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${brandName}</text>
  <text x="90" y="390" font-family="Poppins, Arial, sans-serif" font-size="46" font-weight="600" fill="#d4b98a" font-style="italic">${titleText}</text>
  <text x="90" y="520" font-family="Poppins, Arial, sans-serif" font-size="24" fill="#8fa3bd">Real Estate · Charlotte, NC &amp; The Carolinas</text>
  <text x="90" y="575" font-family="Poppins, Arial, sans-serif" font-size="20" fill="#bc9c73">vasurealty.com</text>
</svg>`;

  const buffer = await sharp(Buffer.from(svg))
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();

  logger.info('ai blog: branded fallback cover generated', { bytes: buffer.length });
  return {
    buffer,
    width: BLOG_COVER_WIDTH,
    height: BLOG_COVER_HEIGHT,
    mimeType: 'image/jpeg',
    source: 'branded_fallback',
  };
}

/**
 * Cover image with the full fallback chain, per spec:
 *   OpenAI generation → MCP listing photo → branded fallback (never throws).
 */
async function generateCoverWithFallback({ imagePrompt, title, listings }) {
  try {
    return await generateCoverImage({ imagePrompt, title });
  } catch (openAiErr) {
    logger.warn('ai blog: OpenAI cover generation failed, trying MCP listing photo', { error: openAiErr.message });
    try {
      return await coverFromListingPhoto(listings);
    } catch (listingErr) {
      logger.warn('ai blog: MCP listing photo unavailable, using branded fallback cover', { error: listingErr.message });
      return createBrandedFallbackCover({ title });
    }
  }
}

module.exports = {
  generateArticle,
  generateCoverImage,
  generateCoverWithFallback,
  coverFromListingPhoto,
  createBrandedFallbackCover,
  buildGenerationContext,
  compactListings,
  pickPrimaryPhoto,
  ARTICLE_JSON_SCHEMA,
};
