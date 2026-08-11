const asyncHandler = require('../../../middleware/asyncHandler');
const adminStatsService = require('../services/adminStatsService');
const mlsAdminService = require('../services/mlsAdminService');

const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await adminStatsService.getDashboard();
  res.json(dashboard);
});

const getListingCounts = asyncHandler(async (req, res) => {
  const counts = await adminStatsService.getMlsCounts();
  res.json({ success: true, listings: counts });
});

const getSyncStatus = asyncHandler(async (req, res) => {
  const status = await mlsAdminService.getStatus();
  res.json(status);
});

module.exports = { getDashboard, getListingCounts, getSyncStatus };
