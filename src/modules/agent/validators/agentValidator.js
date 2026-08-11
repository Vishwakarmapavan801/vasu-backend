function validateRegistration(data) {
  const errors = [];

  if (!data.full_name || typeof data.full_name !== 'string' || !data.full_name.trim()) {
    errors.push('Full name is required');
  }

  if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Valid email is required');
  }

  if (!data.phone || typeof data.phone !== 'string' || !data.phone.trim()) {
    errors.push('Phone number is required');
  }

  if (!data.license_number || typeof data.license_number !== 'string' || !data.license_number.trim()) {
    errors.push('License number is required');
  }

  if (data.experience_years !== undefined && data.experience_years !== null) {
    const years = Number(data.experience_years);
    if (!Number.isInteger(years) || years < 0 || years > 100) {
      errors.push('Experience years must be an integer between 0 and 100');
    }
  }

  if (data.specialties && !Array.isArray(data.specialties)) {
    errors.push('Specialties must be an array');
  }

  if (data.languages && !Array.isArray(data.languages)) {
    errors.push('Languages must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateReview(data) {
  const errors = [];

  if (!data.agent_id) {
    errors.push('Agent ID is required');
  }

  if (data.rating === undefined || data.rating === null) {
    errors.push('Rating is required');
  } else {
    const rating = Number(data.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      errors.push('Rating must be an integer between 1 and 5');
    }
  }

  if (!data.review_text || typeof data.review_text !== 'string' || !data.review_text.trim()) {
    errors.push('Review text is required');
  }

  if (data.review_text && data.review_text.length > 10000) {
    errors.push('Review text must not exceed 10,000 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateTourRequest(data) {
  const errors = [];

  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('Name is required');
  }

  if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Valid email is required');
  }

  if (!data.preferred_date) {
    errors.push('Preferred date is required');
  } else {
    const date = new Date(data.preferred_date);
    if (isNaN(date.getTime())) {
      errors.push('Preferred date must be a valid date');
    }
  }

  if (!data.preferred_time) {
    errors.push('Preferred time is required');
  } else {
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    if (!timePattern.test(data.preferred_time)) {
      errors.push('Preferred time must be in HH:MM or HH:MM:SS format');
    }
  }

  if (!data.agent_id) {
    errors.push('Agent ID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validatePost(data) {
  const errors = [];

  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    errors.push('Title is required');
  }

  if (data.title && data.title.length > 500) {
    errors.push('Title must not exceed 500 characters');
  }

  if (!data.content || typeof data.content !== 'string' || !data.content.trim()) {
    errors.push('Content is required');
  }

  if (data.content && data.content.length > 100000) {
    errors.push('Content must not exceed 100,000 characters');
  }

  if (data.post_type && !['article', 'listing', 'testimonial', 'news', 'event'].includes(data.post_type)) {
    errors.push('Post type must be one of: article, listing, testimonial, news, event');
  }

  if (data.visibility && !['public', 'private', 'connections'].includes(data.visibility)) {
    errors.push('Visibility must be one of: public, private, connections');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const HTML_TAG_REGEX = /<\/?(?:script|iframe|embed|object|form|input|button|textarea|select|style|link|meta|base|frame|frameset|applet|marquee|svg|math|noscript|xss|on\w+)[^>]*>/gi;

function sanitizeHtml(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(HTML_TAG_REGEX, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*\S+/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

module.exports = {
  validateRegistration,
  validateReview,
  validateTourRequest,
  validatePost,
  sanitizeHtml,
};
