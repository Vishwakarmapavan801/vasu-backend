/**
 * Helper Functions
 *
 * Reusable utilities used across controllers for pagination,
 * filter building, sorting, and user sanitization.
 */

/**
 * Apply pagination to a Mongoose query
 * @param {import('mongoose').Query} query - Mongoose query object
 * @param {number} [page=1] - Current page
 * @param {number} [limit=10] - Items per page
 * @returns {Promise<{data: Array, total: number, page: number, limit: number}>}
 */
async function paginate(query, page = 1, limit = 10) {
  page = Math.max(1, parseInt(page, 10) || 1);
  limit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    query.clone().skip(skip).limit(limit),
    query.model.countDocuments(query.getFilter()),
  ]);

  return { data, total, page, limit };
}

/**
 * Build Mongoose filter object from query parameters
 * @param {Object} query - Express query params
 * @returns {Object} Mongoose filter
 */
function buildPropertyFilters(query) {
  const filter = {};

  if (query.city) filter.city = new RegExp(query.city, 'i');
  if (query.state) filter.state = query.state.toUpperCase();
  if (query.zip) filter.zip = query.zip;

  if (query.propertyType) {
    const types = query.propertyType.split(',');
    filter.propertyType = types.length > 1 ? { $in: types } : types[0];
  }

  if (query.status) {
    const statuses = query.status.split(',');
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }

  if (query.minPrice || query.maxPrice) {
    filter.price = {};
    if (query.minPrice) filter.price.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
  }

  if (query.bedrooms) filter.bedrooms = { $gte: Number(query.bedrooms) };
  if (query.bathrooms) filter.bathrooms = { $gte: Number(query.bathrooms) };
  if (query.sqft) filter.squareFeet = { $gte: Number(query.sqft) };

  return filter;
}

/**
 * Build Mongoose sort object from sortBy/sortOrder params
 * @param {string} [sortBy] - Field to sort by
 * @param {string} [sortOrder] - 'asc' or 'desc'
 * @returns {Object} Mongoose sort object
 */
function buildSort(sortBy, sortOrder = 'desc') {
  if (!sortBy) return { createdAt: -1 };

  const allowedSorts = {
    price: 'price',
    date: 'createdAt',
    createdAt: 'createdAt',
    sqft: 'squareFeet',
    bedrooms: 'bedrooms',
    bathrooms: 'bathrooms',
  };

  const field = allowedSorts[sortBy] || 'createdAt';
  const order = sortOrder === 'asc' ? 1 : -1;

  return { [field]: order };
}

/**
 * Sanitize user object for response (remove sensitive fields)
 * @param {Object} user - Mongoose user document
 * @returns {Object} Sanitized user object
 */
function sanitizeUser(user) {
  if (!user) return null;

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    photo: user.photo,
    bio: user.bio,
    company: user.company,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

module.exports = { paginate, buildPropertyFilters, buildSort, sanitizeUser };
