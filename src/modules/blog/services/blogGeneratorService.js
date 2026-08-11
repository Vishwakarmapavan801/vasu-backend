/**
 * MLS Blog Content Generator
 *
 * Produces the production blog_posts content for the public MLS blog
 * (public URL /blog) directly from live MLS Grid listing data. There is
 * NO dummy/hardcoded copy anywhere — every article field (title, slug,
 * excerpt, content, tags, city/county/neighborhood, image, stats) is
 * derived from real listing fields returned by the MLS Grid v2 OData API.
 *
 * Article types produced:
 *   1. Listing articles  — one per active listing. Category assigned from
 *      real attributes: Luxury Homes (>= $750k), Investment (income /
 *      multi-family property classes), otherwise New Listings.
 *   2. Market Trends     — one per city, aggregated from the listings
 *      actually present in the fetch (median price, avg DOM, price/sqft,
 *      inventory, top price, bed/bath medians).
 *   3. Neighborhood Guides — one per city, listing real subdivisions and
 *      school names drawn from the listings present.
 *
 * Idempotent: upserts keyed on listing_key (listing articles) and slug
 * (city articles), so re-running refreshes rather than duplicates.
 *
 * CLI:  node src/modules/blog/services/blogGeneratorService.js --run [maxListings]
 */

const pool = require('../../../config/database');
const { fetchWithRetry, normalizeProperty } = require('../../../services/mlsService');
const { MLS_GRID_BASE_URL, CLIENT_URL } = require('../../../config');
const logger = require('../../../services/monitoring/logger');

const AUTHOR_NAME = 'Vasu Realty';
const LUXURY_PRICE_THRESHOLD = 750000;
const MAX_LISTINGS_DEFAULT = 500;
const MAX_CITIES = 12;
const FEATURED_COUNT = 5;

const CATEGORIES = {
  MARKET_TRENDS: 'Market Trends',
  NEIGHBORHOOD_GUIDES: 'Neighborhood Guides',
  NEW_LISTINGS: 'New Listings',
  LUXURY_HOMES: 'Luxury Homes',
  INVESTMENT: 'Investment',
};

// ============================================================
// helpers
// ============================================================

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * HTML-escape every value sourced from MLS before it is embedded into the
 * generated article HTML. Article markup (h2/p/ul/li/strong/em) is authored
 * by the template below; everything dynamic (remarks, schools, features,
 * addresses) is escaped here so the frontend can safely render with
 * dangerouslySetInnerHTML.
 */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function estimateReadTime(text) {
  return Math.max(1, Math.round(wordCount(text) / 220));
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatComma(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function truncate(text, max) {
  const clean = cleanText(text);
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function listingState(p) {
  return p.StateOrProvince || 'NC';
}

function assignCategory(p) {
  const type = String(p.PropertyType || '').toLowerCase();
  const subType = String(p.PropertySubType || '').toLowerCase();
  const pClass = String(p.PropertyClass || '').toLowerCase();
  const isIncome =
    type.includes('income') ||
    subType.includes('income') ||
    pClass.includes('income') ||
    subType.includes('multi') ||
    pClass.includes('multi');
  if (isIncome) return CATEGORIES.INVESTMENT;
  if (Number(p.ListPrice) >= LUXURY_PRICE_THRESHOLD) return CATEGORIES.LUXURY_HOMES;
  return CATEGORIES.NEW_LISTINGS;
}

function buildTags(p, category) {
  const tags = new Set();
  tags.add(category);
  if (Number(p.BedroomsTotal) > 0) tags.add(`${p.BedroomsTotal} Bedroom${p.BedroomsTotal > 1 ? 's' : ''}`);
  if (Number(p.BathroomsTotal) > 0) tags.add(`${p.BathroomsTotal} Bath${p.BathroomsTotal > 1 ? 's' : ''}`);
  if (p.SubdivisionName) tags.add(cleanText(p.SubdivisionName));
  if (p.City) tags.add(cleanText(p.City));
  if (p.CountyOrParish) tags.add(`${cleanText(p.CountyOrParish)} County`);
  if (p.YearBuilt) tags.add(`Built ${p.YearBuilt}`);
  if (String(p.NewConstructionYN).toUpperCase() === 'Y') tags.add('New Construction');
  if (p.PoolYN === true || String(p.PoolYN).toUpperCase() === 'Y') tags.add('Pool');
  if (String(p.WaterfrontYN).toUpperCase() === 'Y') tags.add('Waterfront');
  return Array.from(tags).slice(0, 8);
}

function excerptFor(p) {
  const remarks = cleanText(p.PublicRemarks);
  if (remarks) return truncate(remarks, 200);
  const parts = [
    `${p.BedroomsTotal || 0} bedroom, ${p.BathroomsTotal || 0} bathroom home`,
    p.City ? `in ${p.City}, ${listingState(p)}` : '',
    p.ListPrice ? `listed at ${formatPrice(p.ListPrice)}` : '',
  ].filter(Boolean);
  return `${parts.join(' ')}.`;
}

function listingTitle(p, category) {
  const city = cleanText(p.City) || 'the area';
  const state = listingState(p);
  const beds = Number(p.BedroomsTotal);
  const baths = Number(p.BathroomsTotal);
  if (beds > 0 && baths > 0) {
    return `${beds} Bed, ${baths} Bath Home for Sale in ${city}, ${state}`;
  }
  const address = cleanText(p.UnparsedAddress);
  if (address) return `${address} — Home for Sale in ${city}, ${state}`;
  return `Home for Sale in ${city}, ${state}`;
}

function listingSlug(p, title) {
  const id = p.ListingId || (p.ListingKey || 'home').toString().slice(-8);
  return `${slugify(title)}-${id}`;
}

function mediaImage(p) {
  const media = (p.Media || []).filter((m) => m.MediaURL);
  if (!media.length) return null;
  const first = media[0];
  return {
    image: first.MediaProxyURL || first.MediaURL,
    cdnUrl: first.MediaURL,
    mediaKey: first.MediaKey,
    mediaKeys: media.slice(0, 6).map((m) => m.MediaKey).filter(Boolean),
  };
}

function keyDetails(p) {
  const rows = [];
  const price = formatPrice(p.ListPrice);
  const sqft = formatComma(p.LivingArea);
  const pricePerSqft = Number(p.ListPrice) && Number(p.LivingArea)
    ? formatPrice(Math.round((Number(p.ListPrice) / Number(p.LivingArea)) * 100) / 100)
    : null;

  if (price) rows.push(['Price', price]);
  if (sqft) rows.push(['Living Area', `${sqft} sq ft`]);
  if (pricePerSqft) rows.push(['Price / Sq Ft', pricePerSqft]);
  if (p.BedroomsTotal) rows.push(['Bedrooms', String(p.BedroomsTotal)]);
  if (p.BathroomsTotal) rows.push(['Bathrooms', String(p.BathroomsTotal)]);
  if (p.YearBuilt) rows.push(['Year Built', String(p.YearBuilt)]);
  if (p.GarageSpaces) rows.push(['Garage Spaces', String(p.GarageSpaces)]);
  if (p.LotSizeAcres) rows.push(['Lot Size', `${formatComma(p.LotSizeAcres)} acres`]);
  if (p.DaysOnMarket !== null && p.DaysOnMarket !== undefined) rows.push(['Days on Market', `${Math.round(p.DaysOnMarket)} days`]);
  if (p.SubdivisionName) rows.push(['Subdivision', cleanText(p.SubdivisionName)]);
  if (p.CountyOrParish) rows.push(['County', cleanText(p.CountyOrParish)]);
  if (p.ArchitecturalStyle) rows.push(['Style', cleanText(p.ArchitecturalStyle)]);
  if (p.Condition) rows.push(['Condition', cleanText(p.Condition)]);
  if (p.Heating) rows.push(['Heating', cleanText(p.Heating)]);
  if (p.Cooling) rows.push(['Cooling', cleanText(p.Cooling)]);
  return rows;
}

function buildListingHtml(p, category) {
  const details = keyDetails(p);
  const remarks = cleanText(p.PublicRemarks);
  const address = cleanText(p.UnparsedAddress);
  const city = cleanText(p.City);
  const state = listingState(p);
  const parts = [];

  const detailList = details
    .map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`)
    .join('\n        ');

  parts.push(`<p class="blog-lead">${esc(truncate(remarks, 420)) || `This ${esc(category.toLowerCase())} in ${esc(city)}, ${esc(state)} is currently listed with Vasu Realty.`}</p>`);

  if (details.length) {
    parts.push(`<h2>Key Details</h2>\n<ul class="blog-details">\n        ${detailList}\n      </ul>`);
  }

  if (remarks.length > 420) {
    parts.push(`<h2>About This Home</h2>\n<p>${esc(remarks.slice(420))}</p>`);
  }

  const locationBits = [];
  if (address) locationBits.push(`${esc(address)},`);
  if (city) locationBits.push(`${esc(city)}, ${esc(state)}`);
  if (p.PostalCode) locationBits.push(`${esc(p.PostalCode)}`);
  parts.push(`<h2>Location</h2>\n<p>This property is located at ${locationBits.join(' ')}.</p>`);

  const schoolLines = [];
  if (p.ElementarySchool) schoolLines.push(`<li>Elementary: ${esc(cleanText(p.ElementarySchool))}</li>`);
  if (p.MiddleOrJuniorSchool) schoolLines.push(`<li>Middle: ${esc(cleanText(p.MiddleOrJuniorSchool))}</li>`);
  if (p.HighSchool) schoolLines.push(`<li>High: ${esc(cleanText(p.HighSchool))}</li>`);
  if (schoolLines.length) {
    parts.push(`<h2>Schools</h2>\n<ul>\n        ${schoolLines.join('\n        ')}\n      </ul>`);
  }

  const financial = [];
  if (p.AssociationFee) financial.push(`<li><strong>HOA Fee:</strong> ${esc(formatPrice(p.AssociationFee))}${p.AssociationFeeFrequency ? ` ${esc(cleanText(p.AssociationFeeFrequency).toLowerCase())}` : ''}</li>`);
  if (p.TaxAnnualAmount) financial.push(`<li><strong>Annual Taxes:</strong> ${esc(formatPrice(p.TaxAnnualAmount))}${p.TaxYear ? ` (${esc(String(p.TaxYear))})` : ''}</li>`);
  if (financial.length) {
    parts.push(`<h2>Financial Details</h2>\n<ul>\n        ${financial.join('\n        ')}\n      </ul>`);
  }

  const features = [];
  if (p.InteriorFeatures) features.push(...cleanText(p.InteriorFeatures).split(',').map((s) => s.trim()).filter(Boolean));
  if (p.ExteriorFeatures) features.push(...cleanText(p.ExteriorFeatures).split(',').map((s) => s.trim()).filter(Boolean));
  if (p.FireplaceFeatures) features.push(...cleanText(p.FireplaceFeatures).split(',').map((s) => s.trim()).filter(Boolean));
  if (p.PoolFeatures) features.push(...cleanText(p.PoolFeatures).split(',').map((s) => s.trim()).filter(Boolean));
  if (features.length) {
    const unique = Array.from(new Set(features)).slice(0, 12);
    parts.push(`<h2>Notable Features</h2>\n<ul>\n        ${unique.map((f) => `<li>${esc(f)}</li>`).join('\n        ')}\n      </ul>`);
  }

  parts.push(`<p>Interested in this home? Contact Vasu Realty to schedule a tour, request more information, or receive a full property report for ${city ? `${esc(city)}, ${esc(state)}` : 'this property'}.</p>`);
  parts.push(`<p class="blog-disclaimer"><em>Listing data provided by the Carolina MLS. Information is believed reliable but not guaranteed. Prices and availability subject to change.</em></p>`);

  return parts.join('\n\n    ');
}

// ============================================================
// MLS fetching
// ============================================================

async function fetchActiveListings(maxListings = MAX_LISTINGS_DEFAULT) {
  const listings = [];
  let skip = 0;
  const pageSize = 500;
  let totalCount = 0;

  while (listings.length < maxListings) {
    const take = Math.min(pageSize, maxListings - listings.length);
    const url = `${MLS_GRID_BASE_URL}/Property?$filter=StandardStatus%20eq%20'Active'&$orderby=ModificationTimestamp%20desc&$expand=Media&$top=${take}&$skip=${skip}&$count=true`;
    const data = await fetchWithRetry(url, { noCache: true });

    if (!data || !Array.isArray(data.value) || data.value.length === 0) break;
    if (data['@odata.count']) totalCount = data['@odata.count'];

    const batch = data.value.map((item) => normalizeProperty(item, { maxMedia: 6 }));
    listings.push(...batch.filter(Boolean));
    skip += batch.length;
    if (batch.length < take) break;
    if (data['@odata.nextLink'] === undefined && batch.length < take) break;
  }

  logger.info('blog generator: fetched active listings', { count: listings.length, totalCount });
  return { listings, totalCount };
}

// ============================================================
// article builders
// ============================================================

function buildListingArticle(p) {
  const category = assignCategory(p);
  const title = listingTitle(p, category);
  const slug = listingSlug(p, title);
  const excerpt = excerptFor(p);
  const content = buildListingHtml(p, category);
  const image = mediaImage(p);
  const city = cleanText(p.City);
  const county = cleanText(p.CountyOrParish);
  const state = listingState(p);

  return {
    title,
    slug,
    excerpt,
    content,
    featured_image: image ? image.image : null,
    published: true,
    source_type: 'mls',
    status: 'published',
    category,
    city: city || null,
    county: county || null,
    state,
    neighborhood: cleanText(p.SubdivisionName) || null,
    listing_key: String(p.ListingKey),
    read_time: estimateReadTime(content),
    published_at: new Date(),
    meta_title: `${title} | Vasu Realty Blog`,
    meta_description: truncate(excerpt, 158),
    tags: buildTags(p, category),
    metrics: {
      listing: {
        listingId: p.ListingId,
        listingKey: p.ListingKey,
        price: p.ListPrice,
        beds: p.BedroomsTotal,
        baths: p.BathroomsTotal,
        sqft: p.LivingArea,
        pricePerSqft: Number(p.ListPrice) && Number(p.LivingArea) ? Math.round(Number(p.ListPrice) / Number(p.LivingArea)) : null,
        yearBuilt: p.YearBuilt,
        daysOnMarket: p.DaysOnMarket,
        lotSizeAcres: p.LotSizeAcres,
        onMarketDate: p.OnMarketDate,
        subdivision: p.SubdivisionName,
        county: p.CountyOrParish,
        postalCode: p.PostalCode,
        latitude: p.Latitude,
        longitude: p.Longitude,
        schools: {
          elementary: p.ElementarySchool,
          middle: p.MiddleOrJuniorSchool,
          high: p.HighSchool,
        },
      },
      media: {
        featuredMediaUrl: image ? image.cdnUrl : null,
        mediaKeys: image ? image.mediaKeys : [],
      },
      views: 0,
      likes: 0,
      shares: 0,
    },
    author_name: AUTHOR_NAME,
  };
}

function buildCityArticles(city, cityListings, state) {
  const median = (arr) => {
    if (!arr.length) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const prices = cityListings.map((l) => Number(l.ListPrice)).filter((v) => Number.isFinite(v) && v > 0);
  const doms = cityListings.map((l) => Number(l.DaysOnMarket)).filter((v) => Number.isFinite(v) && v >= 0);
  const psf = cityListings
    .map((l) => (Number(l.ListPrice) && Number(l.LivingArea) ? Number(l.ListPrice) / Number(l.LivingArea) : null))
    .filter((v) => Number.isFinite(v) && v > 0);
  const subdivisions = Array.from(new Set(cityListings.map((l) => cleanText(l.SubdivisionName)).filter(Boolean))).sort();
  const schools = Array.from(
    new Set(cityListings.flatMap((l) => [l.ElementarySchool, l.MiddleOrJuniorSchool, l.HighSchool]).map((s) => cleanText(s)).filter(Boolean))
  ).sort();
  const medianPrice = median(prices);
  const avgDom = doms.length ? Math.round(doms.reduce((a, b) => a + b, 0) / doms.length) : null;
  const medianPsf = median(psf);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const beds = median(cityListings.map((l) => Number(l.BedroomsTotal)).filter((v) => Number.isFinite(v) && v > 0));

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ---- Market Trends article ----
  const trendTitle = `${city} Real Estate Market Trends — ${dateStr}`;
  const trendSlug = slugify(`${city}-market-trends-${new Date().toISOString().slice(0, 7)}`);
  const trendExcerpt = `Live MLS data for ${city}, ${state}: ${cityListings.length} active listings, median list price ${formatPrice(medianPrice) || 'n/a'}, average ${avgDom ?? 'n/a'} days on market.`;

  const trendBody = [
    `<p class="blog-lead">This market overview for ${esc(city)}, ${esc(state)} is generated from live MLS Grid data for the ${cityListings.length} active listings currently on the market.</p>`,
    `<h2>Median List Price</h2>\n<p>The median list price among active ${esc(city)} listings is <strong>${formatPrice(medianPrice) || 'n/a'}</strong>, ranging from ${formatPrice(minPrice) || 'n/a'} to ${formatPrice(maxPrice) || 'n/a'}.</p>`,
    `<h2>Days on Market</h2>\n<p>Active listings in ${esc(city)} average <strong>${avgDom ?? 'n/a'} days on market</strong>, a useful gauge of how quickly homes are selling.</p>`,
    psf.length
      ? `<h2>Price per Square Foot</h2>\n<p>The median price per square foot is <strong>${formatPrice(Math.round(medianPsf * 100) / 100) || 'n/a'}</strong>.</p>`
      : '',
    `<h2>Inventory Snapshot</h2>\n<ul>\n        <li><strong>Active Listings:</strong> ${cityListings.length}</li>${medianPrice ? `\n        <li><strong>Median Price:</strong> ${formatPrice(medianPrice)}</li>` : ''}${avgDom ? `\n        <li><strong>Average Days on Market:</strong> ${avgDom}</li>` : ''}${beds ? `\n        <li><strong>Median Bedrooms:</strong> ${beds}</li>` : ''}\n      </ul>`,
    `<p>For the latest ${esc(city)} listings and a personalized market analysis, contact Vasu Realty.</p>`,
    `<p class="blog-disclaimer"><em>Statistics computed from Carolina MLS listing data. Values are indicative and may change as listings are added or go under contract.</em></p>`,
  ]
    .filter(Boolean)
    .join('\n\n    ');

  const trendArticle = {
    title: trendTitle,
    slug: trendSlug,
    excerpt: trendExcerpt,
    content: trendBody,
    featured_image: null,
    published: true,
    source_type: 'mls',
    status: 'published',
    category: CATEGORIES.MARKET_TRENDS,
    city,
    county: cleanText(cityListings.find((l) => l.CountyOrParish)?.CountyOrParish) || null,
    state,
    neighborhood: null,
    listing_key: null,
    read_time: estimateReadTime(trendBody),
    published_at: new Date(),
    meta_title: `${city} Market Trends | Vasu Realty Blog`,
    meta_description: truncate(trendExcerpt, 158),
    tags: [CATEGORIES.MARKET_TRENDS, city, state, 'Active Listings', 'Median Price'],
    metrics: {
      market: {
        city,
        state,
        inventory: cityListings.length,
        medianPrice: medianPrice ? Math.round(medianPrice) : null,
        avgDaysOnMarket: avgDom,
        medianPricePerSqft: medianPsf ? Math.round(medianPsf) : null,
        minPrice: minPrice ? Math.round(minPrice) : null,
        maxPrice: maxPrice ? Math.round(maxPrice) : null,
        medianBeds: beds ? Math.round(beds) : null,
        computedAt: new Date().toISOString(),
      },
      views: 0,
      likes: 0,
      shares: 0,
    },
    author_name: AUTHOR_NAME,
  };

  // ---- Neighborhood Guide article ----
  const guideTitle = `${city} Neighborhood Guide — Homes, Schools & Areas`;
  const guideExcerpt = subdivisions.length
    ? `Explore ${city}, ${state}: ${cityListings.length} active listings across ${subdivisions.length} neighborhood${subdivisions.length > 1 ? 's' : ''} including ${subdivisions.slice(0, 3).join(', ')}.`
    : `Explore ${city}, ${state}: ${cityListings.length} active listings and what makes this area worth considering.`;

  const guideBody = [
    `<p class="blog-lead">This guide highlights the areas, neighborhoods, and schools currently represented by active listings in ${esc(city)}, ${esc(state)}.</p>`,
    subdivisions.length
      ? `<h2>Neighborhoods with Active Listings</h2>\n<ul>\n        ${subdivisions.map((s) => `<li>${esc(s)}</li>`).join('\n        ')}\n      </ul>`
      : '',
    schools.length
      ? `<h2>Schools Serving ${esc(city)}</h2>\n<p>The listings in ${esc(city)} feed into the following schools:</p>\n<ul>\n        ${schools.map((s) => `<li>${esc(s)}</li>`).join('\n        ')}\n      </ul>`
      : '',
    `<h2>Price Overview</h2>\n<p>Active ${esc(city)} listings range from ${formatPrice(minPrice) || 'n/a'} to ${formatPrice(maxPrice) || 'n/a'}, with a median of ${formatPrice(medianPrice) || 'n/a'}.</p>`,
    `<p>Thinking about making ${esc(city)} home? Vasu Realty knows the area — reach out for tours, comps, and guidance.</p>`,
    `<p class="blog-disclaimer"><em>Neighborhood and school information compiled from Carolina MLS listing data.</em></p>`,
  ]
    .filter(Boolean)
    .join('\n\n    ');

  const guideArticle = {
    title: guideTitle,
    slug: slugify(`${city}-neighborhood-guide`),
    excerpt: guideExcerpt,
    content: guideBody,
    featured_image: null,
    published: true,
    source_type: 'mls',
    status: 'published',
    category: CATEGORIES.NEIGHBORHOOD_GUIDES,
    city,
    county: cleanText(cityListings.find((l) => l.CountyOrParish)?.CountyOrParish) || null,
    state,
    neighborhood: null,
    listing_key: null,
    read_time: estimateReadTime(guideBody),
    published_at: new Date(),
    meta_title: `${city} Neighborhood Guide | Vasu Realty Blog`,
    meta_description: truncate(guideExcerpt, 158),
    tags: [CATEGORIES.NEIGHBORHOOD_GUIDES, city, state, ...subdivisions.slice(0, 4)],
    metrics: {
      market: {
        city,
        state,
        inventory: cityListings.length,
        medianPrice: medianPrice ? Math.round(medianPrice) : null,
        neighborhoods: subdivisions,
        schools,
        computedAt: new Date().toISOString(),
      },
      views: 0,
      likes: 0,
      shares: 0,
    },
    author_name: AUTHOR_NAME,
  };

  return [trendArticle, guideArticle];
}

// ============================================================
// persistence
// ============================================================

const LISTING_UPSERT = `
  INSERT INTO blog_posts (
    title, slug, excerpt, content, featured_image, published,
    source_type, status, category, city, county, state, neighborhood,
    listing_key, read_time, published_at, meta_title, meta_description,
    tags, metrics, author_name, featured, updated_at
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW()
  )
  ON CONFLICT (listing_key) WHERE listing_key IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    slug = EXCLUDED.slug,
    excerpt = EXCLUDED.excerpt,
    content = EXCLUDED.content,
    featured_image = EXCLUDED.featured_image,
    published = EXCLUDED.published,
    status = EXCLUDED.status,
    category = EXCLUDED.category,
    city = EXCLUDED.city,
    county = EXCLUDED.county,
    state = EXCLUDED.state,
    neighborhood = EXCLUDED.neighborhood,
    read_time = EXCLUDED.read_time,
    published_at = EXCLUDED.published_at,
    meta_title = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    tags = EXCLUDED.tags,
    metrics = EXCLUDED.metrics,
    author_name = EXCLUDED.author_name,
    featured = EXCLUDED.featured,
    updated_at = NOW()
`;

const CITY_UPSERT = `
  INSERT INTO blog_posts (
    title, slug, excerpt, content, featured_image, published,
    source_type, status, category, city, county, state, neighborhood,
    listing_key, read_time, published_at, meta_title, meta_description,
    tags, metrics, author_name, featured, updated_at
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW()
  )
  ON CONFLICT (slug)
  DO UPDATE SET
    title = EXCLUDED.title,
    excerpt = EXCLUDED.excerpt,
    content = EXCLUDED.content,
    featured_image = EXCLUDED.featured_image,
    published = EXCLUDED.published,
    status = EXCLUDED.status,
    category = EXCLUDED.category,
    city = EXCLUDED.city,
    county = EXCLUDED.county,
    state = EXCLUDED.state,
    neighborhood = EXCLUDED.neighborhood,
    read_time = EXCLUDED.read_time,
    published_at = EXCLUDED.published_at,
    meta_title = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    tags = EXCLUDED.tags,
    metrics = EXCLUDED.metrics,
    author_name = EXCLUDED.author_name,
    featured = EXCLUDED.featured,
    updated_at = NOW()
`;

async function upsertArticle(article, isListing) {
  const values = [
    article.title,
    article.slug,
    article.excerpt,
    article.content,
    article.featured_image,
    article.published,
    article.source_type,
    article.status,
    article.category,
    article.city,
    article.county,
    article.state,
    article.neighborhood,
    article.listing_key,
    article.read_time,
    article.published_at,
    article.meta_title,
    article.meta_description,
    article.tags || [],
    article.metrics || {},
    article.author_name,
    !!article.featured,
  ];
  await pool.query(isListing ? LISTING_UPSERT : CITY_UPSERT, values);
}

// ============================================================
// main generation
// ============================================================

async function generateBlogContent({ maxListings = MAX_LISTINGS_DEFAULT } = {}) {
  const started = Date.now();
  const { listings, totalCount } = await fetchActiveListings(maxListings);

  if (!listings.length) {
    throw new Error('MLS returned no active listings — blog generation aborted (no data to write).');
  }

  let insertedListing = 0;
  let updatedListing = 0;

  const byCity = new Map();
  for (const p of listings) {
    const article = buildListingArticle(p);
    const cityKey = cleanText(p.City);
    if (cityKey) {
      if (!byCity.has(cityKey)) byCity.set(cityKey, []);
      byCity.get(cityKey).push(p);
    }
    const res = await pool.query(
      `SELECT id FROM blog_posts WHERE listing_key = $1`,
      [article.listing_key]
    );
    await upsertArticle(article, true);
    if (res.rows.length) updatedListing++;
    else insertedListing++;
  }

  const cities = Array.from(byCity.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_CITIES);

  let cityArticles = 0;
  for (const [city, cityListings] of cities) {
    const state = listingState(cityListings[0]);
    for (const article of buildCityArticles(city, cityListings, state)) {
      await upsertArticle(article, false);
      cityArticles++;
    }
  }

  // Featured editorial pins: listings with photos, favouring higher-priced
  // recently modified homes. Only mls articles are touched.
  const featured = listings
    .filter((p) => (p.Media || []).some((m) => m.MediaURL))
    .sort((a, b) => (Number(b.ListPrice) || 0) - (Number(a.ListPrice) || 0))
    .slice(0, FEATURED_COUNT);

  const featuredKeys = new Set(featured.map((p) => String(p.ListingKey)));
  await pool.query(
    `UPDATE blog_posts SET featured = FALSE WHERE source_type = 'mls' AND status = 'published'`
  );
  for (const key of featuredKeys) {
    await pool.query(
      `UPDATE blog_posts SET featured = TRUE WHERE listing_key = $1`,
      [key]
    );
  }

  const { rows } = await pool.query(
    `SELECT count(*)::int AS total FROM blog_posts WHERE source_type='mls' AND status='published'`
  );

  const summary = {
    listingsFetched: listings.length,
    mlsTotalInventory: totalCount,
    listingArticlesInserted: insertedListing,
    listingArticlesUpdated: updatedListing,
    cityArticlesCreated: cityArticles,
    citiesCovered: cities.length,
    featuredPinned: featuredKeys.size,
    publishedMlsArticles: rows[0].total,
    elapsedMs: Date.now() - started,
  };

  logger.info('blog generator: complete', summary);
  return summary;
}

// ============================================================
// CLI entry
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const run = args.includes('--run');
  if (!run) {
    console.log('usage: node src/modules/blog/services/blogGeneratorService.js --run [maxListings]');
    return;
  }
  const maxIndex = args.indexOf('--run') + 1;
  const maxArg = args[maxIndex] && !args[maxIndex].startsWith('--') ? parseInt(args[maxIndex], 10) : MAX_LISTINGS_DEFAULT;
  const maxListings = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : MAX_LISTINGS_DEFAULT;

  try {
    const summary = await generateBlogContent({ maxListings });
    console.log('Blog generation complete:');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (err) {
    logger.error('blog generator failed', { error: err.message, stack: err.stack });
    console.error('Blog generation failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateBlogContent, buildListingArticle, buildCityArticles, fetchActiveListings };
