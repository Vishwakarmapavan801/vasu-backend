const Property = require('../models/Property');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Inquiry = require('../models/Inquiry');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');

/**
 * @desc    Get admin dashboard statistics
 * @route   GET /api/admin/dashboard
 * @access  Private/Admin
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalProperties,
      activeProperties,
      soldProperties,
      pendingProperties,
      featuredProperties,
      recentProperties,
      totalUsers,
      activeUsers,
      newUsers30Days,
      agentsCount,
      totalInquiries,
      newInquiries,
      inquiryStats,
      recentContacts,
    ] = await Promise.all([
      // Property stats
      Property.countDocuments({ isDeleted: false }),
      Property.countDocuments({ isActive: true, isDeleted: false, status: 'for-sale' }),
      Property.countDocuments({ isDeleted: false, status: 'sold' }),
      Property.countDocuments({ isDeleted: false, status: 'pending' }),
      Property.countDocuments({ featured: true, isActive: true }),
      Property.find({ isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('listingAgent', 'name')
        .select('title price city state status images createdAt'),

      // User stats
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ role: 'agent', isActive: true }),

      // Inquiry stats
      Contact.countDocuments(),
      Contact.countDocuments({ status: 'new' }),
      Inquiry.getStats(),
      Contact.find({ createdAt: { $gte: sevenDaysAgo } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName email inquiryType status createdAt'),
    ]);

    // Calculate monthly property changes
    const propertiesLastMonth = await Property.countDocuments({
      createdAt: { $lt: thirtyDaysAgo },
      isDeleted: false,
    });

    const propertyGrowthRate = propertiesLastMonth > 0
      ? (((totalProperties - propertiesLastMonth) / propertiesLastMonth) * 100).toFixed(1)
      : 0;

    return sendSuccess(res, {
      message: 'Dashboard statistics retrieved successfully',
      data: {
        properties: {
          total: totalProperties,
          active: activeProperties,
          sold: soldProperties,
          pending: pendingProperties,
          featured: featuredProperties,
          growthRate: propertyGrowthRate,
          recent: recentProperties,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          newLast30Days: newUsers30Days,
          agents: agentsCount,
        },
        inquiries: {
          total: totalInquiries,
          new: newInquiries,
          ...inquiryStats,
          recent: recentContacts,
        },
        timestamp: now,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get recent properties (admin view)
 * @route   GET /api/admin/properties
 * @access  Private/Admin
 */
const getRecentProperties = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, propertyType } = req.query;
    const filter = { isDeleted: false };

    if (status) filter.status = status;
    if (propertyType) filter.propertyType = propertyType;

    const properties = await Property.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10))
      .populate('listingAgent', 'name email')
      .select('title price city state status propertyType featured isActive createdAt');

    const total = await Property.countDocuments(filter);

    return sendSuccess(res, {
      message: 'Properties retrieved successfully',
      data: properties,
      meta: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get recent users (admin view)
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
const getRecentUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role } = req.query;
    const filter = {};

    if (role) filter.role = role;

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10))
      .select('name email role isActive createdAt lastLogin');

    const total = await User.countDocuments(filter);

    return sendSuccess(res, {
      message: 'Users retrieved successfully',
      data: users,
      meta: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get recent inquiries (admin view)
 * @route   GET /api/admin/inquiries
 * @access  Private/Admin
 */
const getRecentInquiries = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = {};

    if (status) filter.status = status;

    const inquiries = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10))
      .select('firstName lastName email phone inquiryType status priority createdAt');

    const total = await Contact.countDocuments(filter);

    return sendSuccess(res, {
      message: 'Inquiries retrieved successfully',
      data: inquiries,
      meta: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user role (admin only)
 * @route   PUT /api/admin/users/:id/role
 * @access  Private/Admin
 */
const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['user', 'agent', 'admin'];

    if (!validRoles.includes(role)) {
      throw AppError.badRequest(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      throw AppError.notFound('User not found');
    }

    return sendSuccess(res, {
      message: `User role updated to '${role}' successfully`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle user active status (admin only)
 * @route   PUT /api/admin/users/:id/toggle-status
 * @access  Private/Admin
 */
const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    user.isActive = !user.isActive;
    await user.save();

    return sendSuccess(res, {
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle property featured status (admin only)
 * @route   PUT /api/admin/properties/:id/featured
 * @access  Private/Admin
 */
const togglePropertyFeatured = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      throw AppError.notFound('Property not found');
    }

    await property.toggleFeatured();

    return sendSuccess(res, {
      message: `Property ${property.featured ? 'featured' : 'unfeatured'} successfully`,
      data: property,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getRecentProperties,
  getRecentUsers,
  getRecentInquiries,
  updateUserRole,
  toggleUserStatus,
  togglePropertyFeatured,
};
