const mongoose = require('mongoose');

/**
 * Contact / Inquiry Schema
 *
 * Handles all contact form submissions including:
 * - General contact form
 * - Schedule a tour requests
 * - Request information
 * - Property inquiries
 */

const contactSchema = new mongoose.Schema(
  {
    // ========== CONTACT TYPE ==========
    inquiryType: {
      type: String,
      required: [true, 'Inquiry type is required'],
      enum: {
        values: [
          'general-contact',
          'schedule-tour',
          'request-info',
          'property-inquiry',
          'mortgage-inquiry',
          'valuation-request',
          'feedback',
          'complaint',
        ],
        message: 'Invalid inquiry type: {VALUE}',
      },
      index: true,
    },

    // ========== CONTACT PERSON ==========
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    preferredContactMethod: {
      type: String,
      enum: ['email', 'phone', 'text', 'any'],
      default: 'any',
    },
    preferredContactTime: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'any'],
      default: 'any',
    },

    // ========== PROPERTY REFERENCE (optional) ==========
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
    },
    propertyTitle: {
      type: String,
      trim: true,
    },
    propertyAddress: {
      type: String,
      trim: true,
    },
    mlsId: {
      type: String,
    },

    // ========== INQUIRY DETAILS ==========
    subject: {
      type: String,
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      maxlength: [5000, 'Message cannot exceed 5000 characters'],
    },

    // ========== TOUR SCHEDULING (for schedule-tour type) ==========
    tourDate: {
      type: Date,
    },
    tourTime: {
      type: String,
    },
    tourType: {
      type: String,
      enum: ['in-person', 'virtual', 'video-call'],
    },
    numberOfGuests: {
      type: Number,
      min: 1,
      default: 1,
    },
    additionalNotes: {
      type: String,
      maxlength: [1000, 'Additional notes cannot exceed 1000 characters'],
    },

    // ========== BUDGET & REQUIREMENTS (for request-info type) ==========
    budgetMin: {
      type: Number,
      min: 0,
    },
    budgetMax: {
      type: Number,
      min: 0,
    },
    preferredBedrooms: {
      type: Number,
      min: 0,
    },
    preferredBathrooms: {
      type: Number,
      min: 0,
    },
    moveInDate: {
      type: Date,
    },
    isRelocating: {
      type: Boolean,
      default: false,
    },

    // ========== STATUS ==========
    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'closed', 'spam'],
      default: 'new',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },

    // ========== ASSIGNMENT ==========
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedDate: {
      type: Date,
    },

    // ========== RESPONSE TRACKING ==========
    responses: [
      {
        message: {
          type: String,
          required: true,
        },
        respondedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        respondedAt: {
          type: Date,
          default: Date.now,
        },
        method: {
          type: String,
          enum: ['email', 'phone', 'internal'],
          default: 'internal',
        },
      },
    ],

    // ========== SOURCE TRACKING ==========
    source: {
      type: String,
      enum: ['website', 'landing-page', 'referral', 'social-media', 'email-campaign', 'other'],
      default: 'website',
    },
    referrer: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    pageUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========== INDEXES ==========
contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ email: 1, createdAt: -1 });
contactSchema.index({ inquiryType: 1, status: 1 });

// ========== VIRTUAL PROPERTIES ==========

// Virtual for full name
contactSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for time elapsed since creation
contactSchema.virtual('timeSinceCreated').get(function () {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour(s) ago`;
  return `${diffDays} day(s) ago`;
});

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
