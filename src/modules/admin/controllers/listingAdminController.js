const asyncHandler = require('../../../middleware/asyncHandler');
const listingAdminService = require('../services/listingAdminService');
const auditService = require('../../../services/auditService');

const search = asyncHandler(async (req, res) => {
  const result = await listingAdminService.search(req.query);
  res.json(result);
});

const getDetail = asyncHandler(async (req, res) => {
  const { listingKey } = req.params;
  const detail = await listingAdminService.getDetail(listingKey);
  if (!detail) {
    return res.status(404).json({ success: false, error: 'Listing not found' });
  }
  res.json({ success: true, data: detail });
});

const setFeatured = asyncHandler(async (req, res) => {
  const { listingKey } = req.params;
  const { featured, priority } = req.body;
  const meta = await listingAdminService.setFeatured(listingKey, { featured, priority }, req.user.id);
  if (!meta) {
    return res.status(404).json({ success: false, error: 'Listing meta not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: featured ? 'listing.featured' : 'listing.unfeatured',
    targetType: 'listing',
    targetId: listingKey,
    details: { priority: meta.featured_priority ?? null },
  });
  res.json({ success: true, data: meta });
});

const setArchived = asyncHandler(async (req, res) => {
  const { listingKey } = req.params;
  const { archived } = req.body;
  const meta = await listingAdminService.setArchived(listingKey, { archived }, req.user.id);
  if (!meta) {
    return res.status(404).json({ success: false, error: 'Listing meta not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: archived ? 'listing.archived' : 'listing.unarchived',
    targetType: 'listing',
    targetId: listingKey,
  });
  res.json({ success: true, data: meta });
});

const refreshPhotos = asyncHandler(async (req, res) => {
  const { listingKey } = req.params;
  const result = await listingAdminService.refreshPhotos(listingKey);
  res.json({ success: true, data: result });
});

module.exports = { search, getDetail, setFeatured, setArchived, refreshPhotos };
