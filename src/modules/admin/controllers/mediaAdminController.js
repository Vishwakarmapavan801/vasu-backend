const asyncHandler = require('../../../middleware/asyncHandler');
const mediaAdminService = require('../services/mediaAdminService');
const auditService = require('../../../services/auditService');

const getOverview = asyncHandler(async (req, res) => {
  const overview = await mediaAdminService.getOverview();
  res.json(overview);
});

const getMedia = asyncHandler(async (req, res) => {
  const media = await mediaAdminService.getMedia(req.params.mediaKey);
  res.json(media);
});

const refreshMedia = asyncHandler(async (req, res) => {
  const result = await mediaAdminService.refreshMedia(req.params.mediaKey);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'media.refreshed',
    targetType: 'media',
    targetId: req.params.mediaKey,
  });
  res.json(result);
});

module.exports = { getOverview, getMedia, refreshMedia };
