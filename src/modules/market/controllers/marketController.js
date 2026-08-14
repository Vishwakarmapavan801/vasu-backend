const marketService = require('../services/marketService');
const overpassService = require('../services/overpassService');

async function getNeighborhoods(req, res, next) {
  try { const data = await marketService.getNeighborhoodStats(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getNeighborhood(req, res, next) {
  try { const data = await marketService.getNeighborhood(req.params.id); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getCityNeighborhoods(req, res, next) {
  try { const data = await marketService.getNeighborhoodByCity(req.params.city); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getZipCodes(req, res, next) {
  try { const data = await marketService.getZipStats(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getZipDetail(req, res, next) {
  try { const data = await marketService.getZipDetail(req.params.zip); if (!data) return res.status(404).json({ success: false, error: 'ZIP not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getSchools(req, res, next) {
  try { const data = await marketService.getSchools(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getSchool(req, res, next) {
  try { const data = await marketService.getSchool(req.params.id); if (!data) return res.status(404).json({ success: false, error: 'School not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getNeighborhoodSchools(req, res, next) {
  try { const data = await marketService.getSchoolsByNeighborhood(req.params.id); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getCommute(req, res, next) {
  try { const data = await marketService.getCommuteData(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getNearby(req, res, next) {
  try { const data = await marketService.getNearbyPlaces(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function proxyOverpass(req, res, next) {
  try {
    const query = req.body && req.body.query;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Missing Overpass query' });
    }
    const { elements, unavailable, stale } = await overpassService.queryOverpass(query);
    const payload = { success: true, elements };
    if (unavailable) payload.unavailable = true;
    // `stale` = real cached Overpass data served because the mirrors are
    // down/rate-limited. The UI shows a small notice, never an empty section.
    if (stale) payload.stale = true;
    return res.status(200).json(payload);
  } catch (err) {
    // The UI must never break and the Network tab must never show 502/429 for
    // Nearby Places. Every upstream failure is mapped to a graceful, cacheable
    // empty response with a flag the frontend can surface as "temporarily
    // unavailable" — the browser then has no reason to hit Overpass directly.
    const code = err && err.code;
    const retryAfter = (err && err.retryAfter) || 10;
    if (code === 'RATE_LIMITED') {
      console.warn(`[overpass] mirrors rate limited — graceful empty (retryAfter=${retryAfter}s)`);
      return res
        .status(200)
        .json({ success: true, elements: [], limited: true, retryAfter });
    }
    if (code === 'UNAVAILABLE' || code === 'ALL_MIRRORS_FAILED') {
      console.warn(`[overpass] upstream unavailable (${code}) — graceful empty`);
      return res
        .status(200)
        .json({ success: true, elements: [], unavailable: true, retryAfter });
    }
    console.error(`[overpass] unexpected proxy error: ${(err && err.message) || err}`);
    return res.status(200).json({ success: true, elements: [], unavailable: true });
  }
}

async function getTrending(req, res, next) {
  try { const data = await marketService.getTrendingTopics(req.query.topic_type || 'neighborhood', parseInt(req.query.limit) || 10); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getMarketSummary(req, res, next) {
  try { const data = await marketService.getMarketSummary(req.params.location, req.query.type || 'city'); if (!data) return res.status(404).json({ success: false, error: 'No data for location' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Local Intel
async function getLocalIntel(req, res, next) {
  try { const data = await marketService.getLocalIntel(req.params.locationType, req.params.locationName); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function upsertLocalIntel(req, res, next) {
  try { const data = await marketService.upsertLocalIntel(req.body); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getLocalIntelBySubdivision(req, res, next) {
  try { const data = await marketService.getLocalIntelBySubdivision(req.params.subdivision); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getLocalIntelByListing(req, res, next) {
  try { const data = await marketService.getLocalIntelByListing(req.params.listingKey); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function upsertLocalIntelMap(req, res, next) {
  try { const data = await marketService.upsertLocalIntelMap(req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

module.exports = { getNeighborhoods, getNeighborhood, getCityNeighborhoods, getZipCodes, getZipDetail, getSchools, getSchool, getNeighborhoodSchools, getCommute, getNearby, proxyOverpass, getTrending, getMarketSummary, getLocalIntel, upsertLocalIntel, getLocalIntelBySubdivision, getLocalIntelByListing, upsertLocalIntelMap };
