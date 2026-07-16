const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/config');

/**
 * User Schema
 *
 * Handles authentication, role-based access, and user preferences
 * such as saved and favorite properties.
 */

const userSchema = new mongoose.Schema(
  {
    // ========== ACCOUNT INFORMATION ==========
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]*$/, 'Please provide a valid phone number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never return password by default
    },
    role: {
      type: String,
      enum: {
        values: ['user', 'agent', 'admin'],
        message: 'Invalid role: {VALUE}',
      },
      default: 'user',
    },

    // ========== PROFILE ==========
    photo: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      maxlength: [1000, 'Bio cannot exceed 1000 characters'],
    },
    company: {
      type: String,
      trim: true,
    },
    licenseNumber: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please provide a valid URL'],
    },
    socialMedia: {
      facebook: String,
      twitter: String,
      linkedin: String,
      instagram: String,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zip: String,
    },

    // ========== SAVED & FAVORITE PROPERTIES ==========
    savedProperties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
      },
    ],
    favoriteProperties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
      },
    ],

    // ========== AGENT SPECIFIC ==========
    agentRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    specialties: {
      type: [String],
      default: [],
    },
    serviceAreas: {
      type: [String],
      default: [],
    },
    isVerifiedAgent: {
      type: Boolean,
      default: false,
    },

    // ========== ACCOUNT STATUS ==========
    isActive: {
      type: Boolean,
      default: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },

    // ========== PASSWORD RESET ==========
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========== INDEXES ==========
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ 'address.city': 1, 'address.state': 1 });

// ========== MIDDLEWARE: Hash password before save ==========
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ========== INSTANCE METHODS ==========

/**
 * Sign JWT token for the user
 * @returns {string} JWT token
 */
userSchema.methods.signJwt = function () {
  return jwt.sign({ id: this._id, role: this.role }, config.jwtSecret, {
    expiresIn: config.jwtExpire,
  });
};

/**
 * Compare entered password with hashed password
 * @param {string} enteredPassword - Plain text password
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Generate password reset token
 * @returns {string} Reset token
 */
userSchema.methods.generateResetToken = function () {
  // Generate a random token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash the token and store it
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour

  return resetToken;
};

/**
 * Add property to saved list
 * @param {string} propertyId - Property ObjectId
 */
userSchema.methods.addSavedProperty = async function (propertyId) {
  if (!this.savedProperties.includes(propertyId)) {
    this.savedProperties.push(propertyId);
    await this.save();
  }
};

/**
 * Remove property from saved list
 * @param {string} propertyId - Property ObjectId
 */
userSchema.methods.removeSavedProperty = async function (propertyId) {
  this.savedProperties = this.savedProperties.filter(
    (id) => id.toString() !== propertyId.toString()
  );
  await this.save();
};

/**
 * Add property to favorites
 * @param {string} propertyId - Property ObjectId
 */
userSchema.methods.addFavoriteProperty = async function (propertyId) {
  if (!this.favoriteProperties.includes(propertyId)) {
    this.favoriteProperties.push(propertyId);
    await this.save();
  }
};

/**
 * Remove property from favorites
 * @param {string} propertyId - Property ObjectId
 */
userSchema.methods.removeFavoriteProperty = async function (propertyId) {
  this.favoriteProperties = this.favoriteProperties.filter(
    (id) => id.toString() !== propertyId.toString()
  );
  await this.save();
};

// ========== VIRTUAL PROPERTIES ==========

// Virtual for agent's active listings count
userSchema.virtual('activeListings', {
  ref: 'Property',
  localField: '_id',
  foreignField: 'listingAgent',
  count: true,
  match: { isActive: true, isDeleted: false },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
