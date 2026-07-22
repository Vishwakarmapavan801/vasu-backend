/**
 * OData Query Builder
 *
 * Builds OData v4 $filter, $top, $skip, $orderby, $count query strings
 * for the MLS Grid Property endpoint.
 *
 * IMPORTANT: Only uses fields that have been VERIFIED as filterable
 * by the MLS Grid Replication API. Fields confirmed as filterable:
 *
 *   ✅ OriginatingSystemName (required)
 *   ✅ StandardStatus
 *   ✅ ListingId
 *   ✅ MlgCanView
 *   ✅ ListOfficeMlsId
 *   ✅ PropertyType
 *   ✅ ModificationTimestamp (for ordering)
 *
 * Fields NOT filterable (causes "Invalid filter field 'X'" error):
 *   ❌ ListingKey
 *   ❌ City
 *   ❌ PostalCode
 *   ❌ ListPrice
 *   ❌ BedroomsTotal
 *   ❌ BathroomsTotalInteger
 *   ❌ StreetNumber
 *   ❌ StreetName
 *   ❌ UnparsedAddress
 *   ❌ CountyOrParish
 *   ❌ Neighborhood
 *   ❌ Media
 */

const { FILTERABLE_FIELDS } = require('./searchEngine');

/**
 * Set of fields that ARE filterable in the MLS Grid Replication API.
 * Populated from verified testing.
 */
const FILTERABLE_MLS_FIELDS = new Set([
  'OriginatingSystemName',
  'StandardStatus',
  'ListingId',
  'MlgCanView',
  'ListOfficeMlsId',
  'PropertyType',
]);

/**
 * Escape a string value for OData string literals.
 * In OData v4, single quotes are escaped by doubling them.
 *
 * @param {*} value
 * @returns {string}
 */
function escapeODataString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

/**
 * Validate that a field name is in the known filterable set.
 *
 * @param {string} field - RESO field name
 * @returns {boolean}
 */
function isFieldFilterable(field) {
  return FILTERABLE_MLS_FIELDS.has(field);
}

/**
 * Build an OData v4 $filter string using ONLY fields confirmed
 * as filterable by MLS Grid.
 *
 * Never generates filters for non-filterable fields. Those must
 * be handled via local (in-memory) filtering.
 *
 * Uses the FILTERABLE_MLS_FIELDS set to validate every field before
 * adding it to the filter. Any unknown field is silently skipped.
 *
 * @param {Object} params - Filter parameters (only filterable fields used)
 * @param {string} [originatingSystemName='carolina']
 * @returns {string} OData $filter string (empty if no filters)
 */
function buildFilter(params = {}, originatingSystemName) {
  const filters = [];

  // MLS Grid requires OriginatingSystemName on every request
  const osn = originatingSystemName || 'carolina';
  filters.push(`OriginatingSystemName eq '${escapeODataString(osn)}'`);

  // MlgCanView — only show viewable listings
  if (params.mlgCanView === true || params.mlgCanView === 'true') {
    filters.push('MlgCanView eq true');
  }

  // StandardStatus — multiple statuses can be OR'd
  if (params.standardStatus && isFieldFilterable('StandardStatus')) {
    const statuses = Array.isArray(params.standardStatus)
      ? params.standardStatus
      : [params.standardStatus];
    const validStatuses = ['Active', 'Pending', 'Closed', 'Sold', 'Withdrawn', 'OffMarket', 'ComingSoon'];
    const filtered = statuses.filter(s => validStatuses.includes(s));
    if (filtered.length === 1) {
      filters.push(`StandardStatus eq '${escapeODataString(filtered[0])}'`);
    } else if (filtered.length > 1) {
      const orParts = filtered.map(s => `StandardStatus eq '${escapeODataString(s)}'`);
      filters.push(`(${orParts.join(' or ')})`);
    }
  }

  // ListingId — exact match (only if filterable)
  if (params.listingId && isFieldFilterable('ListingId')) {
    filters.push(`ListingId eq '${escapeODataString(params.listingId)}'`);
  }

  // ListOfficeMlsId — for office/firm license filtering (only if filterable)
  if (params.listOfficeMlsId && isFieldFilterable('ListOfficeMlsId')) {
    filters.push(`ListOfficeMlsId eq '${escapeODataString(params.listOfficeMlsId)}'`);
  }

  // PropertyType (only if filterable)
  if (params.propertyType && isFieldFilterable('PropertyType')) {
    const types = Array.isArray(params.propertyType)
      ? params.propertyType
      : [params.propertyType];
    if (types.length === 1) {
      filters.push(`PropertyType eq '${escapeODataString(types[0])}'`);
    } else if (types.length > 1) {
      const orParts = types.map(t => `PropertyType eq '${escapeODataString(t)}'`);
      filters.push(`(${orParts.join(' or ')})`);
    }
  }

  return filters.join(' and ');
}

/**
 * Build a complete OData query string from filter params and options.
 *
 * @param {Object} params
 * @param {Object} [options]
 * @param {number} [options.top=20]
 * @param {number} [options.skip=0]
 * @param {string} [options.orderby]
 * @param {boolean} [options.count=true]
 * @param {string} [options.originatingSystemName]
 * @returns {string} Complete OData query string
 */
function buildQuery(params = {}, options = {}) {
  const queryParts = [];

  // Build the filter string
  const filter = buildFilter(params, options.originatingSystemName);
  queryParts.push(`$filter=${encodeURIComponent(filter)}`);

  // $top (page size)
  const top = Math.min(500, Math.max(1, parseInt(options.top, 10) || 20));
  queryParts.push(`$top=${top}`);

  // $skip (offset)
  const skip = Math.max(0, parseInt(options.skip, 10) || 0);
  if (skip > 0) {
    queryParts.push(`$skip=${skip}`);
  }

  // $orderby
  if (options.orderby) {
    // Only allow ordering by known sortable fields
    const validOrderByFields = [
      'ModificationTimestamp', 'ListPrice', 'BedroomsTotal',
      'LivingArea', 'ListingContractDate', 'CloseDate',
    ];
    // Validate orderby field
    const orderbyStr = String(options.orderby);
    const field = orderbyStr.split(' ')[0];
    if (validOrderByFields.includes(field)) {
      queryParts.push(`$orderby=${encodeURIComponent(options.orderby)}`);
    } else {
      queryParts.push('$orderby=ModificationTimestamp desc');
    }
  } else {
    queryParts.push('$orderby=ModificationTimestamp desc');
  }

  // $count
  if (options.count !== false) {
    queryParts.push('$count=true');
  }

  // $expand=Media — always include property images
  // Note: MLS Grid Replication API only supports $expand for Media, Rooms, and UnitTypes
  // OpenHouse, ListingAgent, ListingOffice are NOT expandable on the Property entity
  queryParts.push('$expand=Media');

  return queryParts.join('&');
}

/**
 * Apply local (in-memory) filters to a set of MLS Grid properties.
 * Used for fields that MLS Grid does not support filtering on.
 *
 * @param {Object[]} properties - Array of MLS Grid property objects
 * @param {Object} filters - Local filter parameters
 * @returns {Object[]} Filtered array
 */
function applyLocalFilters(properties = [], filters = {}) {
  if (!properties.length) return [];
  if (!filters || Object.keys(filters).length === 0) return properties;

  let filtered = [...properties];

  // City (exact match, case-insensitive)
  if (filters.city) {
    const city = String(filters.city).toLowerCase().trim();
    filtered = filtered.filter(p =>
      String(p.City || '').toLowerCase().trim() === city
    );
  }

  // State/Province
  if (filters.stateOrProvince) {
    const state = String(filters.stateOrProvince).toUpperCase().trim();
    filtered = filtered.filter(p =>
      String(p.StateOrProvince || '').toUpperCase().trim() === state
    );
  }

  // PostalCode (ZIP)
  if (filters.postalCode) {
    const zip = String(filters.postalCode).trim().substring(0, 5);
    filtered = filtered.filter(p =>
      String(p.PostalCode || '').trim().substring(0, 5) === zip
    );
  }

  // Street Number
  if (filters.streetNumber) {
    const num = String(filters.streetNumber).trim();
    filtered = filtered.filter(p =>
      String(p.StreetNumber || '').trim() === num
    );
  }

  // Street Name (contains match)
  if (filters.streetName) {
    const name = String(filters.streetName).toLowerCase().trim();
    filtered = filtered.filter(p =>
      String(p.StreetName || '').toLowerCase().includes(name)
    );
  }

  // County/Parish
  if (filters.countyOrParish) {
    const county = String(filters.countyOrParish).toLowerCase().trim();
    filtered = filtered.filter(p =>
      String(p.CountyOrParish || '').toLowerCase().includes(county)
    );
  }

  // Property SubType (for keyword type matching)
  if (filters.propertySubType) {
    const type = String(filters.propertySubType).toLowerCase().trim();
    filtered = filtered.filter(p => {
      const pType = String(p.PropertySubType || p.PropertyType || '').toLowerCase();
      return pType.includes(type);
    });
  }

  // Agent MLS ID (e.g., 'CARR13858') - search in ListAgentMlsId
  if (filters.listAgentMlsId) {
    const id = String(filters.listAgentMlsId).toUpperCase().trim();
    filtered = filtered.filter(p =>
      String(p.ListAgentMlsId || '').toUpperCase().trim() === id
    );
  }

  // Agent License Number (e.g., '328293') - search in ListAgentMlsId (may contain license)
  if (filters.listAgentLicense) {
    const license = String(filters.listAgentLicense).trim();
    filtered = filtered.filter(p =>
      String(p.ListAgentMlsId || '').trim() === license
    );
  }

  // Price Range
  if (filters.minPrice !== undefined && filters.minPrice !== null) {
    const min = Number(filters.minPrice);
    filtered = filtered.filter(p => Number(p.ListPrice || 0) >= min);
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== null) {
    const max = Number(filters.maxPrice);
    filtered = filtered.filter(p => Number(p.ListPrice || 0) <= max);
  }

  // Bedrooms
  if (filters.minBeds !== undefined && filters.minBeds !== null) {
    const min = Number(filters.minBeds);
    filtered = filtered.filter(p => Number(p.BedroomsTotal || 0) >= min);
  }

  // Bathrooms
  if (filters.minBaths !== undefined && filters.minBaths !== null) {
    const min = Number(filters.minBaths);
    filtered = filtered.filter(p => Number(p.BathroomsTotalInteger || p.BathroomsFull || 0) >= min);
  }

  // Square footage
  if (filters.minSqft !== undefined && filters.minSqft !== null) {
    const min = Number(filters.minSqft);
    filtered = filtered.filter(p => Number(p.LivingArea || 0) >= min);
  }
  if (filters.maxSqft !== undefined && filters.maxSqft !== null) {
    const max = Number(filters.maxSqft);
    filtered = filtered.filter(p => Number(p.LivingArea || 0) <= max);
  }

  // General keyword search (across multiple fields)
  if (filters.keyword) {
    const keyword = String(filters.keyword).toLowerCase().trim();
    filtered = filtered.filter(p => {
      const searchFields = [
        String(p.UnparsedAddress || ''),
        String(p.City || ''),
        String(p.StreetName || ''),
        String(p.CountyOrParish || ''),
        String(p.SubdivisionName || ''),
        String(p.ListingId || ''),
        String(p.PublicRemarks || ''),
        String(p.PropertyType || ''),
        String(p.PropertySubType || ''),
      ].map(s => s.toLowerCase());
      return searchFields.some(f => f.includes(keyword));
    });
  }

  return filtered;
}

/**
 * Sort properties locally by a given field and direction.
 *
 * @param {Object[]} properties
 * @param {string} sortBy - Field name
 * @param {string} [sortOrder='desc']
 * @returns {Object[]}
 */
function sortLocal(properties = [], sortBy, sortOrder) {
  const dir = (sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const sorted = [...properties];

  switch (sortBy) {
    case 'ListPrice':
    case 'price':
      sorted.sort((a, b) => dir * ((Number(a.ListPrice || 0)) - (Number(b.ListPrice || 0))));
      break;
    case 'BedroomsTotal':
    case 'bedrooms':
      sorted.sort((a, b) => dir * ((Number(a.BedroomsTotal || 0)) - (Number(b.BedroomsTotal || 0))));
      break;
    case 'LivingArea':
    case 'squareFeet':
      sorted.sort((a, b) => dir * ((Number(a.LivingArea || 0)) - (Number(b.LivingArea || 0))));
      break;
    case 'ListingContractDate':
    case 'ModificationTimestamp':
    case 'newest':
    default:
      sorted.sort((a, b) => {
        const dateA = new Date(a.ModificationTimestamp || a.ListingContractDate || 0).getTime();
        const dateB = new Date(b.ModificationTimestamp || b.ListingContractDate || 0).getTime();
        return dir * (dateA - dateB);
      });
      break;
  }

  return sorted;
}

module.exports = {
  buildFilter,
  buildQuery,
  applyLocalFilters,
  sortLocal,
  isFieldFilterable,
  escapeODataString,
  FILTERABLE_MLS_FIELDS,
};
