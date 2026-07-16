const mongoose = require('mongoose');

/**
 * Property Schema
 *
 * Comprehensive schema for real estate properties covering
 * residential, commercial, and land listings.
 */

const propertySchema = new mongoose.Schema(
  {
    // ========== BASIC INFORMATION ==========
    title: {
      type: String,
      required: [true, 'Property title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Property description is required'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Property price is required'],
      min: [0, 'Price cannot be negative'],
    },
    propertyType: {
      type: String,
      required: [true, 'Property type is required'],
      enum: {
        values: [
          'single-family',
          'multi-family',
          'condo',
          'townhouse',
          'apartment',
          'commercial',
          'land',
          'farm',
          'luxury',
          'vacation-rental',
        ],
        message: 'Invalid property type: {VALUE}',
      },
    },
    status: {
      type: String,
      required: [true, 'Property status is required'],
      enum: {
        values: [
          'for-sale',
          'for-rent',
          'sold',
          'pending',
          'under-contract',
          'off-market',
          'coming-soon',
        ],
        message: 'Invalid status: {VALUE}',
      },
      default: 'for-sale',
    },
    featured: {
      type: Boolean,
      default: false,
    },

    // ========== LOCATION ==========
    address: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      index: true,
    },
    zip: {
      type: String,
      required: [true, 'ZIP code is required'],
      trim: true,
      match: [/^\d{5}(-\d{4})?$/, 'Please provide a valid ZIP code'],
      index: true,
    },
    neighborhood: {
      type: String,
      trim: true,
    },
    county: {
      type: String,
      trim: true,
    },
    coordinates: {
      lat: {
        type: Number,
      },
      lng: {
        type: Number,
      },
    },

    // ========== PROPERTY DETAILS ==========
    bedrooms: {
      type: Number,
      min: [0, 'Bedrooms cannot be negative'],
      default: 0,
    },
    bathrooms: {
      type: Number,
      min: [0, 'Bathrooms cannot be negative'],
      default: 0,
    },
    halfBathrooms: {
      type: Number,
      min: [0, 'Half bathrooms cannot be negative'],
      default: 0,
    },
    squareFeet: {
      type: Number,
      min: [0, 'Square feet cannot be negative'],
    },
    lotSize: {
      type: Number, // in acres
      min: [0, 'Lot size cannot be negative'],
    },
    yearBuilt: {
      type: Number,
      min: [1600, 'Year built seems invalid'],
      max: [new Date().getFullYear() + 2, 'Year built cannot be in the distant future'],
    },
    stories: {
      type: Number,
      min: 0,
    },
    garage: {
      type: Number,
      min: 0,
      default: 0,
    },
    garageSize: {
      type: Number, // number of cars
      min: 0,
    },
    parking: {
      type: String,
      trim: true,
    },
    basement: {
      type: String,
      enum: ['finished', 'unfinished', 'partial', 'crawl-space', 'none'],
      default: 'none',
    },
    flooring: {
      type: [String],
      default: [],
    },
    heating: {
      type: String,
      trim: true,
    },
    cooling: {
      type: String,
      trim: true,
    },

    // ========== AMENITIES & FEATURES ==========
    amenities: {
      type: [String],
      default: [],
    },
    appliances: {
      type: [String],
      default: [],
    },
    exteriorFeatures: {
      type: [String],
      default: [],
    },
    interiorFeatures: {
      type: [String],
      default: [],
    },
    communityFeatures: {
      type: [String],
      default: [],
    },

    // ========== MEDIA ==========
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        alt: {
          type: String,
          default: 'Property image',
        },
        isFeatured: {
          type: Boolean,
          default: false,
        },
      },
    ],
    virtualTourUrl: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please provide a valid URL'],
    },
    videoUrl: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please provide a valid URL'],
    },

    // ========== LISTING DETAILS ==========
    listingId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
    },
    mlsId: {
      type: String,
      sparse: true,
    },
    mlsSource: {
      type: String,
    },
    listedDate: {
      type: Date,
    },
    expiresDate: {
      type: Date,
    },
    isComingSoon: {
      type: Boolean,
      default: false,
    },

    // ========== TAX & FINANCIAL ==========
    annualTax: {
      type: Number,
      min: 0,
    },
    hoaDues: {
      type: Number,
      min: 0,
    },
    hoaFeeFrequency: {
      type: String,
      enum: ['monthly', 'quarterly', 'annually', 'one-time', 'none'],
      default: 'none',
    },

    // ========== AGENT / OWNER ==========
    listingAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Listing agent is required'],
    },
    coListingAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ========== OPEN HOUSE ==========
    openHouse: [
      {
        date: Date,
        startTime: String,
        endTime: String,
        note: String,
      },
    ],

    // ========== SEO ==========
    seo: {
      metaTitle: String,
      metaDescription: String,
      metaKeywords: [String],
    },

    // ========== STATUS ==========
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      select: false,
    },
    views: {
      type: Number,
      default: 0,
    },
    savedCount: {
      type: Number,
      default: 0,
    },

    // ========== TIMESTAMPS ==========
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========== INDEXES ==========
propertySchema.index({ price: 1 });
propertySchema.index({ city: 1, state: 1 });
propertySchema.index({ propertyType: 1, status: 1 });
propertySchema.index({ bedrooms: 1, bathrooms: 1 });
propertySchema.index({ featured: 1, isActive: 1 });
propertySchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });

// Compound index for common search queries
propertySchema.index({ city: 1, propertyType: 1, status: 1, price: 1 });

// Full text search index
propertySchema.index({
  title: 'text',
  description: 'text',
  address: 'text',
  city: 'text',
  state: 'text',
  neighborhood: 'text',
});

// ========== MIDDLEWARE ==========

// Generate slug from title before saving
propertySchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      + '-' + Date.now();
  }
  next();
});

// ========== VIRTUAL PROPERTIES ==========

// Virtual for full address
propertySchema.virtual('fullAddress').get(function () {
  return `${this.address}, ${this.city}, ${this.state} ${this.zip}`;
});

// Virtual for price formatted
propertySchema.virtual('formattedPrice').get(function () {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(this.price);
});

// Virtual for price per square foot
propertySchema.virtual('pricePerSqft').get(function () {
  if (this.squareFeet && this.squareFeet > 0) {
    return Math.round(this.price / this.squareFeet);
  }
  return null;
});

// ========== INSTANCE METHODS ==========

/**
 * Increment view count
 */
propertySchema.methods.incrementViews = async function () {
  this.views += 1;
  return this.save({ validateBeforeSave: false });
};

/**
 * Toggle featured status
 */
propertySchema.methods.toggleFeatured = async function () {
  this.featured = !this.featured;
  return this.save({ validateBeforeSave: false });
};

/**
 * Soft delete property
 */
propertySchema.methods.softDelete = async function () {
  this.isActive = false;
  this.isDeleted = true;
  return this.save({ validateBeforeSave: false });
};

// ========== STATIC METHODS ==========

/**
 * Find featured properties
 */
propertySchema.statics.findFeatured = function (limit = 6) {
  return this.find({ featured: true, isActive: true, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('listingAgent', 'name email phone photo');
};

/**
 * Find similar properties
 */
propertySchema.statics.findSimilar = function (property, limit = 4) {
  return this.find({
    _id: { $ne: property._id },
    isActive: true,
    isDeleted: false,
    $or: [
      { city: property.city },
      { propertyType: property.propertyType },
      {
        price: {
          $gte: property.price * 0.7,
          $lte: property.price * 1.3,
        },
      },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

const Property = mongoose.model('Property', propertySchema);

module.exports = Property;
