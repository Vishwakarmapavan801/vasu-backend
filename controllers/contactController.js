const Contact = require('../models/Contact');
const Inquiry = require('../models/Inquiry');
const { sendSuccess, sendPaginated } = require('../utils/response');
const AppError = require('../utils/AppError');
const { paginate } = require('../utils/helpers');

/**
 * @desc    Submit a contact form / schedule tour / request info
 * @route   POST /api/contact
 * @access  Public
 */
const submitContact = async (req, res, next) => {
  try {
    const contact = await Contact.create({
      ...req.body,
      userAgent: req.get('User-Agent'),
      pageUrl: req.get('Referer'),
    });

    // Create a lightweight inquiry record for analytics
    await Inquiry.create({
      contactId: contact._id,
      category: mapInquiryCategory(contact.inquiryType),
      source: contact.source || 'website',
      status: 'new',
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Your inquiry has been submitted successfully. We will get back to you shortly.',
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all contact inquiries (admin/agent)
 * @route   GET /api/contact
 * @access  Private/Admin
 */
const getContacts = async (req, res, next) => {
  try {
    const filter = {};
    const { inquiryType, status, priority, page, limit, startDate, endDate } = req.query;

    if (inquiryType) filter.inquiryType = inquiryType;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const query = Contact.find(filter)
      .sort({ createdAt: -1 })
      .populate('property', 'title address city state price')
      .populate('assignedTo', 'name email');

    const result = await paginate(query, page, limit);

    return sendPaginated(res, {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      message: 'Contacts retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single contact by ID
 * @route   GET /api/contact/:id
 * @access  Private/Admin
 */
const getContactById = async (req, res, next) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('property', 'title address city state price images')
      .populate('assignedTo', 'name email phone')
      .populate('responses.respondedBy', 'name email');

    if (!contact) {
      throw AppError.notFound('Contact inquiry not found');
    }

    // Mark as read if it was new
    if (contact.status === 'new') {
      contact.status = 'read';
      await contact.save();
    }

    return sendSuccess(res, {
      message: 'Contact retrieved successfully',
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update contact status
 * @route   PUT /api/contact/:id/status
 * @access  Private/Admin
 */
const updateContactStatus = async (req, res, next) => {
  try {
    const { status, assignedTo } = req.body;

    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      throw AppError.notFound('Contact inquiry not found');
    }

    if (status) contact.status = status;
    if (assignedTo) {
      contact.assignedTo = assignedTo;
      contact.assignedDate = new Date();
    }

    await contact.save();

    return sendSuccess(res, {
      message: 'Contact status updated successfully',
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add response to a contact inquiry
 * @route   POST /api/contact/:id/respond
 * @access  Private/Admin
 */
const respondToContact = async (req, res, next) => {
  try {
    const { message, method } = req.body;

    if (!message) {
      throw AppError.badRequest('Response message is required');
    }

    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      throw AppError.notFound('Contact inquiry not found');
    }

    contact.responses.push({
      message,
      respondedBy: req.user.id,
      method: method || 'internal',
    });

    contact.status = 'replied';
    await contact.save();

    return sendSuccess(res, {
      message: 'Response added successfully',
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a contact inquiry
 * @route   DELETE /api/contact/:id
 * @access  Private/Admin
 */
const deleteContact = async (req, res, next) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);

    if (!contact) {
      throw AppError.notFound('Contact inquiry not found');
    }

    return sendSuccess(res, {
      message: 'Contact inquiry deleted successfully',
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Map inquiry types to analytics categories
 */
const mapInquiryCategory = (inquiryType) => {
  const categoryMap = {
    'general-contact': 'general',
    'schedule-tour': 'buying',
    'request-info': 'buying',
    'property-inquiry': 'buying',
    'mortgage-inquiry': 'mortgage',
    'valuation-request': 'valuation',
    'feedback': 'other',
    'complaint': 'other',
  };
  return categoryMap[inquiryType] || 'other';
};

module.exports = {
  submitContact,
  getContacts,
  getContactById,
  updateContactStatus,
  respondToContact,
  deleteContact,
};
