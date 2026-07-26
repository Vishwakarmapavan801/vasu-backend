const statsService = require('../services/statsService');

async function getCompanyStats(req, res, next) {
  try {
    const result = await statsService.getCompanyStats();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getCompanyStats };
