const followerService = require('../services/followerService');

async function followAgent(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await followerService.isFollowing(id, req.user.id);
    if (existing) {
      return res.status(200).json({ success: true, message: 'Already following this agent' });
    }
    const follow = await followerService.follow(id, req.user.id);
    return res.status(201).json({ success: true, data: follow, message: 'Now following this agent' });
  } catch (err) { next(err); }
}

async function unfollowAgent(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await followerService.unfollow(id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Not currently following this agent' });
    }
    return res.status(200).json({ success: true, message: 'Unfollowed agent successfully' });
  } catch (err) { next(err); }
}

async function getFollowers(req, res, next) {
  try {
    const { id } = req.params;
    const result = await followerService.getFollowers(id);
    return res.status(200).json({ success: true, data: result, message: 'Followers retrieved successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  followAgent,
  unfollowAgent,
  getFollowers,
};
