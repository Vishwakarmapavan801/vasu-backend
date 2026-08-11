const pool = require('../../../config/database');

// === Property Comparisons ===
async function getComparisons(userId) {
  const { rows } = await pool.query('SELECT * FROM property_comparisons WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows;
}

async function getComparison(id, userId) {
  const { rows } = await pool.query('SELECT * FROM property_comparisons WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

async function createComparison(userId, data) {
  const { name, listing_keys, property_data } = data;
  const { rows } = await pool.query('INSERT INTO property_comparisons (user_id, name, listing_keys, property_data) VALUES ($1,$2,$3,$4) RETURNING *', [userId, name || 'My Comparison', listing_keys || [], property_data || {}]);
  return rows[0];
}

async function updateComparison(id, userId, data) {
  const { name, listing_keys, property_data } = data;
  const { rows } = await pool.query('UPDATE property_comparisons SET name = COALESCE($1, name), listing_keys = COALESCE($2, listing_keys), property_data = COALESCE($3, property_data) WHERE id = $4 AND user_id = $5 RETURNING *', [name, listing_keys, property_data, id, userId]);
  return rows[0] || null;
}

async function deleteComparison(id, userId) {
  const { rowCount } = await pool.query('DELETE FROM property_comparisons WHERE id = $1 AND user_id = $2', [id, userId]);
  return rowCount > 0;
}

// === Mortgage Calculator ===
async function calculateMortgage(data) {
  const { property_price, down_payment, down_payment_pct, interest_rate, loan_term_years, property_tax_rate, annual_hoa, annual_insurance, pmi_rate } = data;
  const price = Number(property_price);
  const down = down_payment ? Number(down_payment) : (down_payment_pct ? price * (Number(down_payment_pct) / 100) : 0);
  const loanAmount = price - down;
  const rate = Number(interest_rate) / 100 / 12;
  const term = Number(loan_term_years) * 12;
  const monthlyPayment = loanAmount * (rate * Math.pow(1 + rate, term)) / (Math.pow(1 + rate, term) - 1);
  const monthlyTax = price * (Number(property_tax_rate || 0) / 100) / 12;
  const monthlyInsurance = Number(annual_insurance || 0) / 12;
  const monthlyHOA = Number(annual_hoa || 0) / 12;
  const monthlyPMI = (down < price * 0.2) ? loanAmount * (Number(pmi_rate || 0.005) / 12) : 0;
  const totalMonthly = monthlyPayment + monthlyTax + monthlyInsurance + monthlyHOA + monthlyPMI;
  const amortization = [];
  let balance = loanAmount;
  for (let i = 1; i <= term && i <= 360; i++) {
    const interest = balance * rate;
    const principal = monthlyPayment - interest;
    balance -= principal;
    amortization.push({ month: i, principal: Math.round(principal * 100) / 100, interest: Math.round(interest * 100) / 100, balance: Math.max(0, Math.round(balance * 100) / 100) });
    if (balance <= 0) break;
  }
  return {
    property_price: price, down_payment: down, down_payment_pct: (down / price) * 100,
    loan_amount: Math.round(loanAmount * 100) / 100, interest_rate: Number(interest_rate), loan_term_years: Number(loan_term_years),
    monthly_payment: Math.round(monthlyPayment * 100) / 100,
    monthly_principal_and_interest: Math.round(monthlyPayment * 100) / 100,
    monthly_taxes: Math.round(monthlyTax * 100) / 100,
    monthly_insurance: Math.round(monthlyInsurance * 100) / 100,
    monthly_hoa: Math.round(monthlyHOA * 100) / 100,
    monthly_pmi: Math.round(monthlyPMI * 100) / 100,
    total_monthly: Math.round(totalMonthly * 100) / 100,
    total_interest: Math.round((monthlyPayment * term - loanAmount) * 100) / 100,
    total_cost: Math.round((totalMonthly * term + down) * 100) / 100,
    amortization_schedule: amortization,
  };
}

async function saveMortgageRequest(userId, data, result) {
  const { rows } = await pool.query(`INSERT INTO mortgage_requests (user_id, property_price, down_payment, down_payment_pct, interest_rate, loan_term_years, property_tax_rate, annual_hoa, annual_insurance, pmi_rate, monthly_payment, principal_payment, interest_payment, tax_payment, insurance_payment, hoa_payment, pmi_payment, amortization_schedule) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [userId, result.property_price, result.down_payment, result.down_payment_pct, result.interest_rate, result.loan_term_years, data.property_tax_rate || 0, data.annual_hoa || 0, data.annual_insurance || 0, data.pmi_rate || 0, result.monthly_payment, result.monthly_principal_and_interest, result.monthly_taxes, result.monthly_insurance, result.monthly_hoa, result.monthly_pmi, JSON.stringify(result.amortization_schedule)]);
  return rows[0];
}

// === AI Features ===
async function saveAIRecommendation(userId, data) {
  const { recommendation_type, listing_keys, listing_data, score, reason } = data;
  const { rows } = await pool.query('INSERT INTO ai_recommendations (user_id, recommendation_type, listing_keys, listing_data, score, reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [userId, recommendation_type || 'property_match', listing_keys || [], listing_data || {}, score, reason]);
  return rows[0];
}

async function getAIRecommendations(userId, type, limit = 20) {
  const { rows } = await pool.query('SELECT * FROM ai_recommendations WHERE user_id = $1 AND ($2::text IS NULL OR recommendation_type = $2) ORDER BY score DESC NULLS LAST, created_at DESC LIMIT $3', [userId, type || null, limit]);
  return rows;
}

async function saveMarketReport(data) {
  const { report_type, location, location_type, title, summary, report_data, metrics, generated_for } = data;
  const { rows } = await pool.query('INSERT INTO ai_market_reports (report_type, location, location_type, title, summary, report_data, metrics, generated_for) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [report_type || 'market_summary', location, location_type || 'city', title, summary, report_data || {}, metrics || {}, generated_for || null]);
  return rows[0];
}

async function getMarketReports(location, locationType, limit = 10) {
  const { rows } = await pool.query('SELECT * FROM ai_market_reports WHERE location = $1 AND location_type = $2 ORDER BY generated_at DESC LIMIT $3', [location, locationType, limit]);
  return rows;
}

// === Analytics Events ===
async function trackEvent(data) {
  const { event_type, listing_key, user_id, agent_id, session_id, ip_address, metadata } = data;
  const { rows } = await pool.query('INSERT INTO analytics_events (event_type, listing_key, user_id, agent_id, session_id, ip_address, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [event_type, listing_key, user_id || null, agent_id || null, session_id || null, ip_address || null, metadata || {}]);
  return rows[0];
}

async function getAnalytics(params) {
  const { event_type, listing_key, agent_id, from, to, granularity = 'day', limit = 100 } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (event_type) { conditions.push(`event_type = $${idx++}`); vals.push(event_type); }
  if (listing_key) { conditions.push(`listing_key = $${idx++}`); vals.push(listing_key); }
  if (agent_id) { conditions.push(`agent_id = $${idx++}`); vals.push(agent_id); }
  if (from) { conditions.push(`created_at >= $${idx++}`); vals.push(from); }
  if (to) { conditions.push(`created_at <= $${idx++}`); vals.push(to); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const dateTrunc = granularity === 'hour' ? 'date_trunc(\'hour\', created_at)' : granularity === 'week' ? 'date_trunc(\'week\', created_at)' : granularity === 'month' ? 'date_trunc(\'month\', created_at)' : 'date_trunc(\'day\', created_at)';
  const { rows } = await pool.query(`SELECT ${dateTrunc} AS period, event_type, COUNT(*)::int AS count FROM analytics_events ${where} GROUP BY period, event_type ORDER BY period DESC LIMIT $${idx++}`, [...vals, limit]);
  return rows;
}

async function getListingAnalytics(listingKey) {
  const { rows } = await pool.query(`SELECT event_type, COUNT(*)::int AS count FROM analytics_events WHERE listing_key = $1 GROUP BY event_type`, [listingKey]);
  const totals = { views: 0, favorites: 0, shares: 0, inquiries: 0, tour_requests: 0 };
  rows.forEach(r => { if (totals[r.event_type] !== undefined) totals[r.event_type] = r.count; });
  return totals;
}

// === Listing Metadata ===
async function getListingMeta(listingKey) {
  const { rows } = await pool.query('SELECT * FROM listing_metadata WHERE listing_key = $1', [listingKey]);
  return rows[0] || null;
}

async function upsertListingMeta(listingKey, agentId, data) {
  const { custom_title, custom_description, is_featured, internal_notes, marketing_status, social_visibility, tags, seo_title, seo_description } = data;
  const { rows } = await pool.query(`INSERT INTO listing_metadata (listing_key, agent_id, custom_title, custom_description, is_featured, internal_notes, marketing_status, social_visibility, tags, seo_title, seo_description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (listing_key) DO UPDATE SET custom_title = COALESCE(EXCLUDED.custom_title, listing_metadata.custom_title), custom_description = COALESCE(EXCLUDED.custom_description, listing_metadata.custom_description), is_featured = COALESCE(EXCLUDED.is_featured, listing_metadata.is_featured), internal_notes = COALESCE(EXCLUDED.internal_notes, listing_metadata.internal_notes), marketing_status = COALESCE(EXCLUDED.marketing_status, listing_metadata.marketing_status), social_visibility = COALESCE(EXCLUDED.social_visibility, listing_metadata.social_visibility), tags = COALESCE(EXCLUDED.tags, listing_metadata.tags), seo_title = COALESCE(EXCLUDED.seo_title, listing_metadata.seo_title), seo_description = COALESCE(EXCLUDED.seo_description, listing_metadata.seo_description) RETURNING *`,
    [listingKey, agentId || null, custom_title, custom_description, is_featured || false, internal_notes, marketing_status || 'active', social_visibility || 'public', tags || [], seo_title, seo_description]);
  return rows[0];
}

// === Feed Events ===
async function getFeedEvents(params) {
  const { event_type, agent_id, limit = 50, offset = 0 } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (event_type) { conditions.push(`event_type = $${idx++}`); vals.push(event_type); }
  if (agent_id) { conditions.push(`agent_id = $${idx++}`); vals.push(agent_id); }
  const where = conditions.length ? 'AND ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT fe.*, a.full_name AS agent_name, a.profile_photo_url AS agent_photo FROM feed_events fe LEFT JOIN agents a ON a.id = fe.agent_id WHERE (fe.expires_at IS NULL OR fe.expires_at > NOW()) ${where} ORDER BY fe.is_pinned DESC, fe.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...vals, limit, offset]);
  return rows;
}

async function createFeedEvent(data) {
  const { event_type, agent_id, post_id, listing_key, title, description, media_url, metadata, is_pinned, expires_at } = data;
  const { rows } = await pool.query('INSERT INTO feed_events (event_type, agent_id, post_id, listing_key, title, description, media_url, metadata, is_pinned, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [event_type, agent_id, post_id, listing_key, title, description, media_url, metadata || {}, is_pinned || false, expires_at || null]);
  return rows[0];
}

// === Open Houses ===
async function getOpenHouses(params) {
  const { listing_key, agent_id, upcoming, limit = 50 } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (listing_key) { conditions.push(`listing_key = $${idx++}`); vals.push(listing_key); }
  if (agent_id) { conditions.push(`agent_id = $${idx++}`); vals.push(agent_id); }
  if (upcoming !== 'false') { conditions.push(`date >= CURRENT_DATE`); }
  conditions.push(`is_cancelled = FALSE`);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT oh.*, a.full_name AS agent_name FROM open_houses oh LEFT JOIN agents a ON a.id = oh.agent_id ${where} ORDER BY oh.date ASC, oh.start_time ASC LIMIT $${idx++}`, [...vals, limit]);
  return rows;
}

async function createOpenHouse(data) {
  const { listing_key, agent_id, date, start_time, end_time, description } = data;
  const { rows } = await pool.query('INSERT INTO open_houses (listing_key, agent_id, date, start_time, end_time, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [listing_key, agent_id, date, start_time, end_time, description]);
  return rows[0];
}

// === AI Investment Scores ===
async function getInvestmentScore(listingKey) {
  const { rows } = await pool.query('SELECT * FROM ai_investment_scores WHERE listing_key = $1', [listingKey]);
  return rows[0] || null;
}

async function upsertInvestmentScore(data) {
  const { listing_key, investment_score, appreciation_pot, rental_yield_est, cash_flow_est, neighborhood_health, school_quality, commute_value, inventory_trend, risk_level, summary } = data;
  const { rows } = await pool.query(`
    INSERT INTO ai_investment_scores (listing_key, investment_score, appreciation_pot, rental_yield_est, cash_flow_est, neighborhood_health, school_quality, commute_value, inventory_trend, risk_level, summary, last_computed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT (listing_key) DO UPDATE SET
      investment_score = COALESCE(EXCLUDED.investment_score, ai_investment_scores.investment_score),
      appreciation_pot = COALESCE(EXCLUDED.appreciation_pot, ai_investment_scores.appreciation_pot),
      rental_yield_est = COALESCE(EXCLUDED.rental_yield_est, ai_investment_scores.rental_yield_est),
      last_computed_at = NOW()
    RETURNING *`,
    [listing_key, investment_score, appreciation_pot, rental_yield_est, cash_flow_est, neighborhood_health, school_quality, commute_value, inventory_trend, risk_level, summary]
  );
  return rows[0];
}

// === AI Rental Estimates ===
async function getRentalEstimate(listingKey) {
  const { rows } = await pool.query('SELECT * FROM ai_rental_estimates WHERE listing_key = $1', [listingKey]);
  return rows[0] || null;
}

async function upsertRentalEstimate(data) {
  const { listing_key, estimated_rent, rent_low, rent_high, rent_per_sqft, cap_rate, cash_on_cash, confidence, comparable_rentals } = data;
  const { rows } = await pool.query(`
    INSERT INTO ai_rental_estimates (listing_key, estimated_rent, rent_low, rent_high, rent_per_sqft, cap_rate, cash_on_cash, confidence, comparable_rentals, last_computed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (listing_key) DO UPDATE SET
      estimated_rent = COALESCE(EXCLUDED.estimated_rent, ai_rental_estimates.estimated_rent),
      confidence = COALESCE(EXCLUDED.confidence, ai_rental_estimates.confidence),
      last_computed_at = NOW()
    RETURNING *`,
    [listing_key, estimated_rent, rent_low, rent_high, rent_per_sqft, cap_rate, cash_on_cash, confidence, comparable_rentals || {}]
  );
  return rows[0];
}

// === Analytics Daily ===
async function getAnalyticsDaily(agentId, query = {}) {
  const { days = 30, event_type } = query;
  const conditions = ['ad.agent_id = $1'];
  const params = [agentId];
  let idx = 1;
  if (event_type) { params.push(event_type); conditions.push(`ad.event_type = $${++idx}`); }
  conditions.push(`ad.date >= CURRENT_DATE - INTERVAL '1 day' * $${++idx}`);
  params.push(days);
  const where = 'WHERE ' + conditions.join(' AND ');
  const { rows } = await pool.query(`SELECT ad.* FROM analytics_daily ad ${where} ORDER BY ad.date DESC`, params);
  return rows;
}

async function upsertAnalyticsDaily(data) {
  const { date, agent_id, listing_key, event_type, count, unique_users } = data;
  const { rows } = await pool.query(`
    INSERT INTO analytics_daily (date, agent_id, listing_key, event_type, count, unique_users)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (date, agent_id, listing_key, event_type) DO UPDATE SET
      count = analytics_daily.count + EXCLUDED.count,
      unique_users = GREATEST(analytics_daily.unique_users, EXCLUDED.unique_users)
    RETURNING *`,
    [date, agent_id, listing_key, event_type, count || 1, unique_users || 0]
  );
  return rows[0];
}

module.exports = { getComparisons, getComparison, createComparison, updateComparison, deleteComparison, calculateMortgage, saveMortgageRequest, saveAIRecommendation, getAIRecommendations, saveMarketReport, getMarketReports, trackEvent, getAnalytics, getListingAnalytics, getListingMeta, upsertListingMeta, getFeedEvents, createFeedEvent, getOpenHouses, createOpenHouse, getInvestmentScore, upsertInvestmentScore, getRentalEstimate, upsertRentalEstimate, getAnalyticsDaily, upsertAnalyticsDaily };
