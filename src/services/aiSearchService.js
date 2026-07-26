/**
 * AI Search Service
 *
 * Converts natural language queries into structured MLS filters,
 * searches the MLS Grid API, and returns summarized results.
 *
 * Pipeline:
 *   User Message → OpenAI extracts filters → MLS Grid search →
 *   OpenAI summarizes → Return properties + AI explanation
 */

const { chatCompletion } = require('./openaiService');
const {
  getProperties,
  getPropertyByKey,
} = require('./propertyService');
const cache = require('../utils/cache');

/**
 * JSON schema for filter extraction from natural language.
 */
const FILTER_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    filters: {
      type: 'object',
      properties: {
        city: { type: 'string' },
        postalCode: { type: 'string' },
        priceMin: { type: 'number' },
        priceMax: { type: 'number' },
        beds: { type: 'number' },
        baths: { type: 'number' },
        propertyType: { type: 'string' },
        status: { type: 'string' },
        minSqft: { type: 'number' },
        maxSqft: { type: 'number' },
        keywords: { type: 'string' },
      },
      additionalProperties: false,
    },
    requestType: {
      type: 'string',
      enum: [
        'property_search',
        'recommendation',
        'mortgage_explanation',
        'buying_guide',
        'selling_guide',
        'property_summary',
        'comparison',
        'general_question',
      ],
    },
    listingKey: { type: 'string' },
  },
  required: ['filters', 'requestType'],
  additionalProperties: false,
};

/**
 * System prompt for filter extraction.
 * Trains the AI to understand the MLS fields and extract structured filters.
 */
const FILTER_EXTRACTION_PROMPT = `You are an AI real estate assistant for Vasu Realty, serving North Carolina and South Carolina.

Your role is to help users find properties by understanding their natural language requests and extracting structured search filters.

Available MLS property fields:
- city: City name (e.g., "Charlotte", "Rock Hill", "Concord")
- postalCode: ZIP code
- priceMin: Minimum price (numeric, no commas)
- priceMax: Maximum price (numeric, no commas)
- beds: Minimum number of bedrooms
- baths: Minimum number of bathrooms
- propertyType: Property type (Residential, Condominium, Townhouse, MultiFamily, Commercial, Land, Farm)
- status: Listing status (Active, Pending, Closed, ComingSoon)
- minSqft: Minimum square footage
- maxSqft: Maximum square footage
- keywords: Any specific features mentioned (pool, garage, waterfront, etc.)

For requestType:
- "property_search": User wants to find/browse properties
- "recommendation": User wants recommendations or suggestions
- "mortgage_explanation": User is asking about mortgage/financing
- "buying_guide": User wants buying advice
- "selling_guide": User wants selling advice
- "property_summary": User is asking about a specific property
- "comparison": User wants to compare properties
- "general_question": General real estate questions

If the user provides a MLS listing ID or URL, extract it as listingKey.

For property_summary requests, if the user mentions a specific address or listing key, include it in listingKey field.

Be thorough in extracting ALL criteria mentioned. If a criterion is not mentioned, leave it blank/empty.`;

/**
 * System prompt for result summarization.
 */
const RESULT_SUMMARIZATION_PROMPT = `You are a friendly, knowledgeable real estate assistant for Vasu Realty, serving North Carolina and South Carolina.

Given a list of MLS property search results and the user's original request, provide a natural language summary.

Guidelines:
1. Start with a brief overview of what you found
2. Highlight the most relevant properties that match the user's request
3. Mention key details: price range, locations, property types
4. Be honest if no properties match - suggest adjusting filters
5. Keep it concise (3-5 sentences)
6. Be warm and helpful
7. If the user asked a question (not a search), answer it directly using your real estate knowledge
8. Never fabricate property details - only mention what's in the search results

Format: Return the summary as a plain text paragraph.`;

/**
 * Extract search filters from natural language using OpenAI.
 *
 * @param {string} message - User's natural language message
 * @returns {Promise<Object>} Extracted filters and request type
 */
async function extractFilters(message) {
  const result = await chatCompletion({
    systemPrompt: FILTER_EXTRACTION_PROMPT,
    userMessage: `User message: "${message}"\n\nExtract the property search filters from this request.`,
    jsonSchema: FILTER_EXTRACTION_SCHEMA,
    temperature: 0.1,
  });

  if (!result.success) {
    // On extraction failure, return empty filters with general_question type
    return {
      filters: {},
      requestType: 'general_question',
    };
  }

  return result.data;
}

/**
 * Search MLS with extracted filters.
 *
 * @param {Object} filters - Extracted search filters
 * @param {number} [limit=5] - Max results
 * @returns {Promise<Array>} Matching properties
 */
async function searchMlsWithFilters(filters, limit = 5) {
  const params = {
    top: limit,
    mlgCanView: true,
    applyBrokerageScope: false,
  };

  if (filters.city) params.city = filters.city;
  if (filters.postalCode) params.postalCode = filters.postalCode;
  if (filters.priceMin) params.priceMin = filters.priceMin;
  if (filters.priceMax) params.priceMax = filters.priceMax;
  if (filters.beds) params.beds = filters.beds;
  if (filters.baths) params.baths = filters.baths;
  if (filters.propertyType) params.propertyType = filters.propertyType;
  if (filters.status) params.status = filters.status;
  if (filters.minSqft) params.minSqft = filters.minSqft;
  if (filters.maxSqft) params.maxSqft = filters.maxSqft;

  // Default to active listings if no status specified
  if (!filters.status) {
    params.status = 'Active';
  }

  try {
    // Use q-based search if keywords are provided, otherwise direct filter search
    if (filters.keywords) {
      params.q = `${filters.city || ''} ${filters.keywords}`.trim();
      if (!params.q) {
        // Can't do free-text search without a query
        const result = await getProperties(params);
        return result.data || [];
      }
      const result = await getProperties(params);
      return result.data || [];
    }

    const result = await getProperties(params);
    return result.data || [];
  } catch (err) {
    console.error('[AISearch] MLS search error:', err.message);
    return [];
  }
}

/**
 * Get a single property by listing key for summaries.
 */
async function getPropertyForSummary(listingKey) {
  try {
    const result = await getPropertyByKey(listingKey);
    return result?.data || null;
  } catch (err) {
    console.warn('[AISearch] Failed to fetch property for summary:', err.message);
    return null;
  }
}

/**
 * Format a property for AI context (concise, relevant fields only).
 */
function formatPropertyForAI(property) {
  return {
    address: property.UnparsedAddress || 'Address unavailable',
    city: property.City || '',
    state: property.StateOrProvince || '',
    price: property.ListPrice || 0,
    beds: property.BedroomsTotal || 0,
    baths: property.BathroomsFull || 0,
    sqft: property.LivingArea || 0,
    type: property.PropertyType || '',
    subType: property.PropertySubType || '',
    status: property.StandardStatus || '',
    yearBuilt: property.YearBuilt || '',
    garage: property.GarageSpaces || 0,
    lotSize: property.LotSizeAcres || 0,
    listingKey: property.ListingKey || '',
    listingId: property.ListingId || '',
    image: property.Media?.[0]?.MediaURL || '',
    description: property.PublicRemarks || '',
    features: [
      property.PoolYN ? 'Pool' : null,
      property.WaterfrontYN ? 'Waterfront' : null,
      property.FireplaceYN ? 'Fireplace' : null,
      property.GarageYN ? 'Garage' : null,
      property.NewConstructionYN ? 'New Construction' : null,
    ].filter(Boolean).join(', ') || 'N/A',
  };
}

/**
 * Handle a non-search request (general question, guide, etc.)
 *
 * @param {string} requestType - Type of request
 * @param {string} message - Original user message
 * @returns {Promise<Object>} AI response
 */
async function handleGeneralQuestion(requestType, message) {
  const guidePrompts = {
    buying_guide: `You are a real estate expert. The user is asking about buying a home. Provide helpful, accurate guidance about the home buying process in North Carolina and South Carolina. Keep it concise (3-5 sentences). User question: "${message}"`,
    selling_guide: `You are a real estate expert. The user is asking about selling a home. Provide helpful, accurate guidance about the home selling process in North Carolina and South Carolina. Keep it concise (3-5 sentences). User question: "${message}"`,
    mortgage_explanation: `You are a mortgage expert. The user has a question about mortgages or financing. Provide helpful, accurate information. Keep it concise (3-5 sentences). User question: "${message}"`,
    general_question: `You are a helpful real estate assistant for Vasu Realty. Answer the user's real estate question. If you don't know something, say so honestly. Keep it concise (3-5 sentences). User question: "${message}"`,
    recommendation: `You are a real estate advisor. The user wants property recommendations. Ask them to clarify their preferences (location, budget, property type, bedrooms, etc.) so you can search for matching properties. Be friendly and helpful. User message: "${message}"`,
    comparison: `You are a real estate analyst. The user wants to compare properties. Ask them which specific properties or types they'd like to compare (by address, MLS ID, or criteria). User message: "${message}"`,
  };

  const prompt = guidePrompts[requestType] || guidePrompts.general_question;

  const result = await chatCompletion({
    systemPrompt: 'You are a helpful real estate assistant for Vasu Realty.',
    userMessage: prompt,
    temperature: 0.5,
  });

  return result.success
    ? { reply: result.data, properties: [] }
    : { reply: 'I apologize, but I\'m having trouble processing your request. Could you please rephrase?', properties: [] };
}

/**
 * Generate a stable cache key for AI search requests.
 * Normalizes whitespace, lowercases, and creates a hash of the message.
 */
function makeAiCacheKey(message) {
  const normalized = message.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `ai:${hash}`;
}

/**
 * Main AI search pipeline.
 *
 * Results are cached for 5 minutes to avoid redundant OpenAI calls
 * for identical or semantically similar queries.
 *
 * @param {string} message - User's natural language message
 * @returns {Promise<Object>} { reply, properties }
 */
async function processSearchRequest(message) {
  // Check cache first
  const cacheKey = makeAiCacheKey(message);
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('[AISearch] Cache hit for:', message.slice(0, 60));
    return cached;
  }

  let result;

  // Step 1: Extract filters from natural language
  const extracted = await extractFilters(message);

  // Step 2: Handle non-search requests
  if (extracted.requestType !== 'property_search' && extracted.requestType !== 'recommendation') {
    // Check if it's a property summary with a listing key
    if (extracted.requestType === 'property_summary' && extracted.listingKey) {
      const property = await getPropertyForSummary(extracted.listingKey);
      if (property) {
        const formatted = formatPropertyForAI(property);
        const summaryResult = await chatCompletion({
          systemPrompt: RESULT_SUMMARIZATION_PROMPT,
          userMessage: `User asked about: "${message}"\n\nProperty details:\n${JSON.stringify(formatted, null, 2)}\n\nProvide a helpful summary of this property.`,
          temperature: 0.4,
        });
        result = {
          reply: summaryResult.success ? summaryResult.data : 'Here are the property details you requested.',
          properties: [formatted],
        };
      } else {
        result = {
          reply: 'I couldn\'t find a property matching that. Please check the listing ID or try a different search.',
          properties: [],
        };
      }
    } else {
      result = await handleGeneralQuestion(extracted.requestType, message);
    }

    // Cache result for 5 minutes
    cache.set(cacheKey, result, 300_000);
    return result;
  }

  // Step 3: Search MLS with extracted filters
  const properties = await searchMlsWithFilters(extracted.filters);

  // Step 4: Format properties for AI context
  const formattedProperties = properties.map(formatPropertyForAI);

  // Step 5: Generate AI summary of results
  let reply;
  if (formattedProperties.length === 0) {
    reply = await handleNoResults(extracted.filters);
  } else {
    const summaryResult = await chatCompletion({
      systemPrompt: RESULT_SUMMARIZATION_PROMPT,
      userMessage: `User search: "${message}"\n\nSearch filters used: ${JSON.stringify(extracted.filters, null, 2)}\n\nFound ${formattedProperties.length} matching properties:\n${JSON.stringify(formattedProperties, null, 2)}\n\nSummarize these results for the user.`,
      temperature: 0.4,
    });
    reply = summaryResult.success ? summaryResult.data : `I found ${formattedProperties.length} properties matching your search.`;
  }

  result = { reply, properties: formattedProperties };

  // Cache result for 5 minutes (MLS data freshness)
  cache.set(cacheKey, result, 300_000);

  return result;
}

/**
 * Generate a helpful response when no properties match.
 */
async function handleNoResults(filters) {
  const missingInfo = [];
  if (!filters.city && !filters.postalCode) missingInfo.push('a city or ZIP code');
  if (!filters.priceMin && !filters.priceMax) missingInfo.push('a price range');
  if (!filters.beds) missingInfo.push('number of bedrooms');

  if (missingInfo.length >= 2) {
    return `I couldn't find properties matching your request. To help you find the perfect home, could you tell me which area you're interested in and your approximate budget? For example, "3 bedroom homes in Charlotte under $500k".`;
  }

  return `I searched for properties matching your criteria but didn't find any results. Try broadening your search — for example, adjusting your price range or considering nearby cities. How else can I help you?`;
}

module.exports = {
  processSearchRequest,
  extractFilters,
  searchMlsWithFilters,
  formatPropertyForAI,
};
