const pool = require('../../config/database');

function buildListingStructuredData(listing) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    '@id': `${process.env.CLIENT_URL}/property/${listing.ListingKey}`,
    url: `${process.env.CLIENT_URL}/property/${listing.ListingKey}`,
    name: `${listing.UnparsedAddress || 'Property'} in ${listing.City || ''}, ${listing.StateOrProvince || ''}`,
    description: listing.PublicRemarks || '',
    image: listing.Media?.[0]?.MediaURL || listing.Photos?.[0]?.MediaURL || listing.Photos?.[0]?.MediaURL || '',
    numberOfBedrooms: listing.BedroomsTotal || listing.Bedrooms,
    numberOfBathroomsTotal: listing.BathroomsTotalInteger || listing.BathroomsFull || listing.Bathrooms,
    livingArea: listing.LivingArea || listing.SqFtTotal,
    livingAreaUnit: 'SquareFeet',
    price: listing.ListPrice,
    priceCurrency: 'USD',
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.UnparsedAddress || '',
      addressLocality: listing.City || '',
      addressRegion: listing.StateOrProvince || '',
      postalCode: listing.PostalCode || '',
      addressCountry: 'US',
    },
    offers: {
      '@type': 'Offer',
      price: listing.ListPrice,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
}

function buildAgentStructuredData(agent) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': `${process.env.CLIENT_URL}/agent/${agent.slug || agent.id}`,
    url: `${process.env.CLIENT_URL}/agent/${agent.slug || agent.id}`,
    name: agent.name || `${agent.first_name} ${agent.last_name}`,
    image: agent.profile_image || agent.photo || '',
    email: agent.email,
    telephone: agent.phone,
    areaServed: agent.service_area || 'Charlotte, NC',
    knowsAbout: ['Real Estate', 'Property Management', 'Home Buying', 'Home Selling'],
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      addressLocality: agent.city || 'Charlotte',
      addressRegion: agent.state || 'NC',
    },
  };
}

function buildMarketStructuredData(city, state, stats) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${city}, ${state} Real Estate Market`,
    description: stats
      ? `Market data for ${city}, ${state}: median price $${stats.median_price?.toLocaleString()}, ${stats.total_listings} active listings.`
      : `Real estate market information for ${city}, ${state}.`,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: stats?.min_price || 0,
      highPrice: stats?.max_price || 0,
      offerCount: stats?.total_listings || 0,
    },
  };
}

function buildBreadcrumbStructuredData(items) {
  const itemListElement = items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: `${process.env.CLIENT_URL}${item.url}`,
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  };
}

function buildFAQStructuredData(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

function buildLocalBusinessStructuredData() {
  const business = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: 'Vasu Realty',
    image: `${process.env.CLIENT_URL}/logo.png`,
    url: process.env.CLIENT_URL,
    openingHours: 'Mo-Fr 09:00-18:00',
    priceRange: '$$',
    areaServed: ['Charlotte, NC', 'Rock Hill, SC', 'Fort Mill, SC', 'Lake Wylie, SC'],
  };

  // Only include address/contact fields when env vars are actually configured,
  // so placeholder data never leaks into structured markup.
  if (process.env.BUSINESS_PHONE) {
    business.telephone = process.env.BUSINESS_PHONE;
  }
  if (process.env.BUSINESS_STREET || process.env.BUSINESS_CITY) {
    business.address = {
      '@type': 'PostalAddress',
      streetAddress: process.env.BUSINESS_STREET || '',
      addressLocality: process.env.BUSINESS_CITY || 'Charlotte',
      addressRegion: process.env.BUSINESS_STATE || 'NC',
      postalCode: process.env.BUSINESS_ZIP || '',
      addressCountry: 'US',
    };
  }
  if (process.env.BUSINESS_LAT && process.env.BUSINESS_LNG) {
    business.geo = {
      '@type': 'GeoCoordinates',
      latitude: parseFloat(process.env.BUSINESS_LAT),
      longitude: parseFloat(process.env.BUSINESS_LNG),
    };
  }

  return business;
}

function generateMetaTags({ title, description, image, url, type = 'website' }) {
  return {
    title: `${title} | Vasu Realty`,
    meta: [
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: image || `${process.env.CLIENT_URL}/og-default.jpg` },
      { property: 'og:url', content: url || process.env.CLIENT_URL },
      { property: 'og:type', content: type },
      { property: 'og:site_name', content: 'Vasu Realty' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image || `${process.env.CLIENT_URL}/og-default.jpg` },
    ],
  };
}

async function generateSitemap() {
  const { rows: properties } = await pool.query(
    `SELECT listing_key, mls_updated_at FROM properties WHERE status IS NULL OR status NOT IN ('deleted', 'withdrawn') ORDER BY mls_updated_at DESC LIMIT 50000`
  );

  const { rows: agents } = await pool.query(
    `SELECT id, slug, updated_at FROM agents WHERE is_verified = true AND is_active = true`
  );

  const staticPages = [
    { url: '/', changefreq: 'daily', priority: 1.0 },
    { url: '/search', changefreq: 'always', priority: 0.9 },
    { url: '/about', changefreq: 'monthly', priority: 0.5 },
    { url: '/contact', changefreq: 'monthly', priority: 0.5 },
    { url: '/agents', changefreq: 'weekly', priority: 0.7 },
    { url: '/blog', changefreq: 'weekly', priority: 0.6 },
    { url: '/feed', changefreq: 'always', priority: 0.6 },
  ];

  const propertyUrls = properties.map(p => ({
    url: `/property/${p.listing_key}`,
    changefreq: 'daily',
    priority: 0.8,
    lastmod: p.mls_updated_at,
  }));

  const agentUrls = agents.map(a => ({
    url: `/agent/${a.slug || a.id}`,
    changefreq: 'weekly',
    priority: 0.7,
    lastmod: a.updated_at,
  }));

  return [...staticPages, ...propertyUrls, ...agentUrls];
}

module.exports = {
  buildListingStructuredData, buildAgentStructuredData,
  buildMarketStructuredData, buildBreadcrumbStructuredData,
  buildFAQStructuredData, buildLocalBusinessStructuredData,
  generateMetaTags, generateSitemap,
};
