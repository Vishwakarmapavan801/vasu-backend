/**
 * Search Engine
 *
 * Detects search type from user input and generates appropriate
 * search parameters for the OData query builder.
 *
 * Because MLS Grid Replication API only supports filtering on a limited
 * set of fields (OriginatingSystemName, StandardStatus, ListingId,
 * MlgCanView, ListOfficeMlsId, PropertyType, ModificationTimestamp),
 * all field-based searches (ZIP, City, Street, Price, Beds, etc.)
 * must use a two-phase approach:
 *
 *   1. Fetch a broader set using filterable fields
 *   2. Filter locally in Node.js for non-filterable fields
 */

// Known MLS Grid filterable fields (verified by testing against api-demo)
const FILTERABLE_FIELDS = new Set([
  'OriginatingSystemName',
  'StandardStatus',
  'ListingId',
  'MlgCanView',
  'ListOfficeMlsId',
  'PropertyType',
  'ModificationTimestamp',
]);

// MLS Grid PropertyType is a strict enumeration. Any value outside this set
// causes the backend to return "Invalid PropertyType enumeration given" (400),
// which surfaces as a 500 to clients. Values verified against live data.
const VALID_PROPERTY_TYPES = new Set([
  'Commercial Lease',
  'Commercial Sale',
  'Land',
  'Residential',
  'Residential Income',
  'Residential Lease',
]);

/**
 * Parse a propertyType value (possibly comma-separated, e.g.
 * "Residential,Residential Income") into individual types and report
 * whether every part is a valid MLS Grid PropertyType enumeration.
 *
 * @param {*} value
 * @returns {{ types: string[], valid: boolean }}
 */
function parsePropertyTypes(value) {
  const types = String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return {
    types,
    valid: types.length > 0 && types.every(t => VALID_PROPERTY_TYPES.has(t)),
  };
}

const config = require('../config');

const BROKERAGE = {
  FIRM_LICENSE: config.FIRM_LICENSE,
  LIST_OFFICE_MLS_ID: config.LIST_OFFICE_MLS_ID,
  NAME: config.BROKERAGE_NAME,
  ADDRESS: config.BROKERAGE_ADDRESS,
  SECONDARY_FIRM_LICENSE: config.SECONDARY_FIRM_LICENSE,
  SECONDARY_ADDRESS: config.BROKERAGE_SECONDARY_ADDRESS,
};

const AGENTS = {
  NC_LICENSE: config.NC_AGENT_LICENSE,
  SC_LICENSE: config.SC_AGENT_LICENSE,
};

/**
 * Detect what type of search the user input represents.
 *
 * @param {string} input - Raw user search query
 * @returns {{ type: string, value: *, display: string }}
 *
 * Returns one of:
 *   { type: 'listingId',       value: 'CAR4380604' }
 *   { type: 'officeMlsId',     value: 'CARR03684' }
 *   { type: 'firmLicense',     value: 'C41930' }
 *   { type: 'agentLicense',    value: '328293' }
 *   { type: 'zip',             value: '28277' }
 *   { type: 'cityState',       value: { city: 'Charlotte', state: 'NC' } }
 *   { type: 'city',            value: 'Charlotte' }
 *   { type: 'address',         value: '9400 Shepparton Drive' }
 *   { type: 'streetNumber',    value: '9400' }
 *   { type: 'streetName',      value: 'Shepparton' }
 *   { type: 'county',          value: 'Mecklenburg' }
 *   { type: 'keyword',         value: 'condo' }
 */
function detectSearchType(input) {
  if (!input || typeof input !== 'string') {
    return { type: 'keyword', value: input || '', display: input || '' };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'keyword', value: '', display: '' };
  }

  // 1. Exact firm license match (e.g., "C41930", "C26375")
  if (/^C\d{4,5}$/i.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return { type: 'firmLicense', value: upper, display: upper };
  }

  // 2. Listing ID (e.g., "CAR4380604", "CAR4379680")
  // MUST check BEFORE office MLS ID since both have similar patterns
  if (/^(CAR\d{7,}|[A-Z]{2,4}\d{5,})$/i.test(trimmed.toUpperCase()) && trimmed.length >= 8) {
    return { type: 'listingId', value: trimmed.toUpperCase(), display: trimmed };
  }

  // 3. Office/Agent MLS ID (e.g., "CARR03684", "CARR13858", "CAR9149")
  // Both office and agent MLS IDs start with CAR followed by alphanumeric.
  // Since ListOfficeMlsId IS filterable by MLS Grid, we prefer officeMlsId type.
  // Agent-specific searches use getPropertiesByAgent() which bypasses search engine.
  if (/^(CAR[A-Z0-9]{3,}|[A-Z]{2,5}\d{4,})$/i.test(trimmed) && trimmed.length >= 6) {
    return { type: 'officeMlsId', value: trimmed.toUpperCase(), display: trimmed };
  }

  // 4. Agent license number (pure digits, 6+ digits)
  if (/^\d{6,10}$/.test(trimmed)) {
    return { type: 'agentLicense', value: trimmed, display: trimmed };
  }

  // 5. 5-digit ZIP code (e.g., "28277", "94116")
  if (/^\d{5}$/.test(trimmed)) {
    return { type: 'zip', value: trimmed, display: trimmed };
  }

  // 6. ZIP+4 (e.g., "28277-1234")
  if (/^\d{5}-\d{4}$/.test(trimmed)) {
    return { type: 'zip', value: trimmed.substring(0, 5), display: trimmed };
  }

  // 7. "City, ST" or "City,ST" pattern
  const cityStateMatch = trimmed.match(/^([A-Za-z .'-]+),\s*([A-Za-z]{2})$/);
  if (cityStateMatch) {
    return {
      type: 'cityState',
      value: { city: cityStateMatch[1].trim(), state: cityStateMatch[2].toUpperCase() },
      display: trimmed,
    };
  }

  // 8. "City ST" (no comma)
  const citySpaceStateMatch = trimmed.match(/^([A-Za-z .'-]+)\s+([A-Za-z]{2})$/);
  if (citySpaceStateMatch && !/^\d/.test(trimmed)) {
    return {
      type: 'cityState',
      value: { city: citySpaceStateMatch[1].trim(), state: citySpaceStateMatch[2].toUpperCase() },
      display: trimmed,
    };
  }

  // 9. State abbreviation alone (e.g., "NC", "SC")
  if (/^[A-Za-z]{2}$/.test(trimmed) && ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].includes(trimmed.toUpperCase())) {
    return { type: 'state', value: trimmed.toUpperCase(), display: trimmed };
  }

  // 10. Address starting with a number (e.g., "9400 Shepparton Drive")
  const addressMatch = trimmed.match(/^(\d+)\s+(.+)/);
  if (addressMatch) {
    return {
      type: 'address',
      value: { streetNumber: addressMatch[1], streetName: addressMatch[2].trim() },
      display: trimmed,
    };
  }

  // 11. Pure number (likely street number — e.g., "9400")
  if (/^\d{2,5}$/.test(trimmed)) {
    return { type: 'streetNumber', value: trimmed, display: trimmed };
  }

  // 12. Single word without digits — could be city, county, or keyword
  if (/^[A-Za-z]+$/.test(trimmed)) {
    const word = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    // Known cities/counties in the region
    const knownCities = ['Charlotte','Waxhaw','Concord','Gastonia','Huntersville','Matthews','Mint Hill','Pineville','Cornelius','Davidson','Indian Land','Fort Mill','Rock Hill','Tega Cay','Lancaster','York','Clover','Lake Wylie','Monroe','Indian Trail','Weddington','Marvin','Stallings','Marshville','Wingate','Kannapolis','Harrisburg','Mount Pleasant','Albemarle','Salisbury','Mooresville','Statesville','Troutman','Denver','Lincolnton','Shelby','Kings Mountain','Belmont','Mount Holly','Lowell','Cramerton','McAdenville','Newton','Conover','Hickory','Lenoir','Morganton','Marion','Asheville','Greenville','Spartanburg','Anderson','Easley','Clemson','Seneca','Walhalla','Westminster'];
    const knownCounties = ['Mecklenburg','York','Lancaster','Union','Cabarrus','Gaston','Lincoln','Catawba','Iredell','Rowan','Stanly','Anson','Richmond','Scotland','Robeson','Cumberland','Hoke','Moore','Montgomery','Davidson','Davie','Forsyth','Guilford','Alamance','Orange','Durham','Wake','Johnston','Harnett','Lee','Chatham','Randolph','Buncombe','Haywood','Jackson','Transylvania','Henderson','Polk','Rutherford','Cleveland','Cherokee','Spartanburg','Greenville','Pickens','Anderson','Oconee','Abbeville','Laurens','Newberry','Fairfield','Chester','Chesterfield','Darlington','Florence','Marion','Horry','Georgetown','Berkeley','Charleston','Dorchester','Colleton','Beaufort','Jasper','Hampton','Allendale','Barnwell','Aiken','Edgefield','Saluda','McCormick','Greenwood'];

    const cityCheck = knownCities.find(c => c.toLowerCase() === word.toLowerCase());
    if (cityCheck) {
      return { type: 'city', value: word, display: word };
    }

    const countyCheck = knownCounties.find(c => c.toLowerCase() === word.toLowerCase());
    if (countyCheck) {
      return { type: 'county', value: word, display: word };
    }

    // If it looks like a proper name (capitalizable), treat as city
    if (/^[A-Z][a-z]+$/.test(trimmed)) {
      return { type: 'city', value: word, display: word };
    }

    return { type: 'keyword', value: trimmed, display: trimmed };
  }

  // 13. Multi-word — general keyword or property type
  const propertyTypes = [
    'single family', 'single family residence', 'condo', 'condominium',
    'townhouse', 'town home', 'multi family', 'multifamily',
    'commercial', 'land', 'farm', 'ranch', 'vacant land',
    'duplex', 'triplex', 'fourplex', 'apartment',
  ];
  const lower = trimmed.toLowerCase();
  const typeMatch = propertyTypes.find(t => lower === t || lower.includes(t));
  if (typeMatch) {
    return { type: 'propertyType', value: lower, display: trimmed };
  }

  return { type: 'keyword', value: trimmed, display: trimmed };
}

/**
 * Build a set of OData filter parameters using ONLY fields confirmed
 * as filterable by MLS Grid. All other field filters are returned
 * separately for local filtering.
 *
 * @param {Object} searchResult - Result from detectSearchType()
 * @param {Object} extraParams - Additional filter params (status, priceMin, etc.)
 * @returns {{ mlsFilters: Object, localFilters: Object }}
 */
function buildSearchFilters(searchResult, extraParams = {}) {
  const mlsFilters = {};
  const localFilters = {};

  // Always limit to viewable listings unless explicitly requested otherwise
  if (extraParams.includeNonViewable !== true) {
    mlsFilters.mlgCanView = true;
  }

  // Handle status
  if (extraParams.status) {
    const validStatuses = ['Active', 'Pending', 'Closed', 'Sold', 'Withdrawn', 'OffMarket', 'ComingSoon'];
    const status = typeof extraParams.status === 'string'
      ? extraParams.status.charAt(0).toUpperCase() + extraParams.status.slice(1).toLowerCase()
      : extraParams.status;
    if (validStatuses.includes(status)) {
      mlsFilters.standardStatus = status;
    }
  }

  // Handle property type (filterable in MLS Grid) alongside the free-text
  // search term so combined searches like "q=28216&propertyType=Residential"
  // return only listings of that type.
  if (extraParams.propertyType) {
    const { types, valid } = parsePropertyTypes(extraParams.propertyType);
    if (valid) {
      mlsFilters.propertyType = types.length === 1 ? types[0] : types;
    } else {
      mlsFilters._invalidPropertyType = String(extraParams.propertyType);
    }
  }

  // Map search type → MLS filterable field or local filter
  switch (searchResult.type) {
    case 'listingId':
      mlsFilters.listingId = searchResult.value;
      break;

    case 'officeMlsId':
      mlsFilters.listOfficeMlsId = searchResult.value;
      break;

    case 'firmLicense':
      mlsFilters.listOfficeMlsId = searchResult.value;
      break;

    case 'agentMlsId':
      // Agent MLS ID (e.g., 'CARR13858') is NOT filterable in MLS Grid
      // Must use broader query + local filter
      localFilters.listAgentMlsId = searchResult.value;
      break;

    case 'agentLicense':
      // Agent license number (e.g., '328293') is NOT filterable
      // Must use broader query + local filter
      localFilters.listAgentLicense = searchResult.value;
      break;

    case 'zip':
      localFilters.postalCode = searchResult.value;
      break;

    case 'cityState':
      localFilters.city = searchResult.value.city;
      if (searchResult.value.state) {
        localFilters.stateOrProvince = searchResult.value.state;
      }
      break;

    case 'city':
      localFilters.city = searchResult.value;
      break;

    case 'state':
      localFilters.stateOrProvince = searchResult.value;
      break;

    case 'address':
      if (searchResult.value.streetNumber) {
        localFilters.streetNumber = searchResult.value.streetNumber;
      }
      if (searchResult.value.streetName) {
        localFilters.streetName = searchResult.value.streetName;
      }
      break;

    case 'streetNumber':
      localFilters.streetNumber = searchResult.value;
      break;

    case 'county':
      localFilters.countyOrParish = searchResult.value;
      break;

    case 'propertyType':
      localFilters.propertySubType = searchResult.value;
      break;

    case 'keyword':
    default:
      localFilters.keyword = searchResult.value;
      break;
  }

  // Handle price range (NOT filterable in MLS Grid)
  const pMin = extraParams.priceMin || extraParams.minPrice;
  const pMax = extraParams.priceMax || extraParams.maxPrice;
  if (pMin) localFilters.minPrice = Number(pMin);
  if (pMax) localFilters.maxPrice = Number(pMax);

  // Handle beds/baths (NOT filterable in MLS Grid)
  const b = extraParams.beds || extraParams.minBeds;
  const ba = extraParams.baths || extraParams.minBaths;
  if (b) localFilters.minBeds = Number(b);
  if (ba) localFilters.minBaths = Number(ba);

  // Handle square footage (NOT filterable)
  if (extraParams.minSqft) localFilters.minSqft = Number(extraParams.minSqft);
  if (extraParams.maxSqft) localFilters.maxSqft = Number(extraParams.maxSqft);

  return { mlsFilters, localFilters };
}

/**
 * Check if we can generate a precise OData filter for the search,
 * or if we need a broader fetch + local filtering.
 *
 * @param {Object} mlsFilters
 * @returns {boolean} True if MLS filter is precise enough to return targeted results
 */
function isPreciseFilter(mlsFilters) {
  // If we're searching by ListingId, it's precise
  if (mlsFilters.listingId) return true;
  // Otherwise we need broader results + local filtering
  return false;
}

/**
 * Get the maximum number of results to fetch from MLS Grid for local filtering.
 *
 * @param {number} requestedTop - User-requested limit
 * @returns {number}
 */
function getFetchLimit(requestedTop) {
  // For local filtering, fetch more than requested to ensure we have enough
  // after filtering. Cap at 500 to cover most city result sets.
  // Increased multiplier from 3 to 10 to reliably find smaller-city listings
  // like Concord, Gastonia, Rock Hill within a broader metro-area fetch.
  const minimum = Math.max(requestedTop || 20, 20);
  return Math.min(minimum * 10, 500);
}

module.exports = {
  detectSearchType,
  buildSearchFilters,
  isPreciseFilter,
  getFetchLimit,
  FILTERABLE_FIELDS,
  VALID_PROPERTY_TYPES,
  parsePropertyTypes,
  BROKERAGE,
  AGENTS,
};
