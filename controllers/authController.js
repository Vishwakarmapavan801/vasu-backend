const crypto = require('crypto');
const User = require('../models/User');
const config = require('../config/config');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const { sanitizeUser } = require('../utils/helpers');
const { sendEmail } = require('../services/emailService');

/**
 * Helper: Send JWT token in cookie and response
 */
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.signJwt();
  const sanitizedUser = sanitizeUser(user);

  // Cookie options
  const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax',
    maxAge: config.jwtCookieExpire * 24 * 60 * 60 * 1000, // Convert days to ms
  };

  res.cookie('token', token, cookieOptions);

  return sendSuccess(res, {
    statusCode,
    message: 'Authentication successful',
    data: {
      user: sanitizedUser,
      token,
    },
  });
};

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw AppError.conflict('An account with this email already exists');
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      phone,
    });

    return sendTokenResponse(user, 201, res);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      throw AppError.badRequest('Please provide email and password');
    }

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw AppError.unauthorized('Your account has been deactivated. Please contact support.');
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    return sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user / clear cookie
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res, next) => {
  try {
    res.cookie('token', 'none', {
      httpOnly: true,
      expires: new Date(Date.now() + 5 * 1000), // Expire in 5 seconds
    });

    return sendSuccess(res, {
      message: 'Logged out successfully',
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current logged-in user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('savedProperties', 'title price address city state images propertyType status')
      .populate('favoriteProperties', 'title price address city state images propertyType status');

    return sendSuccess(res, {
      message: 'User profile retrieved successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Forgot password - sends reset token via email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw AppError.badRequest('Please provide your email address');
    }

    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (!user) {
      return sendSuccess(res, {
        message: 'If an account with that email exists, a password reset link has been sent.',
        data: {},
      });
    }

    // Generate reset token
    const resetToken = user.generateResetToken();
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const host = req.hostname || req.get('host') || 'localhost:5000';
    const resetUrl = `${req.protocol}://${host}/api/auth/reset-password/${resetToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request - TheVasUrReality',
        html: `
          <h1>Password Reset Request</h1>
          <p>You requested a password reset for your TheVasUrReality account.</p>
          <p>Click the link below to reset your password. This link is valid for 1 hour.</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1a365d; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
          <p>If you did not request this, please ignore this email.</p>
          <p>Link: ${resetUrl}</p>
        `,
      });

      return sendSuccess(res, {
        message: 'If an account with that email exists, a password reset link has been sent.',
        data: {},
      });
    } catch (emailError) {
      // Reset token fields if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      throw AppError.internal('Email could not be sent. Please try again later.');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password
 * @route   PUT /api/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      throw AppError.badRequest('Password must be at least 8 characters');
    }

    // Hash the token from URL to match stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+password');

    if (!user) {
      throw AppError.badRequest('Invalid or expired reset token');
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update password (when user knows current password)
 * @route   PUT /api/auth/update-password
 * @access  Private
 */
const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw AppError.badRequest('Please provide current and new password');
    }

    if (newPassword.length < 8) {
      throw AppError.badRequest('New password must be at least 8 characters');
    }

    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw AppError.unauthorized('Current password is incorrect');
    }

    user.password = newPassword;
    await user.save();

    return sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  updatePassword,
};
