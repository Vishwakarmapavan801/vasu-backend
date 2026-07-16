const mongoose = require('mongoose');

/**
 * Inquiry Schema
 *
 * Lightweight model for tracking and aggregating inquiry statistics
 * for the admin dashboard. Works alongside the Contact model.
 */

const inquirySchema = new mongoose.Schema(
  {
    // Reference back to the full contact form submission
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
    },

    // ========== INQUIRY CLASSIFICATION ==========
    category: {
      type: String,
      enum: {
        values: [
          'general',
          'buying',
          'selling',
          'renting',
          'valuation',
          'mortgage',
          'agent-request',
          'other',
        ],
        message: 'Invalid category: {VALUE}',
      },
      required: [true, 'Inquiry category is required'],
      index: true,
    },

    // ========== SOURCE ==========
    source: {
      type: String,
      enum: ['website', 'landing-page', 'referral', 'social-media', 'email-campaign', 'other'],
      default: 'website',
    },

    // ========== METADATA ==========
    propertyType: {
      type: String,
    },
    budget: {
      type: Number,
    },
    urgency: {
      type: String,
      enum: ['immediate', '1-3-months', '3-6-months', '6-plus-months', 'just-browsing'],
      default: 'just-browsing',
    },
    location: {
      type: String,
    },

    // ========== STATUS ==========
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'converted', 'lost', 'closed'],
      default: 'new',
      index: true,
    },
    convertedToClient: {
      type: Boolean,
      default: false,
    },
    conversionValue: {
      type: Number,
      default: 0,
    },

    // ========== TIMELINE ==========
    firstRespondedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
    responseTime: {
      type: Number, // In hours
    },
  },
  {
    timestamps: true,
  }
);

// ========== INDEXES ==========
inquirySchema.index({ status: 1, category: 1 });
inquirySchema.index({ createdAt: -1 });
inquirySchema.index({ convertedToClient: 1 });

// ========== STATIC METHODS ==========

/**
 * Get inquiry statistics for admin dashboard
 * @returns {Promise<Object>} Statistics
 */
inquirySchema.statics.getStats = async function () {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalInquiries,
    newInquiries,
    totalConversions,
    categoryBreakdown,
    statusBreakdown,
    monthlyTrend,
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ status: 'new' }),
    this.countDocuments({ convertedToClient: true, createdAt: { $gte: thirtyDaysAgo } }),
    this.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    this.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    this.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    total: totalInquiries,
    newCount: newInquiries,
    conversions: totalConversions,
    conversionRate: totalInquiries > 0
      ? ((totalConversions / totalInquiries) * 100).toFixed(1)
      : 0,
    categoryBreakdown,
    statusBreakdown,
    monthlyTrend,
  };
};

const Inquiry = mongoose.model('Inquiry', inquirySchema);

module.exports = Inquiry;
