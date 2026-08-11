function calculateResponseRate(totalReplied, totalMessages) {
  if (!totalMessages || totalMessages <= 0) return 0;
  if (totalReplied >= totalMessages) return 100;
  return Math.round((totalReplied / totalMessages) * 100);
}

function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function paginate(page, limit, total) {
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const totalPages = Math.ceil(total / pageSize);
  const hasMore = currentPage * pageSize < total;

  return {
    page: currentPage,
    limit: pageSize,
    total,
    totalPages,
    hasMore,
  };
}

function formatAgentResponse(agent) {
  if (!agent) return null;

  const sensitiveFields = ['user_id', 'license_number', 'email', 'phone', 'whatsapp'];
  const cleaned = { ...agent };

  for (const field of sensitiveFields) {
    delete cleaned[field];
  }

  if (Array.isArray(cleaned.languages)) {
    cleaned.languages = cleaned.languages;
  } else if (typeof cleaned.languages === 'string') {
    try { cleaned.languages = JSON.parse(cleaned.languages); } catch { cleaned.languages = []; }
  } else {
    cleaned.languages = [];
  }

  if (Array.isArray(cleaned.specialties)) {
    cleaned.specialties = cleaned.specialties;
  } else if (typeof cleaned.specialties === 'string') {
    try { cleaned.specialties = JSON.parse(cleaned.specialties); } catch { cleaned.specialties = []; }
  } else {
    cleaned.specialties = [];
  }

  if (Array.isArray(cleaned.areas_served)) {
    cleaned.areas_served = cleaned.areas_served;
  } else if (typeof cleaned.areas_served === 'string') {
    try { cleaned.areas_served = JSON.parse(cleaned.areas_served); } catch { cleaned.areas_served = []; }
  } else {
    cleaned.areas_served = [];
  }

  return cleaned;
}

module.exports = {
  calculateResponseRate,
  slugify,
  paginate,
  formatAgentResponse,
};
