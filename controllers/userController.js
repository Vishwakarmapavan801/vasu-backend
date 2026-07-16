const User = require('../models/User');
const Property = require('../models/Property');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const { sanitizeUser } = require('../utils/helpers');

/**
 * @desc    Get all users (admin only)
 * @route   GET /api/users
 * @access  Private/Admin
 */
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, isActive } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

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
 * @desc    Get single user by ID
 * @route   GET /api/users/:id
 * @access  Private/Admin
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('savedProperties', 'title price address city state images propertyType status')
      .populate('favoriteProperties', 'title price address city state images propertyType status');

    if (!user) {
      throw AppError.notFound('User not found');
    }

    return sendSuccess(res, {
      message: 'User retrieved successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      'name',
      'phone',
      'bio',
      'company',
      'photo',
      'website',
      'socialMedia',
      'address',
    ];

    const updateData = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    });

    return sendSuccess(res, {
      message: 'Profile updated successfully',
      data: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete user account (self)
 * @route   DELETE /api/users/profile
 * @access  Private
 */
const deleteAccount = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { isActive: false });

    res.cookie('token', 'none', {
      httpOnly: true,
      expires: new Date(Date.now() + 5 * 1000),
    });

    return sendSuccess(res, {
      message: 'Account deactivated successfully',
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Save a property to user's saved list
 * @route   POST /api/users/saved-properties/:propertyId
 * @access  Private
 */
const saveProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;

    const property = await Property.findById(propertyId);
    if (!property) {
      throw AppError.notFound('Property not found');
    }

    const user = await User.findById(req.user.id);
    await user.addSavedProperty(propertyId);

    // Increment saved count on property
    property.savedCount += 1;
    await property.save({ validateBeforeSave: false });

    return sendSuccess(res, {
      message: 'Property saved successfully',
      data: { savedProperties: user.savedProperties },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove a property from user's saved list
 * @route   DELETE /api/users/saved-properties/:propertyId
 * @access  Private
 */
const removeSavedProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;

    const user = await User.findById(req.user.id);
    await user.removeSavedProperty(propertyId);

    // Decrement saved count on property
    await Property.findByIdAndUpdate(propertyId, { $inc: { savedCount: -1 } });

    return sendSuccess(res, {
      message: 'Property removed from saved list',
      data: { savedProperties: user.savedProperties },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's saved properties
 * @route   GET /api/users/saved-properties
 * @access  Private
 */
const getSavedProperties = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'savedProperties',
        match: { isActive: true, isDeleted: false },
        populate: {
          path: 'listingAgent',
          select: 'name email phone photo',
        },
      });

    return sendSuccess(res, {
      message: 'Saved properties retrieved successfully',
      data: user.savedProperties,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Favorite a property
 * @route   POST /api/users/favorite-properties/:propertyId
 * @access  Private
 */
const favoriteProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;

    const property = await Property.findById(propertyId);
    if (!property) {
      throw AppError.notFound('Property not found');
    }

    const user = await User.findById(req.user.id);
    await user.addFavoriteProperty(propertyId);

    return sendSuccess(res, {
      message: 'Property added to favorites',
      data: { favoriteProperties: user.favoriteProperties },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove a property from favorites
 * @route   DELETE /api/users/favorite-properties/:propertyId
 * @access  Private
 */
const removeFavoriteProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;

    const user = await User.findById(req.user.id);
    await user.removeFavoriteProperty(propertyId);

    return sendSuccess(res, {
      message: 'Property removed from favorites',
      data: { favoriteProperties: user.favoriteProperties },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's favorite properties
 * @route   GET /api/users/favorite-properties
 * @access  Private
 */
const getFavoriteProperties = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'favoriteProperties',
        match: { isActive: true, isDeleted: false },
        populate: {
          path: 'listingAgent',
          select: 'name email phone photo',
        },
      });

    return sendSuccess(res, {
      message: 'Favorite properties retrieved successfully',
      data: user.favoriteProperties,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateProfile,
  deleteAccount,
  saveProperty,
  removeSavedProperty,
  getSavedProperties,
  favoriteProperty,
  removeFavoriteProperty,
  getFavoriteProperties,
};
